#!/bin/bash
# Проверка текущей ветки на ВПС БЕЗ развёртывания: собирает образ (типы Next + сборка)
# в отдельной папке под отдельным тегом и удаляет его. Боевой контейнер и /opt/revolit
# не затрагиваются. Запускать из корня проекта:
#   VPS_HOST=root@<адрес> VPS_KEY=<путь к ключу> tools/check-on-vps.sh
# Адрес и ключ намеренно не записаны в файл — репозиторий публичный.
#
# Сборка идёт на сервере отдельным процессом (nohup), а результат опрашивается короткими
# подключениями: долгий ssh-сеанс на этом сервере обрывается (проверено).
set -u
: "${VPS_HOST:?задайте VPS_HOST, например root@1.2.3.4}"
: "${VPS_KEY:?задайте VPS_KEY — путь к ключу ssh}"

SSH="ssh -i $VPS_KEY -o ConnectTimeout=20 -o ServerAliveInterval=15 $VPS_HOST"

tar czf /tmp/revolit-check.tgz --exclude='.env*' --exclude=node_modules --exclude=.next \
  --exclude=.git --exclude=parked --exclude=.claude .
scp -i "$VPS_KEY" /tmp/revolit-check.tgz "$VPS_HOST:/tmp/revolit-check.tgz"
rm -f /tmp/revolit-check.tgz

$SSH 'rm -f /tmp/revolit-check.rc /tmp/revolit-check.log
  rm -rf /opt/revolit-check && mkdir -p /opt/revolit-check
  tar xzf /tmp/revolit-check.tgz -C /opt/revolit-check && rm -f /tmp/revolit-check.tgz
  nohup sh -c "cd /opt/revolit-check && docker build -t revolit-check:latest . > /tmp/revolit-check.log 2>&1; echo \$? > /tmp/revolit-check.rc" > /dev/null 2>&1 &
  echo "сборка запущена"'

# Опрос: до ~20 минут, каждые 20 секунд, каждое подключение короткое
for i in $(seq 1 60); do
  sleep 20
  rc=$($SSH 'cat /tmp/revolit-check.rc 2>/dev/null' 2>/dev/null) || continue
  [ -n "$rc" ] && break
done

$SSH 'tail -30 /tmp/revolit-check.log; docker rmi revolit-check:latest > /dev/null 2>&1; rm -rf /opt/revolit-check' 2>/dev/null
echo "КОД ВОЗВРАТА СБОРКИ: ${rc:-неизвестен (не дождались)}"
[ "${rc:-1}" = "0" ]
