/*
  Warnings:

  - A unique constraint covering the columns `[messageId]` on the table `email_logs` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "email_logs" ADD COLUMN     "bodyText" TEXT,
ADD COLUMN     "direction" VARCHAR(10) NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN     "fromEmail" VARCHAR(255),
ADD COLUMN     "inReplyTo" VARCHAR(500),
ADD COLUMN     "messageId" VARCHAR(500),
ADD COLUMN     "references" TEXT,
ADD COLUMN     "subject" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_messageId_key" ON "email_logs"("messageId");
