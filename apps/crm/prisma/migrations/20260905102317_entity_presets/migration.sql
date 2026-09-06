-- AlterTable
ALTER TABLE "EntityTemplate" ADD COLUMN     "sourcePresetKey" TEXT;

-- CreateTable
CREATE TABLE "EntityTemplatePreset" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePlural" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTemplatePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityTemplatePreset_programId_key_key" ON "EntityTemplatePreset"("programId", "key");

-- AddForeignKey
ALTER TABLE "EntityTemplatePreset" ADD CONSTRAINT "EntityTemplatePreset_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
