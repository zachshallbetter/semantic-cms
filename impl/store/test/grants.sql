-- SCMS-057 conformance: the guarantees are grants, so the proof is refusal.
\set ON_ERROR_STOP off
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- Seed as owner.
INSERT INTO canon_record VALUES
  ('sha256:' || repeat('a',64), 'art-1', 'scms-0.1', '{}', '{"kind":"declared"}', 'public',
   '{"kind":"Content"}', 'draft','unqualified','unpublished','unpropagated', NULL, 'tester', now());
INSERT INTO canon_receipt (action, subject_id, revision, prior_revision, actor, prev_hash, hash)
VALUES ('append','art-1','sha256:' || repeat('a',64), NULL, 'tester','sha256:'||repeat('0',64),'sha256:'||repeat('1',64));

SELECT '1 emission-on-receipt: ' || CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END FROM canon_outbox;

SET ROLE scms_runtime;

-- Every one of these MUST fail. A success here means the guarantee is prose.
UPDATE canon_record SET actor = 'tamper';
\if :ERROR
  SELECT '2 UPDATE canon_record refused: PASS';
\else
  SELECT '2 UPDATE canon_record refused: FAIL — the row was rewritten';
\endif

DELETE FROM canon_record;
\if :ERROR
  SELECT '3 DELETE canon_record refused: PASS';
\else
  SELECT '3 DELETE canon_record refused: FAIL';
\endif

UPDATE canon_receipt SET hash = 'sha256:' || repeat('9',64);
\if :ERROR
  SELECT '4 UPDATE canon_receipt refused: PASS';
\else
  SELECT '4 UPDATE canon_receipt refused: FAIL — the chain is forgeable';
\endif

DELETE FROM canon_receipt;
\if :ERROR
  SELECT '5 DELETE canon_receipt refused: PASS';
\else
  SELECT '5 DELETE canon_receipt refused: FAIL';
\endif

-- The runtime may CAUSE an emission and may not WRITE one.
INSERT INTO canon_outbox (receipt_seq, action, subject_id, revision, prior_revision, actor, minimum_access)
VALUES (999,'append','forged','sha256:'||repeat('f',64),NULL,'attacker','public');
\if :ERROR
  SELECT '6 forged outbox row refused: PASS';
\else
  SELECT '6 forged outbox row refused: FAIL — the stream is forgeable';
\endif

DELETE FROM canon_outbox;
\if :ERROR
  SELECT '7 DELETE canon_outbox refused: PASS';
\else
  SELECT '7 DELETE canon_outbox refused: FAIL — history is erasable';
\endif

-- ...but the runtime CAN append, and appending emits.
INSERT INTO canon_record VALUES
  ('sha256:' || repeat('b',64), 'art-1', 'scms-0.1', '{}', '{"kind":"declared"}', 'public',
   '{"kind":"Content"}', 'draft','unqualified','unpublished','unpropagated',
   'sha256:' || repeat('a',64), 'runtime', now());
INSERT INTO canon_receipt (action, subject_id, revision, prior_revision, actor, prev_hash, hash)
VALUES ('supersede','art-1','sha256:' || repeat('b',64), 'sha256:'||repeat('a',64), 'runtime',
        'sha256:'||repeat('1',64), 'sha256:'||repeat('2',64));
\if :ERROR
  SELECT '8 runtime CAN append: FAIL — append-only means append';
\else
  SELECT '8 runtime CAN append: PASS';
\endif

SELECT '9 append emitted: ' || CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL (' || count(*) || ')' END FROM canon_outbox;

-- Derived, never stored (SCMS-056).
SELECT '10 current excludes superseded: ' ||
  CASE WHEN (SELECT count(*) FROM canon_current) = 1
        AND (SELECT revision FROM canon_current) = 'sha256:' || repeat('b',64)
  THEN 'PASS' ELSE 'FAIL' END;

