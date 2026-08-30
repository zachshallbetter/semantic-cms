/**
 * Contract registry and execution runtime (SCMS-012).
 *
 * DESIGN.md §5: no persistent mutation executes outside a registered contract.
 * This package holds the only write path into the Canon journal used by the
 * narrow end-to-end proof: callers execute a registered contract; the runtime
 * drives the ICP instance lifecycle, maps every terminal state to an ICP
 * outcome class, attaches typed recovery to blocking outcomes, and emits an
 * ICP §10.5 change receipt for each landed mutation.
 *
 * Deliberately absent (canonical v1 governs; PR #28 proposals are pending):
 * changeCertainty, receiptSurrogate, rendered-set-bounded deletion.
 */
import { createHash } from "node:crypto";
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { Envelope } from "../../canon/src/envelope.ts";
import { canonicalJson } from "../../canon/src/envelope.ts";
import type {
  ChangeReceipt, EffectClass, InstanceState, OutcomeClass, Recovery, Reversibility, VerificationLevel,
} from "./icp.ts";
import { VERIFICATION_FOR_EFFECT } from "./icp.ts";
import type { AccessLevel } from "../../surface-resolver/src/types.ts";

/**
 * Authority ordering. Identical to the resolver's access ordering on purpose:
 * one vocabulary for "who is this", used for both what may be SEEN and what may
 * be DONE, so the two can never quietly disagree.
 */
const ACCESS_RANK: Record<AccessLevel, number> = Object.assign(Object.create(null), { public: 0, member: 1, owner: 2, admin: 3 });

/**
 * Resolve an authority string to its rank, or `null` if it is not one of the
 * four declared levels.
 *
 * This exists because the obvious spelling of the check was wrong in a way that
 * failed OPEN (NR-scms-006). `level in ACCESS_RANK` walks the prototype chain,
 * so `"constructor"` and `"toString"` passed as authorities; the lookup then
 * yielded a *function*, and `function < number` is `NaN < number`, which is
 * `false` — so the guard concluded "not less than required" and allowed the
 * write. A caller claiming authority `"constructor"` executed owner-gated
 * contracts exactly as the owner.
 *
 * Two independent defences, because one was demonstrably not enough:
 * `Object.hasOwn` refuses inherited keys, and the numeric check refuses
 * anything that did not resolve to a real number. A malformed authority now
 * produces `null`, and every caller of this function treats `null` as refusal.
 */
function rankOf(level: unknown): number | null {
  if (typeof level !== "string") return null;
  if (!Object.hasOwn(ACCESS_RANK, level)) return null;
  const rank = ACCESS_RANK[level as AccessLevel];
  return typeof rank === "number" && Number.isFinite(rank) ? rank : null;
}

export interface ContractDefinition {
  /** ICP identity grammar: stable id + semver. */
  id: string;
  version: string;
  /**
   * The minimum PROVEN authority an actor must hold for this contract to run.
   *
   * Required, and checked at registration: a contract that does not state its
   * authority cannot be registered at all. Per-handler authorization is what
   * failed before (NR-scms-005) — every handler recorded the actor in its
   * receipt and no handler checked it, so provenance was mistaken for a gate.
   * Stating it on the definition and enforcing it in one place makes the
   * omission unrepresentable rather than merely discouraged.
   */
  minAuthority: AccessLevel;
  effectClass: EffectClass;
  reversibility: Reversibility;
  resourceType: string;
  compensationInteraction?: string;
}

export interface ExecutionRequest {
  contract: string;
  requestId: string;
  actor: { id: string; role: string };
  input: Record<string, unknown>;
}

export interface ExecutionResult {
  instanceId: string;
  outcome: OutcomeClass;
  /** Ordered lifecycle states this instance actually passed through. */
  states: InstanceState[];
  verification: VerificationLevel;
  receipt?: ChangeReceipt;
  recovery: Recovery[];
  /** Present when an outcome is terminal with no recovery (ICP requires one or the other). */
  terminalReason?: string;
  detail?: string;
}

export interface CreateInput {
  subjectId: string;
  contentKind: string;
  /** The authored body. State is NOT taken from here — see the handler. */
  body: Record<string, unknown>;
  minimumAccess: AccessLevel;
  /** Where this record came from, for the provenance lattice. */
  source: string;
}

export interface ReviseInput {
  subjectId: string;
  /** The revision the caller believes is current — optimistic concurrency. */
  expectedRevision: string;
  /** Draft body changes, applied over the current envelope's body. */
  changes: Record<string, unknown>;
}

