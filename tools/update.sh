#!/bin/sh
# Применяет обновление на сервере: проверяет подпись релиза, собирает новую
# версию, следит за здоровьем и откатывает назад при сбое (Р-31).
#
# Запускается в /opt/revolit (там же, где docker-compose.prod.yml).
# Не часть приложения — не собирается в образ.
#
# На самом хосте сервера Node не установлен — весь код живёт в контейнерах.
# Поэтому проверка подписи запускается через тот же образ node:20-alpine,
# что и остальной проект, а не через голый `node`.
#
# Проверки версии идут через адрес, по которому программа видна снаружи
# (прокси перед приложением), а не через localhost внутри контейнера —
# Next.js в этой сборке слушает адрес контейнера в сети, не обратную петлю.
#
# Использование:
#   tools/update.sh <новый-исходник.tar.gz> <файл-с-подписанным-релизом> [адрес-проверки]
set -e

SOURCE_TARBALL="$1"
MANIFEST_FILE="$2"
HEALTH_URL="${3:-https://localhost:3443}"
HEALTH_TIMEOUT=60

if [ -z "$SOURCE_TARBALL" ] || [ -z "$MANIFEST_FILE" ]; then
  echo "Использование: tools/update.sh <исходник.tar.gz> <релиз.txt> [адрес-проверки]"
  exit 1
fi

run_verify() {
  docker run --rm -v "$(pwd)/tools:/tools:ro" node:20-alpine node /tools/verify-release.js "$1"
}

extract_version() {
  sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

is_newer() {
  # Сравнение вида «1.2.3» посегментно; нестандартный формат считается младше
  a="$1"; b="$2"
  i=1
  while [ "$i" -le 4 ]; do
    pa=$(echo "$a" | cut -d. -f"$i"); pa=${pa:-0}
    pb=$(echo "$b" | cut -d. -f"$i"); pb=${pb:-0}
    case "$pa" in ''|*[!0-9]*) pa=0 ;; esac
    case "$pb" in ''|*[!0-9]*) pb=0 ;; esac
    if [ "$pa" -gt "$pb" ]; then echo yes; return; fi
    if [ "$pa" -lt "$pb" ]; then echo no; return; fi
    i=$((i + 1))
  done
  echo no
}

echo "Проверяю подпись релиза..."
NEW_VERSION=$(run_verify "$(cat "$MANIFEST_FILE")") || exit 1
echo "Релиз подлинный, версия: $NEW_VERSION"

echo "Узнаю текущую версию (через $HEALTH_URL)..."
CURRENT_VERSION=$(curl -sk -m 10 "$HEALTH_URL/api/version" | extract_version)
CURRENT_VERSION="${CURRENT_VERSION:-0.0.0}"
echo "Сейчас установлено: $CURRENT_VERSION"

if [ "$(is_newer "$NEW_VERSION" "$CURRENT_VERSION")" != "yes" ]; then
  echo "Релиз $NEW_VERSION не новее установленной версии $CURRENT_VERSION — ничего не делаю."
  exit 0
fi

echo "Сохраняю текущий образ на случай отката..."
docker tag revolit-app:latest revolit-app:rollback

echo "Разворачиваю новые исходники поверх текущих..."
tar -xzf "$SOURCE_TARBALL" -C /opt/revolit

echo "Собираю и запускаю новую версию..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "Жду, пока новая версия ответит (до ${HEALTH_TIMEOUT}с)..."
elapsed=0
healthy=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  RESPONDED_VERSION=$(curl -sk -m 5 "$HEALTH_URL/api/version" | extract_version)
  if [ "$RESPONDED_VERSION" = "$NEW_VERSION" ]; then
    healthy=1
    break
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done

if [ "$healthy" -ne 1 ]; then
  echo "Новая версия не отвечает — откатываюсь на $CURRENT_VERSION..."
  docker tag revolit-app:rollback revolit-app:latest
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
  echo "ОТКАЧЕНО. Обновление не применено, работает прежняя версия."
  exit 1
fi

echo "Готово: версия $NEW_VERSION работает и отвечает."
