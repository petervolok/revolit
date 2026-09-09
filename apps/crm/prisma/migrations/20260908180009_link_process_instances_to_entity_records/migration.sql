-- AlterTable
ALTER TABLE "ProcessInstance" ADD COLUMN     "entityRecordId" TEXT;

-- CreateIndex
CREATE INDEX "ProcessInstance_entityRecordId_idx" ON "ProcessInstance"("entityRecordId");

-- AddForeignKey
ALTER TABLE "ProcessInstance" ADD CONSTRAINT "ProcessInstance_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
