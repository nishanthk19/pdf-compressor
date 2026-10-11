-- Additive migration. Back up first; run with psql -v ON_ERROR_STOP=1.
-- Existing authentication tables are deliberately untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS letter_document (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'document', title TEXT NOT NULL, data JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS letter_document_user_kind ON letter_document("userId",kind,"updatedAt");
CREATE TABLE IF NOT EXISTS letter_revision (
  id TEXT PRIMARY KEY, "documentId" TEXT NOT NULL REFERENCES letter_document(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, data JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("documentId",revision)
);
CREATE TABLE IF NOT EXISTS letter_correspondence (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "documentId" TEXT UNIQUE REFERENCES letter_document(id) ON DELETE CASCADE,
  title TEXT NOT NULL, "fileName" TEXT, "filePath" TEXT, text TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}', included BOOLEAN NOT NULL DEFAULT true,
  state TEXT NOT NULL DEFAULT 'pending', error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3), generation INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS letter_correspondence_user_state ON letter_correspondence("userId",included,state);
CREATE TABLE IF NOT EXISTS letter_chunk (
  id TEXT PRIMARY KEY, "correspondenceId" TEXT NOT NULL REFERENCES letter_correspondence(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, text TEXT NOT NULL, "embeddingModel" TEXT,
  UNIQUE("correspondenceId",position)
);
CREATE INDEX IF NOT EXISTS letter_chunk_search ON letter_chunk USING GIN(to_tsvector('english',text));
COMMIT;
