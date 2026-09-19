#!/bin/sh
# Запуск агента данных. Каждый агент сам доводит до нужной структуры СВОЮ базу (ТЗ 9) —
# по аналогии с docker-entrypoint.sh приложения, но раздельно на каждом сервере.
set -e

echo "[агент] жду базу данных..."
attempt=0
until prisma migrate deploy --schema apps/crm/prisma/schema.prisma; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[агент] база так и не стала доступна — останавливаюсь."
    exit 1
  fi
  sleep 2
done

echo "[агент] запускаю"
exec node apps/agent/dist/agent.js
