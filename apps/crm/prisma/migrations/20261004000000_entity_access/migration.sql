-- Права на сущности (строка 5 таблицы покрытия): доступ роли к сущности, автор записи.
-- Существующие записи остаются без автора, существующие роли — без строк доступа: поведение не меняется
-- (право entities.manage по-прежнему даёт полный доступ).
ALTER TABLE "EntityRecord" ADD COLUMN "createdById" TEXT;

-- CreateTable
CREATE TABLE "EntityAccess" (
    "roleId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "rowScope" TEXT NOT NULL DEFAULT 'all',
    "hiddenFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readonlyFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAccess_pkey" PRIMARY KEY ("roleId","templateId")
);

-- CreateIndex
CREATE INDEX "EntityRecord_templateId_createdById_idx" ON "EntityRecord"("templateId", "createdById");

-- AddForeignKey
ALTER TABLE "EntityAccess" ADD CONSTRAINT "EntityAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAccess" ADD CONSTRAINT "EntityAccess_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EntityTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
