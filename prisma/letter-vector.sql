-- Optional additive semantic-search migration; requires installed pgvector package.
-- Variable-length vectors allow explicit dimension checks when switching models.
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE letter_chunk ADD COLUMN IF NOT EXISTS embedding vector;
COMMIT;
