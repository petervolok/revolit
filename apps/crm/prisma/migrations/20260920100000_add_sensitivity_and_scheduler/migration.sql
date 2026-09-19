-- AlterTable
ALTER TABLE "EntityRecord" ADD COLUMN     "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SensitivityRule" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SensitivityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SensitivityRule_programId_templateKey_idx" ON "SensitivityRule"("programId", "templateKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_programId_key_key" ON "ScheduledJob"("programId", "key");
