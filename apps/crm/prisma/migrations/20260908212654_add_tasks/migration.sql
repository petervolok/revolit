-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "doneAt" TIMESTAMP(3),
    "entityRecordId" TEXT,
    "processInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_programId_assigneeId_status_idx" ON "Task"("programId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_entityRecordId_idx" ON "Task"("entityRecordId");

-- CreateIndex
CREATE INDEX "Task_processInstanceId_idx" ON "Task"("processInstanceId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_processInstanceId_fkey" FOREIGN KEY ("processInstanceId") REFERENCES "ProcessInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
