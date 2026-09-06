#!/bin/sh
# Запуск рабочего образа: сначала доводим структуру базы до нужного состояния,
# потом стартуем сервер. Раньше это делал разработчик руками — для коробочной
# поставки так нельзя (Р-26).
set -e

echo "Жду базу данных..."
attempt=0
until prisma migrate deploy --schema apps/crm/prisma/schema.prisma; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "База так и не стала доступна за отведённое время — останавливаюсь."
    exit 1
  fi
  # depends_on в Compose гарантирует только запуск контейнера базы,
  # а не её готовность принимать соединения — отсюда повтор с паузой.
  sleep 2
done

echo "Запускаю сервер..."
exec node apps/crm/server.js