/** A contract handler is pure with respect to everything except the journal. */
type Handler = (
  journal: CanonJournal, req: ExecutionRequest, def: ContractDefinition, ctx: ExecutionContext,
) => ExecutionResult;

export interface BodyFinding { code: string; at: string; detail: string }

export interface ExecutionContext {
  /** Explicit clock — no ambient time (resolver-purity discipline extends here). */
  occurredAt: string;
  instanceId: string;
  /**
   * The authority the CALLER has actually proven, established by whatever
   * authenticated the request.
   *
   * It lives on the context and not in `req.input` deliberately: input is
   * supplied by the party being authorized, so an authority read from it is a
   * claim, not a fact. NR-scms-005 is exactly that mistake — promotion accepted
   * a `promotionAuthority` string the caller wrote about themselves.
   */
  authority: AccessLevel;
  /**
   * Optional conformance hook (SCMS-022). When supplied, a governed write
   * validates the resulting body against its declared content type and refuses
   * non-conformant content. Passed as a FUNCTION so this package never depends
   * on the schema package — the caller wires the two together.
   *
   * Opt-in by design: not every content kind has a declared type yet, and
   * enforcing one that does not exist would be a false claim.
   */
  validateBody?: (body: Record<string, unknown>) => BodyFinding[];
}

export class ContractRegistry {
  #defs = new Map<string, { def: ContractDefinition; handler: Handler }>();

  register(def: ContractDefinition, handler: Handler): void {
    // Types are stripped, not checked, at runtime — so the requirement is
    // enforced here or not at all.
    if (rankOf(def.minAuthority) === null) {
      throw new Error(
        `contract '${def.id}' must declare a valid minAuthority before it can be registered`,
      );
    }
    this.#defs.set(`${def.id}@${def.version}`, { def, handler });
  }

  list(): ContractDefinition[] {
    return [...this.#defs.values()].map((v) => v.def);
  }

  /** The only write path: an unregistered id cannot mutate anything. */
  execute(journal: CanonJournal, req: ExecutionRequest, ctx: ExecutionContext): ExecutionResult {
    const states: InstanceState[] = ["declared"];
    const entry = this.#defs.get(req.contract);
    if (!entry) {
      return {
        instanceId: ctx.instanceId, outcome: "not_found", states: [...states, "failed"],
        verification: "none", recovery: [],
        terminalReason: `no registered contract '${req.contract}'`,
      };
    }
    // AUTHORIZE — one gate, before any handler runs. A handler cannot forget
    // this check, because a handler never gets the chance to make it.
    const held = rankOf(ctx.authority);
    const required = rankOf(entry.def.minAuthority);
    if (held === null || required === null) {
      return {
        instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"],
        verification: "none",
        recovery: [{ action: "reauthenticate", data: { need: "a proven authority" } }],
        detail: "execution context carries no valid proven authority; refusing rather than assuming one",
      };
    }
    if (held < required) {
      return {
        instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"],
        verification: "none",
        recovery: [{ action: "request_access", data: {
          required: entry.def.minAuthority, held: ctx.authority, contract: entry.def.id,
        } }],
        detail: `'${entry.def.id}' requires ${entry.def.minAuthority} authority; caller holds ${ctx.authority}`,
      };
    }

    return entry.handler(journal, req, entry.def, ctx);
  }
}

const RECEIPT_DOMAIN = "scms:change-receipt:v1 ";

export function receiptDigest(r: Omit<ChangeReceipt, "integrity">): string {
  return createHash("sha256").update(RECEIPT_DOMAIN + canonicalJson(r), "utf8").digest("hex");
}

export const CONTENT_REVISE: ContractDefinition = {
  id: "icp:interaction/content.revise",
  version: "1.0.0",
  minAuthority: "owner",
  effectClass: "E1",            // reversible draft mutation
  reversibility: "reversible",
  resourceType: "content",
};

/**
 * content.create@1 — bring a record into existence.
 *
 * This contract did not exist until SCMS-041, and its absence was a hole big
 * enough to drive the whole system through: `content.revise` requires an
 * existing revision, so the ONLY way content had ever entered Canon was a
 * direct `journal.append` — which DESIGN.md §5 forbids outside the Canon,
 * Contracts and Qualification packages. Every migration and every vector did it
 * from a test file, where the write-boundary gate exempts fixture construction,
 * so nothing ever surfaced the fact that **creation was not a governed
 * operation at all**. A system that can revise, publish, unpublish and merge but
 * cannot lawfully create is a system whose content arrives by magic.
 *
 * Effect class E1: a created record is unpublished by construction, so it makes
 * no external commitment and nothing needs compensating.
 */
/**
 * Apply a change set to a body.
 *
 * Plain objects merge recursively; everything else replaces. The recursion is
 * the whole point: an earlier version spread the change set over the body at the
 * top level only, so a change to one slot replaced the entire `slots` map and
 * **silently deleted every sibling slot** — editing an article's body destroyed
 * its title and summary, and the write reported `completed` (NR-scms-008).
 *
 * Two deliberate choices:
 *
 * - **Arrays replace wholesale.** A slot's parts are authored as a unit; merging
 *   two versions of a value array positionally is exactly the silent-winner
 *   behaviour §8.5 forbids outside the free lane.
 * - **Removal is explicit.** An unmentioned key is left alone; `null` removes.
 *   Deleting by omission would make every partial edit a potential deletion,
 *   which is how this defect happened in the first place.
 */
export function mergeChanges(
  before: Record<string, unknown>, changes: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...before };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) { delete out[k]; continue; }
    const prior = out[k];
    if (isPlainObject(v) && isPlainObject(prior)) {
      out[k] = mergeChanges(prior as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Leaf paths that differ between two bodies, in sorted order. */
function changedPaths(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  const walk = (a: unknown, b: unknown, prefix: string) => {
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
      for (const k of keys) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k],
             prefix ? `${prefix}/${k}` : k);
      }
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) paths.add(prefix);
  };
  walk(before, after, "");
  return [...paths].sort();
}

