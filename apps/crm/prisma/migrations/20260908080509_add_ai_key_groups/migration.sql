-- CreateTable
CREATE TABLE "AiKeyGroup" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKeyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiKey" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiKeyGroup_programId_name_key" ON "AiKeyGroup"("programId", "name");

-- CreateIndex
CREATE INDEX "AiKey_groupId_order_idx" ON "AiKey"("groupId", "order");

-- AddForeignKey
ALTER TABLE "AiKeyGroup" ADD CONSTRAINT "AiKeyGroup_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKey" ADD CONSTRAINT "AiKey_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AiKeyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: добавляем ссылку на активную группу до переноса данных,
-- чтобы было куда её записать
ALTER TABLE "ProgramSettings" ADD COLUMN "activeAiGroupId" TEXT;

-- Перенос данных (Р-35): единственный ключ, который был настроен по-старому,
-- становится первым ключом новой группы и делается активным — клиент не должен
-- заново вводить уже сохранённый ключ после этого обновления
WITH old AS (
    SELECT "programId", "aiProvider", "aiApiKey", "aiModel"
    FROM "ProgramSettings"
    WHERE "aiApiKey" IS NOT NULL AND "aiProvider" IS NOT NULL
),
new_group AS (
    INSERT INTO "AiKeyGroup" (id, "programId", name, provider, model, "order", "createdAt", "updatedAt")
    SELECT 'aikeygroup_' || substr(md5(random()::text || old."programId"), 1, 20),
           old."programId", 'Перенесённая группа', old."aiProvider", old."aiModel", 0, now(), now()
    FROM old
    RETURNING id, "programId"
),
new_key AS (
    INSERT INTO "AiKey" (id, "groupId", "apiKey", label, "order", "createdAt")
    SELECT 'aikey_' || substr(md5(random()::text || new_group.id), 1, 20),
           new_group.id, old."aiApiKey", NULL, 0, now()
    FROM new_group JOIN old ON old."programId" = new_group."programId"
    RETURNING "groupId"
)
UPDATE "ProgramSettings" ps
SET "activeAiGroupId" = new_group.id
FROM new_group
WHERE ps."programId" = new_group."programId";

-- AlterTable: старые поля больше не нужны — данные уже перенесены выше
ALTER TABLE "ProgramSettings" DROP COLUMN "aiApiKey",
DROP COLUMN "aiModel",
DROP COLUMN "aiProvider";
