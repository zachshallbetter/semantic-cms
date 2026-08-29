-- Content-addressed storage for prose and media (SCMS-060, closes SH-4).
--
-- SH-4 proposed the model and nothing adopted it:
--
--   "BLAKE3- or SHA-256-addressed CAS, immutable, Cache-Control: immutable;
--    manifests declare derivative *classes* never encodings; delivery
--    projections own codecs."
--
-- The identity already exists in the model. `fixtures/zach-core-manifest.json`
-- has carried `bodySha256` for every entry since SCMS-028, and Canon slots
-- reference it — so this table is the store the digest was always pointing at.
--
-- Two properties matter, and both are constraints rather than intentions:
--
--  1. **The digest is the key.** Identical bytes stored twice are one row, so
--     deduplication is a consequence of naming rather than a background job.
--     165 KB of manifest describing 4.2 MB of prose becomes a join.
--
--  2. **Immutable by grant.** A blob is bytes named by their own hash; changing
--     the bytes under the name would make the name a lie, so the runtime role
--     may INSERT and SELECT and nothing else — the same posture as canon_record.

CREATE TABLE IF NOT EXISTS canon_blob (
  digest       text PRIMARY KEY CHECK (digest LIKE 'sha256:%' AND length(digest) = 71),
  bytes        bytea NOT NULL,
  byte_length  integer NOT NULL CHECK (byte_length >= 0),
  -- The media type as stored. Derivative CLASSES are declared per SH-4;
  -- encodings are a delivery concern and deliberately not recorded here.
  media_type   text NOT NULL,
  landed_at    timestamptz NOT NULL DEFAULT now(),
  -- The stored length must match the bytes, or the manifest's bodyLength and
  -- the store could disagree without anything noticing.
  CONSTRAINT canon_blob_length_agrees CHECK (byte_length = length(bytes))
);

-- Which records reference which blobs. A blob with no referent is not deleted
-- -- deletion is not available to the runtime role at all -- but it is
-- identifiable, which is what a retention decision would need.
CREATE OR REPLACE VIEW canon_blob_unreferenced AS
  SELECT b.digest, b.byte_length, b.media_type, b.landed_at
  FROM canon_blob b
  WHERE NOT EXISTS (
    SELECT 1 FROM canon_record r
    WHERE r.body::text LIKE '%' || b.digest || '%'
  );

GRANT SELECT, INSERT ON canon_blob TO scms_runtime;
GRANT SELECT ON canon_blob_unreferenced TO scms_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON canon_blob FROM scms_runtime;