function valueAt(obj: unknown, path: string): unknown {
  return path.split("/").reduce<unknown>(
    (acc, k) => (isPlainObject(acc) ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

export const CONTENT_CREATE: ContractDefinition = {
  id: "icp:interaction/content.create",
  version: "1.0.0",
  minAuthority: "owner",
  effectClass: "E1",
  reversibility: "reversible",
  resourceType: "content",
};

export const createHandler: Handler = (journal, req, def, ctx) => {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const verification = VERIFICATION_FOR_EFFECT[def.effectClass];
  const input = req.input as unknown as CreateInput;

  const missing = (["subjectId", "contentKind", "body", "minimumAccess", "source"] as const)
    .filter((k) => input?.[k] === undefined || input[k] === null);
  if (missing.length > 0) {
    return {
      instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"],
      verification, recovery: missing.map((field) => ({ action: "focus_field" as const, data: { field } })),
      detail: `missing: ${missing.join(", ")}`,
    };
  }

  // Identity is not overwritable. Creating over an existing subject would make
  // "create" a silent replace, which is the destructive edit §3.4 forbids.
  const existing = journal.current().find((e) => e.envelope.subjectId === input.subjectId);
  if (existing) {
    return {
      instanceId: ctx.instanceId, outcome: "conflict", states: [...states, "conflicted"], verification,
      recovery: [
        { action: "open_record", data: { subjectId: input.subjectId, revision: existing.envelope.revision! } },
        { action: "review_conflict", data: { reason: "subject already exists; revise it instead" } },
      ],
      detail: `subject '${input.subjectId}' already exists`,
    };
  }

  const body = { ...input.body, kind: "Content", contentKind: input.contentKind };

  if (ctx.validateBody) {
    const findings = ctx.validateBody(body);
    if (findings.length > 0) {
      return {
        instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"], verification,
        recovery: findings.map((f) => ({ action: "focus_field" as const, data: { field: f.at, detail: f.detail } })),
        detail: `declared type rejected the body: ${findings.map((f) => f.code).join(", ")}`,
      };
    }
  }

  states.push("processing");
  const envelope: Envelope = {
    schemaVersion: "scms-0.1",
    subjectId: input.subjectId,
    compatibility: { protocol: "scms-0.1", subjectSchema: `${input.contentKind}@1` },
    provenance: { kind: "declared", authority: "project.owner", source: input.source },
    minimumAccess: input.minimumAccess,
    body: body as Envelope["body"],
    // State is fixed by the contract, never read from input. A caller must not
    // be able to create a record that arrives already published or already
    // qualified — publication is promotion's business and evidence is earned.
    // This is the same rule NR-scms-006 was written about: the party being
    // gated does not get to supply the value that decides the gate.
    state: {
      semanticMaturity: "draft",
      evidenceState: "unqualified",
      publicationState: "unpublished",
      deliveryState: "unpropagated",
    },
  };

  const landed = journal.append(envelope, req.actor.id);
  const receiptBase = {
    interaction: def.id, instanceId: ctx.instanceId, requestId: req.requestId,
    actor: req.actor, resource: { type: def.resourceType, id: input.subjectId },
    before: null, after: landed.envelope.revision!, occurredAt: ctx.occurredAt,
  };
  return {
    instanceId: ctx.instanceId, outcome: "completed", states: [...states, "completed"], verification,
    receipt: { ...receiptBase, integrity: receiptDigest(receiptBase as never) } as never,
    recovery: [],
  };
};

/**
 * content.revise@1 — land a draft revision.
 * Lifecycle: declared → ready → started → validating → processing → terminal.
 */
export const reviseHandler: Handler = (journal, req, def, ctx) => {
  const states: InstanceState[] = ["declared", "ready", "started", "validating"];
  const verification = VERIFICATION_FOR_EFFECT[def.effectClass];
  const input = req.input as unknown as ReviseInput;

  // VALIDATE — invalid input is a typed outcome with a field to focus, not an error.
  const missing = (["subjectId", "expectedRevision", "changes"] as const)
    .filter((k) => input?.[k] === undefined || input[k] === null);
  if (missing.length > 0) {
    return {
      instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"],
      verification, recovery: missing.map((field) => ({ action: "focus_field" as const, data: { field } })),
      detail: `missing: ${missing.join(", ")}`,
    };
  }

  const prior = journal.get(input.expectedRevision);
  if (!prior) {
    return {
      instanceId: ctx.instanceId, outcome: "not_found", states: [...states, "failed"], verification,
      recovery: [{ action: "refresh_record", data: { subjectId: input.subjectId } }],
      detail: `unknown revision ${input.expectedRevision}`,
    };
  }

  // CONCURRENCY — the loser gets the current revision and executable recovery,
  // never a silent overwrite, and nothing is written.
  const current = journal.current().find((e) => e.envelope.subjectId === input.subjectId);
  if (!current || current.envelope.revision !== input.expectedRevision) {
    return {
      instanceId: ctx.instanceId, outcome: "conflict", states: [...states, "conflicted"], verification,
      recovery: [
        { action: "refresh_record", data: { subjectId: input.subjectId, currentRevision: current?.envelope.revision ?? "none" } },
        { action: "review_conflict", data: { expected: input.expectedRevision, actual: current?.envelope.revision ?? "none" } },
      ],
      detail: "expectedRevision is not current",
    };
  }

  // PROCESS — supersede appends; the predecessor stays readable as history.
  states.push("processing");
  const before = prior.envelope.body as Record<string, unknown>;
  const nextBody = mergeChanges(before, input.changes);

  // Declared types are load-bearing: where a content type is declared, a
  // governed write may not land content that violates it (SCMS-022).
  if (ctx.validateBody) {
    const findings = ctx.validateBody(nextBody);
    if (findings.length > 0) {
      return {
        instanceId: ctx.instanceId, outcome: "invalid_input", states: [...states, "failed"], verification,
        recovery: findings.map((f) => ({ action: "focus_field" as const, data: { field: f.at, code: f.code } })),
        detail: findings.map((f) => f.detail).join("; "),
      };
    }
  }
  const next: Envelope = { ...prior.envelope, body: nextBody as Envelope["body"], revision: undefined };
  const landed = journal.supersede(input.expectedRevision, next, req.actor.id);

  // The receipt reports what actually changed, at the granularity it changed.
  // Reporting `/body/slots` for a body edit would say "the slots changed" and
  // hide which one, which is the same loss of resolution the shallow merge had.
  const changes = changedPaths(before, nextBody).map((path) => ({
    path: `/body/${path}`, before: valueAt(before, path), after: valueAt(nextBody, path),
  }));
  const base: Omit<ChangeReceipt, "integrity"> = {
    id: `rcpt_${ctx.instanceId}`,
    interaction: def.id,
    contractVersion: def.version,
    instanceId: ctx.instanceId,
    requestId: req.requestId,
    actor: req.actor,
    resource: { type: def.resourceType, id: input.subjectId },
    beforeVersion: input.expectedRevision,
    afterVersion: landed.envelope.revision!,
    changes,
    occurredAt: ctx.occurredAt,
    reversibility: def.reversibility,
    ...(def.compensationInteraction ? { compensationInteraction: def.compensationInteraction } : {}),
  };
  const receipt: ChangeReceipt = { ...base, integrity: { algorithm: "sha-256", digest: receiptDigest(base) } };

  return {
    instanceId: ctx.instanceId, outcome: "completed", states: [...states, "completed"],
    verification, receipt, recovery: [],
  };
};

/** A registry with the narrow path's single contract registered. */
export function narrowPathRegistry(): ContractRegistry {
  const r = new ContractRegistry();
  r.register(CONTENT_CREATE, createHandler);
  r.register(CONTENT_REVISE, reviseHandler);
  return r;
}