-- Two successors for one predecessor must be impossible, or `current` forks.
INSERT INTO canon_record VALUES
  ('sha256:' || repeat('c',64), 'art-1', 'scms-0.1', '{}', '{"kind":"declared"}', 'public',
   '{"kind":"Content"}', 'draft','unqualified','unpublished','unpropagated',
   'sha256:' || repeat('a',64), 'runtime', now());
\if :ERROR
  SELECT '11 second successor refused: PASS';
\else
  SELECT '11 second successor refused: FAIL — current() is ambiguous';
\endif

-- Revocation is derived from the receipt chain, with no row rewritten.
INSERT INTO canon_receipt (action, subject_id, revision, prior_revision, actor, prev_hash, hash)
VALUES ('revoke','art-1','sha256:' || repeat('b',64), 'sha256:'||repeat('b',64), 'runtime',
        'sha256:'||repeat('2',64), 'sha256:'||repeat('3',64));

SELECT '12 revoke removes it from current, by derivation: ' ||
  CASE WHEN (SELECT count(*) FROM canon_current) = 0 THEN 'PASS' ELSE 'FAIL' END;

SELECT '13 the revoked row itself is untouched: ' ||
  CASE WHEN (SELECT actor FROM canon_record WHERE revision = 'sha256:' || repeat('b',64)) = 'runtime'
  THEN 'PASS' ELSE 'FAIL' END;

SELECT '14 revoking emitted too: ' ||
  CASE WHEN (SELECT count(*) FROM canon_outbox) = 3 THEN 'PASS' ELSE 'FAIL' END;

-- Every receipt has exactly one event and vice versa — parity, in the store.
SELECT '15 receipt/event parity: ' ||
  CASE WHEN (SELECT count(*) FROM canon_receipt) = (SELECT count(*) FROM canon_outbox)
        AND NOT EXISTS (SELECT 1 FROM canon_receipt r
                        LEFT JOIN canon_outbox o ON o.receipt_seq = r.seq WHERE o.event_id IS NULL)
  THEN 'PASS' ELSE 'FAIL' END;

RESET ROLE;

-- ── Blobs (SCMS-060) ───────────────────────────────────────────────────────
SET ROLE scms_runtime;

INSERT INTO canon_blob (digest, bytes, byte_length, media_type)
VALUES ('sha256:' || repeat('7',64), 'hello canon', 11, 'text/markdown');
\if :ERROR
  SELECT '16 runtime CAN store a blob: FAIL';
\else
  SELECT '16 runtime CAN store a blob: PASS';
\endif

-- The digest is the key, so identical bytes are one row rather than two.
INSERT INTO canon_blob (digest, bytes, byte_length, media_type)
VALUES ('sha256:' || repeat('7',64), 'hello canon', 11, 'text/markdown');
\if :ERROR
  SELECT '17 same digest stored twice is refused (dedup by naming): PASS';
\else
  SELECT '17 same digest stored twice is refused (dedup by naming): FAIL';
\endif

-- A length that disagrees with the bytes would let the manifest and the store
-- drift apart silently.
INSERT INTO canon_blob (digest, bytes, byte_length, media_type)
VALUES ('sha256:' || repeat('8',64), 'four', 99, 'text/plain');
\if :ERROR
  SELECT '18 length must agree with the bytes: PASS';
\else
  SELECT '18 length must agree with the bytes: FAIL';
\endif

UPDATE canon_blob SET bytes = 'tampered';
\if :ERROR
  SELECT '19 blobs are immutable by grant: PASS';
\else
  SELECT '19 blobs are immutable by grant: FAIL — the name would be a lie';
\endif

DELETE FROM canon_blob;
\if :ERROR
  SELECT '20 blobs cannot be deleted by the runtime: PASS';
\else
  SELECT '20 blobs cannot be deleted by the runtime: FAIL';
\endif

SELECT '21 an unreferenced blob is identifiable, not removed: ' ||
  CASE WHEN (SELECT count(*) FROM canon_blob_unreferenced) = 1 THEN 'PASS' ELSE 'FAIL' END;

RESET ROLE;
