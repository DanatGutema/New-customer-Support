/*
  Warnings:

  - A unique constraint covering the columns `[memberNumber]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[staffNumber]` on the table `staffs` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('STAFF', 'CUSTOMER', 'SYSTEM');

-- AlterTable
ALTER TABLE "case_report_status_histories" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "actorType" "ActorType",
ADD COLUMN     "newAgentName" VARCHAR(200),
ADD COLUMN     "oldAgentName" VARCHAR(200),
ADD COLUMN     "resolutionSnapshot" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "memberNumber" VARCHAR(20);

-- AlterTable
ALTER TABLE "staffs" ADD COLUMN     "staffNumber" VARCHAR(20);

-- CreateIndex
CREATE UNIQUE INDEX "customers_memberNumber_key" ON "customers"("memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "staffs_staffNumber_key" ON "staffs"("staffNumber");
