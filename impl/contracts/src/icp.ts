/**
 * ICP vocabulary, imported as declared bindings (SCMS-012).
 *
 * These are the pinned protocol's own strings (§5.1 canonical instance states,
 * the outcome classes, the recovery actions, and the §10.5 change-receipt
 * shape), transcribed from the pin and re-verified against source this cycle.
 * ICP owns consequential-interaction semantics; nothing here redefines or
 * extends them, and no value outside these vocabularies may be emitted.
 */

export const INSTANCE_STATES = [
  "declared", "ready", "started", "validating", "blocked", "verification_required",
  "verifying", "queued", "processing", "needs_review", "conflicted", "partially_completed",
  "completed", "failed", "compensating", "reversed", "cancelled", "expired", "abandoned", "closed",
] as const;
export type InstanceState = (typeof INSTANCE_STATES)[number];

export const OUTCOME_CLASSES = [
  "completed", "accepted", "queued", "partially_completed", "invalid_input", "not_found",
  "verification_required", "needs_evidence", "needs_review", "blocked", "conflict",
  "dependency_failure", "background_failure", "system_failure", "cancelled", "expired",
  "abandoned", "reversed", "compensated", "unknown",
] as const;
export type OutcomeClass = (typeof OUTCOME_CLASSES)[number];

export const RECOVERY_ACTIONS = [
  "focus_field", "select_file", "replace_evidence", "retry_operation", "retry_later",
  "refresh_record", "open_record", "review_conflict", "reauthenticate", "provide_proof",
  "request_access", "start_workflow", "resume_workflow", "contact_support", "download_report",
  "undo", "compensate", "cancel",
] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

/** ICP: reversibility is distinct from recovery. */
export type Reversibility = "reversible" | "compensatable" | "irreversible" | "unknown";

/** Verification level derives from consequence, never UI preference (DESIGN.md §5). */
export type VerificationLevel = "none" | "acknowledge" | "confirm" | "reauthenticate" | "prove";

/** DESIGN.md §5 effect classes. */
export type EffectClass = "E0" | "E1" | "E2" | "E3" | "E4";

export const VERIFICATION_FOR_EFFECT: Record<EffectClass, VerificationLevel> = Object.assign(Object.create(null), {
  E0: "none", E1: "none", E2: "confirm", E3: "reauthenticate", E4: "prove",
});

export interface Recovery {
  action: RecoveryAction;
  /** ICP: "a recovery action MUST carry enough typed data ... to execute it." */
  data: Record<string, string>;
}

/** ICP §10.5 change receipt, minus fields this narrow path has no source for. */
export interface ChangeReceipt {
  id: string;
  interaction: string;
  contractVersion: string;
  instanceId: string;
  requestId: string;
  actor: { id: string; role: string };
  resource: { type: string; id: string };
  beforeVersion: string | null;
  afterVersion: string;
  changes: Array<{ path: string; before: unknown; after: unknown }>;
  occurredAt: string;
  reversibility: Reversibility;
  compensationInteraction?: string;
  integrity: { algorithm: "sha-256"; digest: string };
}
