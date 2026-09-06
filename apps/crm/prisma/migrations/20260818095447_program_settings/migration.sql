-- CreateTable
CREATE TABLE "ProgramSettings" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "mailHost" TEXT,
    "mailPort" INTEGER,
    "mailSecure" BOOLEAN NOT NULL DEFAULT false,
    "mailUser" TEXT,
    "mailPass" TEXT,
    "mailFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramSettings_programId_key" ON "ProgramSettings"("programId");

-- AddForeignKey
ALTER TABLE "ProgramSettings" ADD CONSTRAINT "ProgramSettings_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
