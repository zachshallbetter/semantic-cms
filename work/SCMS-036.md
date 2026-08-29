# SCMS-036 — Evidence and attestations as Canon records

**Intent ref:** PROJECT_INTENT.md · **Epic:** E3 · **Effect class:** E1
**Assigned by:** owner sign-off, closing the repair half of scms-blocker-003 / SH-13 / #35.
**State:** Ready → Claimed → Done (closing state at bottom)

## The defect, for the third time

One failure has now been recorded three times in this system: **the party being gated supplied the
value that decided the gate.** It appeared as `promotionAuthority`, a string a caller wrote about
itself (NR-scms-005); as the consequence profile, whose `promotionVerification` a caller could set
to `none` (NR-scms-006); and here as the attestation itself — `promoteHandler` trusted
`input.attestation.disposition === "QUALIFIED"` because a caller passed it.

## Why moving attestations alone would have been theatre

`qualify()` takes its evidence as an argument. A caller who cannot forge a disposition forges the
evidence it is computed from, and the hole moves rather than closes. So both halves moved:

- `qualification.record-evidence@1` lands evidence in Canon.
- `qualification.attest@1` reads evidence **from Canon, never from input**, computes the
  disposition, and lands the attestation.
- `content.promote@1` reads the attestation **from Canon, never from input**.

Every gate input now arrives through a contract that required authority to execute.

One consequence is worth noticing: an attestation can no longer be *borrowed*. It used to arrive in
the request, so a mismatched one had to be detected and produced `conflict`; it is now looked up by
the requested revision, so presenting the wrong one is not expressible. The check became
unnecessary rather than merely reliable.

## Two things building it forced

**Evidence must declare its freshness.** Evidence is genuinely *observed* — it reports what a check
found — and rr-rsp says observed records carry time bounds. The convenient move was to classify it
as `declared` and skip them. That would have been choosing a provenance class to avoid saying how
long the evidence is good for, which turns EQP's `STALE` validity into a label nobody can compute.
So `observedAt` and `expiresAt` are required, and recording evidence without them is refused.

**Re-attestation supersedes.** The first version appended a second record under the same subject,
and both stayed current, so the lookup returned whichever came first — the withdrawn verdict. A
re-evaluation nobody can read is worse than no re-evaluation, because the gate keeps answering with
a verdict that has been retracted. Caught by the composed spine, which is what a composed spine is
for.

## What this does NOT close

An owner can still record their own evidence and attest to their own work. That is **SH-13**, and it
is a different question — who may evaluate, and what independence a consequence profile should
demand. It is policy, and settling it by implementation would be an implementer choosing the
system's ethics. This item closes forgery; it does not pretend to close self-attestation.

## Closing state

**Done — no gate in the system now reads its own deciding input from the caller.**
