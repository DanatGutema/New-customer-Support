-- CreateEnum
CREATE TYPE "MessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateTable
CREATE TABLE "case_messages" (
    "id" TEXT NOT NULL,
    "caseReportId" TEXT NOT NULL,
    "authorStaffId" TEXT,
    "authorCustomerId" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "MessageVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canned_replies" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "category" VARCHAR(100),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_replies_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_caseReportId_fkey" FOREIGN KEY ("caseReportId") REFERENCES "case_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_authorStaffId_fkey" FOREIGN KEY ("authorStaffId") REFERENCES "staffs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_authorCustomerId_fkey" FOREIGN KEY ("authorCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "case_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
