#!/bin/sh
# Запуск агента №2 на сервере №2. Своя база доводится до нужной структуры в два шага:
# сначала общие доменные и учётные таблицы (та же история миграций, что у сервера №1 —
# схема БД №2 совпадает с БД №1 в части, которую сервер №1 знает), затем — приватная
# таблица SensitivityRule, которую сервер №1 никогда не видел и не применял.
set -e

echo "[агент №2] жду базу данных..."
attempt=0
until prisma migrate deploy --schema apps/crm/prisma/schema.prisma; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[агент №2] база так и не стала доступна — останавливаюсь."
    exit 1
  fi
  sleep 2
done

echo "[агент №2] применяю приватную схему чувствительности..."
prisma migrate deploy --schema apps/agent2/prisma/schema.prisma

echo "[агент №2] запускаю"
# Через tsx, не esbuild-бандл: у клиента чувствительности свой путь генерации
# (apps/agent2/prisma/generated), бандлинг усложнил бы это без реальной пользы
exec npx tsx apps/agent2/src/index.ts
