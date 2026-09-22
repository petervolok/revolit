-- Эта миграция существует ТОЛЬКО в apps/agent2/prisma/migrations — применяется отдельным
-- шагом только на БД №2 (см. apps/agent2/entrypoint.sh). apps/crm/prisma/migrations,
-- который применяет сервер №1, её никогда не видит.

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

-- CreateIndex
CREATE INDEX "SensitivityRule_programId_templateKey_idx" ON "SensitivityRule"("programId", "templateKey");
