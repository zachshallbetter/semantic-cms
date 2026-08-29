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
const ACCESS_RANK: Record<AccessLevel, number> = { public: 0, member: 1, owner: 2, admin: 3 };

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
    if (!(def.minAuthority in ACCESS_RANK)) {
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
    if (!(ctx.authority in ACCESS_RANK)) {
      return {
        instanceId: ctx.instanceId, outcome: "blocked", states: [...states, "blocked"],
        verification: "none",
        recovery: [{ action: "reauthenticate", data: { need: "a proven authority" } }],
        detail: "execution context carries no proven authority; refusing rather than assuming one",
      };
    }
    if (ACCESS_RANK[ctx.authority] < ACCESS_RANK[entry.def.minAuthority]) {
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
  const nextBody = { ...before, ...input.changes };

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

  const changes = Object.keys(input.changes).sort().map((k) => ({
    path: `/body/${k}`, before: before[k], after: (input.changes as Record<string, unknown>)[k],
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
  r.register(CONTENT_REVISE, reviseHandler);
  return r;
}
