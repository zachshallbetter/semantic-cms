-- Canon in Postgres (SCMS-057).
--
-- DESIGN.md §13's sketch, made real:
--
--   "Store: Postgres. Revision and receipt tables append-only *by grant*
--    (no UPDATE/DELETE for the runtime role)."
--
-- The point of this file is that append-only stops being something the code
-- promises and becomes something the database refuses. Every guarantee below is
-- a grant or a constraint, not a convention — because this project's recurring
-- failure is a rule stated in prose beside code that only partly provides it.
--
-- Two roles:
--   scms_owner    — owns the schema, runs migrations, may do anything.
--   scms_runtime  — what the application connects as. INSERT and SELECT only.
--
-- Idempotent, so re-running is safe. There is no migration runner yet, and
-- pretending otherwise would be the gap zach-core also has.

-- ── Roles ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scms_runtime') THEN
    CREATE ROLE scms_runtime NOLOGIN;
  END IF;
END $$;

-- ── Records ────────────────────────────────────────────────────────────────
-- The revision IS the content hash, so identity and integrity are the same
-- column. A duplicate insert of identical content collides on the primary key,
-- which is the idempotency the in-memory journal implements by hand.
CREATE TABLE IF NOT EXISTS canon_record (
  revision           text PRIMARY KEY CHECK (revision LIKE 'sha256:%'),
  subject_id         text NOT NULL,
  schema_version     text NOT NULL,
  compatibility      jsonb NOT NULL,
  provenance         jsonb NOT NULL,
  minimum_access     text NOT NULL CHECK (minimum_access IN ('public','member','owner','admin')),
  body               jsonb NOT NULL,
  semantic_maturity  text NOT NULL,
  evidence_state     text NOT NULL,
  publication_state  text NOT NULL,
  delivery_state     text NOT NULL,
  -- The successor carries the pointer; the predecessor is never touched
  -- (SCMS-056 / SH-23). Self-reference is rejected rather than merely unlikely.
  supersedes         text REFERENCES canon_record(revision) CHECK (supersedes IS DISTINCT FROM revision),
  actor              text NOT NULL,
  landed_at          timestamptz NOT NULL
);

-- One successor per predecessor. Without this, two rows could both claim to
-- supersede the same revision and `current` would be ambiguous — a fork with no
-- merge, which §8.5 does not permit outside the branching P7 defers.
CREATE UNIQUE INDEX IF NOT EXISTS canon_record_one_successor
  ON canon_record (supersedes) WHERE supersedes IS NOT NULL;

CREATE INDEX IF NOT EXISTS canon_record_subject ON canon_record (subject_id);

-- ── Receipts ───────────────────────────────────────────────────────────────
-- Ordering is carried by the hash chain, not by seq contiguity: each receipt
-- names its predecessor's hash. seq gaps are therefore harmless, which matters
-- because a rolled-back transaction consumes a sequence value.
CREATE TABLE IF NOT EXISTS canon_receipt (
  seq            bigserial PRIMARY KEY,
  action         text NOT NULL CHECK (action IN ('append','supersede','revoke')),
  subject_id     text NOT NULL,
  revision       text NOT NULL REFERENCES canon_record(revision),
  prior_revision text,
  actor          text NOT NULL,
  prev_hash      text NOT NULL,
  hash           text NOT NULL UNIQUE
);

-- Revocation is read off this chain (SCMS-056), so it needs to be cheap.
CREATE INDEX IF NOT EXISTS canon_receipt_revoke
  ON canon_receipt (revision) WHERE action = 'revoke';

-- ── Outbox ─────────────────────────────────────────────────────────────────
-- Written ONLY by the trigger below. The runtime role has no INSERT here, so
-- the stream cannot be forged: an event exists if and only if a receipt does.
CREATE TABLE IF NOT EXISTS canon_outbox (
  event_id       bigserial PRIMARY KEY,
  receipt_seq    bigint NOT NULL UNIQUE REFERENCES canon_receipt(seq),
  action         text NOT NULL,
  subject_id     text NOT NULL,
  revision       text NOT NULL,
  prior_revision text,
  actor          text NOT NULL,
  minimum_access text NOT NULL
);

-- "Nothing happens without an emission" (§8.1) enforced by the store rather
-- than by the process. SECURITY DEFINER so the runtime role can cause an
-- emission without being able to write one.
CREATE OR REPLACE FUNCTION canon_emit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE acc text;
BEGIN
  SELECT minimum_access INTO acc FROM canon_record WHERE revision = NEW.revision;
  INSERT INTO canon_outbox (receipt_seq, action, subject_id, revision, prior_revision, actor, minimum_access)
  VALUES (NEW.seq, NEW.action, NEW.subject_id, NEW.revision, NEW.prior_revision, NEW.actor, acc);
  -- The native channel §8.1 requires, so fan-out needs no second infrastructure.
  PERFORM pg_notify('canon_outbox', NEW.seq::text);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS canon_emit_on_receipt ON canon_receipt;
CREATE TRIGGER canon_emit_on_receipt AFTER INSERT ON canon_receipt
  FOR EACH ROW EXECUTE FUNCTION canon_emit();

-- ── Derived views (SCMS-056: never stored) ─────────────────────────────────
CREATE OR REPLACE VIEW canon_revoked AS
  SELECT DISTINCT revision FROM canon_receipt WHERE action = 'revoke';

CREATE OR REPLACE VIEW canon_current AS
  SELECT r.* FROM canon_record r
  WHERE NOT EXISTS (SELECT 1 FROM canon_record s WHERE s.supersedes = r.revision)
    AND NOT EXISTS (SELECT 1 FROM canon_revoked v WHERE v.revision = r.revision);

-- ── Grants: the actual guarantee ───────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO scms_runtime;
GRANT SELECT, INSERT ON canon_record, canon_receipt TO scms_runtime;
GRANT SELECT ON canon_outbox, canon_current, canon_revoked TO scms_runtime;
GRANT USAGE ON SEQUENCE canon_receipt_seq_seq TO scms_runtime;

-- Explicit, not merely omitted. An omitted grant is an accident waiting to be
-- corrected by someone being helpful; a REVOKE is a decision.
REVOKE UPDATE, DELETE, TRUNCATE ON canon_record  FROM scms_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON canon_receipt FROM scms_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON canon_outbox FROM scms_runtime;
