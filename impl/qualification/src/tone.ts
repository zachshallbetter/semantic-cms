/**
 * Evidence tone (SCMS-072, epic E5 · the Field plane).
 *
 * SPS's `morphologyFor` had two halves, and SCMS-008 sent them to two owners:
 * **selection** to SSS, **container form** to the expression recipe. The half
 * that went to neither is *evidence density* — SPS's observation that a
 * grouping should reflect **how much evidence actually satisfies its lens**.
 *
 * It answers a real question. A shelf declaring "recent work" backed by one
 * stale record and one backed by twelve fresh ones are structurally identical,
 * and a reader deserves to be able to tell them apart.
 *
 * **The boundary this must not cross.** Tone is a *semantic* property, so it may
 * say `fading` and may not say *smaller*, *greyer*, *later* or *spoken last*.
 * SSS-INV-008 forbids semantic priority prescribing graphical presentation and
 * SSS-INV-009 puts morphology outside SSS entirely; the same applies here, which
 * is why nothing in this module names a container form and why a vector asserts
 * no expression's morphology varies with tone.
 *
 * **Why it lives here and not in the resolver.** `freeze()` carries
 * `publicationState` into a snapshot and not `evidenceState`, so the resolver
 * cannot see evidence and should not: it resolves from a frozen snapshot, and
 * evidence lives in Canon. Tone is therefore computed *over* a resolved
 * surface's membership rather than during resolution.
 */
import type { EvidenceRecord } from "./eqp.ts";

/** SPS's vocabulary, plus the honest fourth case it does not name. */
export type EvidenceTone = "earned" | "steady" | "fading" | "unevidenced";

export interface ToneReading {
  tone: EvidenceTone;
  /** Members carrying at least one VALID, satisfied piece of evidence. */
  supported: number;
  /** Members whose only evidence is STALE or SUPERSEDED — it existed and lapsed. */
  lapsed: number;
  total: number;
  /** Why this reading, in the vocabulary a person can check against the records. */
  basis: string;
}

const SATISFIED = new Set(["PASS", "PARTIAL"]);
const LAPSED = new Set(["STALE", "SUPERSEDED"]);

/**
 * Read the tone of a group.
 *
 * `lookup` returns the evidence held for one member. It is injected rather than
 * queried so this stays pure and so it can only see what the caller already
 * resolved — the same look-up-never-look-around discipline `deriveFeed` holds.
 */
export function evidenceTone(
  members: readonly string[],
  lookup: (subject: string) => readonly EvidenceRecord[],
): ToneReading {
  const total = members.length;
  if (total === 0) {
    return { tone: "unevidenced", supported: 0, lapsed: 0, total: 0, basis: "no members" };
  }

  let supported = 0;
  let lapsed = 0;
  for (const m of members) {
    const records = lookup(m);
    if (records.some((r) => r.validity === "VALID" && SATISFIED.has(r.result))) {
      supported++;
    } else if (records.some((r) => LAPSED.has(r.validity))) {
      // Evidence that existed and lapsed is a different state from evidence
      // that never existed — the distinction §6 keeps between an unrun check
      // and a failed one, applied to time.
      lapsed++;
    }
  }

  if (supported === 0 && lapsed === 0) {
    return { tone: "unevidenced", supported, lapsed, total,
             basis: `${total} member(s), none carrying evidence` };
  }
  // Lapsed evidence dominates: a grouping mostly held up by expired checks is
  // fading whatever its raw count, because the count is the thing that has
  // stopped being true.
  if (lapsed > supported) {
    return { tone: "fading", supported, lapsed, total,
             basis: `${lapsed} of ${total} rest on lapsed evidence` };
  }
  if (supported === total) {
    return { tone: "earned", supported, lapsed, total,
             basis: `all ${total} member(s) carry valid, satisfied evidence` };
  }
  return { tone: "steady", supported, lapsed, total,
           basis: `${supported} of ${total} carry valid evidence` };
}
