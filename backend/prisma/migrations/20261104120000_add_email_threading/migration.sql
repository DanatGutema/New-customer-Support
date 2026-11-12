-- Add email threading columns to email_logs
ALTER TABLE "email_logs"
  ADD COLUMN IF NOT EXISTS "messageId"   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "inReplyTo"   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "references"  TEXT,
  ADD COLUMN IF NOT EXISTS "subject"     VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "bodyText"    TEXT,
  ADD COLUMN IF NOT EXISTS "direction"   VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN IF NOT EXISTS "fromEmail"   VARCHAR(255);

-- Unique constraint on messageId (safe creation)
CREATE UNIQUE INDEX IF NOT EXISTS "email_logs_messageId_key" ON "email_logs"("messageId");
