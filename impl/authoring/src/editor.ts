/**
 * The authoring surface (SCMS-031, epic E12 · closes SH-8's first slice).
 *
 * The owner named the gap plainly: there is no UI. This slice builds the half of
 * a UI that can be specified before any visual decision — **what the editor is
 * allowed to offer, to whom** — and leaves the visual language open.
 *
 * The editor is not an application that talks to the CMS. It is a
 * ResolvedSurface with a `purpose: "edit"` and a set of operations, per the
 * owner's ratification that agent and authoring slices are ResolvedSurfaces
 * (DESIGN.md §11). Two rules do the work:
 *
 * 1. **The editor offers only what the registry implements.** Operations are
 *    DERIVED from the live ContractRegistry, never listed by hand. A button for
 *    an unimplemented contract is the declaration-without-a-consumer failure
 *    (NR-scms-004) rendered as an affordance — the worst form, because a person
 *    acts on it. Deriving them makes the gap unrepresentable instead of
 *    forbidden.
 *
 * 2. **Offering is not permission.** Exposure and authority are separate
 *    (SSS-INV-010): the surface says what a person may be shown, the registry
 *    decides what may happen. A withheld operation is not merely hidden — it is
 *    still refused if invoked directly, because the surface was never the guard.
 *
 * One consequence worth stating: a consequential operation may not be offered
 * with the same weight as a reversible one. `content.promote` is E3 and
 * compensatable; `content.revise` is E1 and reversible. The surface carries that
 * difference so an expression cannot present publishing as saving, and refuses
 * to offer a compensatable operation whose compensation is absent — you do not
 * get to offer the door without the way back.
 */
import type { ContractRegistry, ContractDefinition } from "../../contracts/src/runtime.ts";
import type { AccessLevel, SurfaceRequest, OperationDeclaration } from "../../surface-resolver/src/types.ts";

/** Authoring intent, in the vocabulary a person uses — mapped to contracts, not invented. */
export type AuthoringIntent = "revise" | "promote" | "unpublish";

const INTENT_CONTRACTS: Record<AuthoringIntent, string> = {
  revise: "icp:interaction/content.revise",
  promote: "icp:interaction/content.promote",
  unpublish: "icp:interaction/content.unpublish",
};

/** Authoring is owner work; the minimum access is stated once, here. */
const INTENT_MIN_ACCESS: Record<AuthoringIntent, AccessLevel> = {
  revise: "owner", promote: "owner", unpublish: "owner",
};

export interface OfferedOperation {
  intent: AuthoringIntent;
  contract: string;
  /** From the contract's own declaration — the editor does not re-classify effects. */
  effectClass: string;
  reversibility: string;
  /** Present when the contract declares one; a compensatable op without it is not offered. */
  compensation?: string;
  minAccess: AccessLevel;
}

export interface AuthoringOffer {
  operations: OfferedOperation[];
  /** Intents deliberately not offered, with the reason — a gap must be legible. */
  withheld: Array<{ intent: AuthoringIntent; reason: "unimplemented" | "missing-compensation" }>;
}

/**
 * Derive what an editor may offer from what the registry actually implements.
 * Nothing here consults access: this is the *catalogue*, and gating happens at
 * resolution, where the reader's access lives.
 */
export function deriveOffer(registry: ContractRegistry): AuthoringOffer {
  const byId = new Map<string, ContractDefinition>();
  for (const def of registry.list()) byId.set(def.id, def);

  const operations: OfferedOperation[] = [];
  const withheld: AuthoringOffer["withheld"] = [];

  for (const intent of Object.keys(INTENT_CONTRACTS) as AuthoringIntent[]) {
    const def = byId.get(INTENT_CONTRACTS[intent]);
    if (!def) {
      // The editor may not offer what nothing implements.
      withheld.push({ intent, reason: "unimplemented" });
      continue;
    }
    if (def.reversibility === "compensatable" && !byId.has(def.compensationInteraction ?? "")) {
      // A compensatable operation whose compensation is absent is a one-way door
      // wearing a two-way label. Withhold it rather than offer a promise the
      // system cannot keep.
      withheld.push({ intent, reason: "missing-compensation" });
      continue;
    }
    operations.push({
      intent, contract: def.id,
      effectClass: def.effectClass, reversibility: def.reversibility,
      ...(def.compensationInteraction === undefined ? {} : { compensation: def.compensationInteraction }),
      minAccess: INTENT_MIN_ACCESS[intent],
    });
  }
  return { operations, withheld: withheld.sort((a, b) => a.intent.localeCompare(b.intent)) };
}

/**
 * The editor surface request for one subject. `purpose: "edit"` is the SSS
 * vocabulary term, so the resolver's own purpose rules apply — the editor gets
 * no private resolution path.
 */
export function editorRequest(
  subject: string, access: AccessLevel, offer: AuthoringOffer,
): SurfaceRequest {
  const operations: OperationDeclaration[] = offer.operations.map((op) => ({
    id: op.contract,
    exposure: "available",
    minAccess: op.minAccess,
  }));
  return {
    profile: "focus", purpose: "edit", subject, access,
    lens: { traversal: { radius: 1 } },
    operations,
  };
}
