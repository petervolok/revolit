-- CreateTable
CREATE TABLE "ModuleToggle" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModuleToggle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleToggle_programId_moduleKey_key" ON "ModuleToggle"("programId", "moduleKey");

-- AddForeignKey
ALTER TABLE "ModuleToggle" ADD CONSTRAINT "ModuleToggle_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
