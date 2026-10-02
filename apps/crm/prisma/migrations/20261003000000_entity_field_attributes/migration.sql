-- Модель данных (строка 1 таблицы покрытия): атрибуты поля и настройки сущности.
-- Существующие поля и сущности получают значения по умолчанию, поведение не меняется.
ALTER TABLE "EntityField"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "defaultValue" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "isUnique" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "readonly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "validation" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "EntityTemplate"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "icon" TEXT,
  ADD COLUMN "displayField" TEXT;
