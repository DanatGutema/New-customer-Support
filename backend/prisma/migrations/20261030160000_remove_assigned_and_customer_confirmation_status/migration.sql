BEGIN;

-- create new enum with canonical values
CREATE TYPE "CaseStatus_new" AS ENUM ('OPEN','IN_PROGRESS','PENDING','ESCALATED','RESOLVED','CLOSED','CANCELLED');

-- drop default (can't cast defaults across enum types) and temporarily change enum columns to text so we can normalize legacy labels
ALTER TABLE "case_report" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "case_report" ALTER COLUMN "status" TYPE text USING ("status"::text);
ALTER TABLE "case_report_status_histories" ALTER COLUMN "fromStatus" TYPE text USING ("fromStatus"::text);
ALTER TABLE "case_report_status_histories" ALTER COLUMN "toStatus" TYPE text USING ("toStatus"::text);

-- map removed statuses to their replacements
UPDATE "case_report" SET "status" = 'IN_PROGRESS' WHERE "status" = 'ASSIGNED';
UPDATE "case_report" SET "status" = 'RESOLVED' WHERE "status" = 'CUSTOMER_CONFIRMATION';
UPDATE "case_report_status_histories" SET "fromStatus" = 'IN_PROGRESS' WHERE "fromStatus" = 'ASSIGNED';
UPDATE "case_report_status_histories" SET "fromStatus" = 'RESOLVED' WHERE "fromStatus" = 'CUSTOMER_CONFIRMATION';
UPDATE "case_report_status_histories" SET "toStatus" = 'IN_PROGRESS' WHERE "toStatus" = 'ASSIGNED';
UPDATE "case_report_status_histories" SET "toStatus" = 'RESOLVED' WHERE "toStatus" = 'CUSTOMER_CONFIRMATION';

-- alter columns to the new enum type
ALTER TABLE "case_report" ALTER COLUMN "status" TYPE "CaseStatus_new" USING ("status"::text::"CaseStatus_new");
ALTER TABLE "case_report_status_histories" ALTER COLUMN "fromStatus" TYPE "CaseStatus_new" USING ("fromStatus"::text::"CaseStatus_new");
ALTER TABLE "case_report_status_histories" ALTER COLUMN "toStatus" TYPE "CaseStatus_new" USING ("toStatus"::text::"CaseStatus_new");

-- replace the old enum type with the new one
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
ALTER TYPE "CaseStatus_new" RENAME TO "CaseStatus";
DROP TYPE IF EXISTS "public"."CaseStatus_old";

-- set default back
ALTER TABLE "case_report" ALTER COLUMN "status" SET DEFAULT 'OPEN';

COMMIT;
