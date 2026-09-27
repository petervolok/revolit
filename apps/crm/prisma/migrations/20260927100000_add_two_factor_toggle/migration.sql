-- Второй фактор входа (код из письма) становится настройкой программы.
-- Новые установки — выключен (почты может не быть); уже работающие программы
-- сохраняют прежнее поведение — им включаем.
ALTER TABLE "ProgramSettings" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProgramSettings" SET "twoFactorEnabled" = true;

INSERT INTO "ProgramSettings" ("id", "programId", "twoFactorEnabled", "updatedAt")
SELECT 'tf' || "id", "id", true, CURRENT_TIMESTAMP FROM "Program"
WHERE "id" NOT IN (SELECT "programId" FROM "ProgramSettings");
