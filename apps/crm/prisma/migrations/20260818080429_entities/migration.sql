-- CreateTable
CREATE TABLE "EntityTemplate" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "namePlural" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityRecord" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityTemplate_programId_key_key" ON "EntityTemplate"("programId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EntityField_templateId_key_key" ON "EntityField"("templateId", "key");

-- CreateIndex
CREATE INDEX "EntityRecord_templateId_createdAt_idx" ON "EntityRecord"("templateId", "createdAt");

-- AddForeignKey
ALTER TABLE "EntityTemplate" ADD CONSTRAINT "EntityTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityField" ADD CONSTRAINT "EntityField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityRecord" ADD CONSTRAINT "EntityRecord_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
