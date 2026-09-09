-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "entityRecordId" TEXT,
    "processInstanceId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_entityRecordId_idx" ON "Attachment"("entityRecordId");

-- CreateIndex
CREATE INDEX "Attachment_processInstanceId_idx" ON "Attachment"("processInstanceId");

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_processInstanceId_fkey" FOREIGN KEY ("processInstanceId") REFERENCES "ProcessInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
