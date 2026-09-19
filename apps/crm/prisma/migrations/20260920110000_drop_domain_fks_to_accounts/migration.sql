-- Доменные таблицы больше не ссылаются на учётные (Program, User) внешними ключами
-- (переработка ядра, решение F1): в БД №2 учётных таблиц нет, и запись с таким ключом
-- там упала бы. Принадлежность программе по-прежнему проверяется в сервисах;
-- колонки programId/assigneeId/createdById/uploadedById остаются как обычные строки.

-- DropForeignKey
ALTER TABLE "EntityTemplate" DROP CONSTRAINT "EntityTemplate_programId_fkey";

-- DropForeignKey
ALTER TABLE "EntityTemplatePreset" DROP CONSTRAINT "EntityTemplatePreset_programId_fkey";

-- DropForeignKey
ALTER TABLE "ProcessTemplate" DROP CONSTRAINT "ProcessTemplate_programId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_programId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_programId_fkey";

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_uploadedById_fkey";
