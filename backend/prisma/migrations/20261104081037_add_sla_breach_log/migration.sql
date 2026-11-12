-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SLA_WARNING';
ALTER TYPE "NotificationType" ADD VALUE 'SLA_BREACHED';

-- CreateTable
CREATE TABLE "sla_breach_logs" (
    "id" TEXT NOT NULL,
    "caseReportId" TEXT NOT NULL,
    "breachType" VARCHAR(20) NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "targetMs" INTEGER NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_breach_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sla_breach_logs_caseReportId_breachType_key" ON "sla_breach_logs"("caseReportId", "breachType");

-- AddForeignKey
ALTER TABLE "sla_breach_logs" ADD CONSTRAINT "sla_breach_logs_caseReportId_fkey" FOREIGN KEY ("caseReportId") REFERENCES "case_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
