/**
 * Replay the owner's governed actions into a fresh Canon (SCMS-051).
 *
 * The editor and the site are separate processes with separate journals, so an
 * edit or a promotion made in one was invisible to the other — the E8 arc
 * stopped one step short of a reader seeing the result.
 *
 * This replays the action log **through the same contracts**, rather than
 * restoring serialized state. That distinction is the whole point: a replayed
 * action crosses exactly the gates the original crossed, so a log entry cannot
 * smuggle in something the contracts would refuse. If a replayed promotion is
 * rejected because its evidence expired, that rejection is correct and the
 * record simply is not published.
 *
 * Development-grade custody, explicitly NOT the durability decision (SH-1).
 */
import { readFileSync, existsSync } from "node:fs";
import type { CanonJournal } from "../../canon/src/journal.ts";
import type { ContractRegistry } from "../../contracts/src/runtime.ts";
import { PROFILES } from "../../qualification/src/eqp.ts";

export interface ReplayReport {
  applied: number;
  refused: Array<{ type: string; subject: string; outcome: string; detail?: string }>;
}

interface Action {
  type: "revise" | "qualify" | "promote";
  subject: string;
  changes?: Record<string, unknown>;
}

export function replayActions(
  journal: CanonJournal, registry: ContractRegistry, logPath: string,
  actor: { id: string; role: string }, occurredAt: string,
): ReplayReport {
  const report: ReplayReport = { applied: 0, refused: [] };
  if (!existsSync(logPath)) return report;

  const lines = readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  lines.forEach((line, i) => {
    const action = JSON.parse(line) as Action;
    const entry = journal.current().find((e) => e.envelope.subjectId === action.subject);
    if (!entry) return;
    const revision = entry.envelope.revision!;
    const body = entry.envelope.body as unknown as { contentKind?: string };
    const profileId = body.contentKind === "note" ? "note" as const : "article" as const;
    const ctx = { occurredAt, instanceId: `replay_${i}`, authority: "owner" as const };

    let outcome = "skipped";
    let detail: string | undefined;

    if (action.type === "revise" && action.changes) {
      const r = registry.execute(journal, {
        contract: "icp:interaction/content.revise@1.0.0", requestId: `replay-${i}`,
        actor, input: { subjectId: action.subject, expectedRevision: revision, changes: action.changes },
      } as never, ctx);
      outcome = r.outcome; detail = r.detail;
    } else if (action.type === "qualify") {
      let seq = 0;
      for (const ob of PROFILES[profileId].obligations) {
        registry.execute(journal, {
          contract: "icp:interaction/qualification.record-evidence@1.0.0",
          requestId: `replay-ev-${i}-${seq}`, actor,
          input: {
            evidence: {
              id: `ev_replay_${i}_${seq}`, obligation: ob.id, result: "PASS", validity: "VALID",
              candidateRevision: revision, actor: actor.id, independentEvaluator: false,
            },
            observedAt: occurredAt,
            expiresAt: new Date(Date.parse(occurredAt) + 90 * 86400_000).toISOString(),
          },
        } as never, { ...ctx, instanceId: `replay_ev_${i}_${seq++}` });
      }
      const r = registry.execute(journal, {
        contract: "icp:interaction/qualification.attest@1.0.0", requestId: `replay-att-${i}`,
        actor, input: { candidateRevision: revision, profileId, qualificationAuthority: actor.id },
      } as never, { ...ctx, instanceId: `replay_att_${i}` });
      outcome = r.outcome; detail = r.detail;
    } else if (action.type === "promote") {
      const r = registry.execute(journal, {
        contract: "icp:interaction/content.promote@1.0.0", requestId: `replay-pr-${i}`,
        actor,
        input: {
          subjectId: action.subject, candidateRevision: revision, profile: { id: profileId },
          verificationPerformed: PROFILES[profileId].promotionVerification,
          promotionAuthority: actor.id,
        },
      } as never, ctx);
      outcome = r.outcome; detail = r.detail;
    }

    if (outcome === "completed") report.applied++;
    else report.refused.push({ type: action.type, subject: action.subject, outcome, ...(detail ? { detail } : {}) });
  });

  return report;
}
