-- CreateEnum
CREATE TYPE "WorkSessionSource" AS ENUM ('AUTO', 'TIMER', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('DESK', 'PHONE', 'SITE_VISIT', 'HARDWARE_REPAIR', 'TRAVEL');

-- CreateEnum
CREATE TYPE "WorkSessionApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "case_report" ADD COLUMN     "totalActiveSeconds" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "case_work_sessions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "source" "WorkSessionSource" NOT NULL,
    "workType" "WorkType" NOT NULL DEFAULT 'DESK',
    "endReason" VARCHAR(255),
    "note" TEXT,
    "approvalStatus" "WorkSessionApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_work_session_audits" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "field" VARCHAR(100) NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_work_session_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_work_sessions_caseId_idx" ON "case_work_sessions"("caseId");

-- CreateIndex
CREATE INDEX "case_work_sessions_staffId_startedAt_idx" ON "case_work_sessions"("staffId", "startedAt");

-- AddForeignKey
ALTER TABLE "case_work_sessions" ADD CONSTRAINT "case_work_sessions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "case_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_work_sessions" ADD CONSTRAINT "case_work_sessions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_work_session_audits" ADD CONSTRAINT "case_work_session_audits_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "case_work_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_work_session_audits" ADD CONSTRAINT "case_work_session_audits_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "staffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

