FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/
COPY apps/crm/package.json ./apps/crm/
# По lock-файлу, чтобы образ и CI ставили одни и те же версии. Добавили
# зависимость — обновить lock (npm install --package-lock-only) и закоммитить.
RUN npm ci

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
# Зависимости workspaces складываются в общую папку в корне
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run schema && npx prisma generate --schema apps/crm/prisma/schema.prisma
RUN npm run build
# Агент данных (ТЗ 3.5) — один файл, чтобы тот же рабочий образ мог запускаться и как агент:
# @prisma/client берётся из образа, остальное (в т.ч. amqplib) вшито в бандл
RUN npx esbuild apps/agent/src/index.ts --bundle --platform=node --target=node20 --external:@prisma/client --outfile=apps/agent/dist/agent.js

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# Приложение обходится без неё, но она нужна, чтобы применить структуру базы
# при старте контейнера (Р-26) — версия та же, что использована при сборке.
RUN npm install -g prisma@5.22.0
# Сборка standalone сохраняет структуру монорепозитория
COPY --from=builder /app/apps/crm/.next/standalone ./
COPY --from=builder /app/apps/crm/.next/static ./apps/crm/.next/static
COPY --from=builder /app/apps/crm/public ./apps/crm/public
COPY --from=builder /app/apps/crm/prisma ./apps/crm/prisma
COPY --from=builder /app/apps/agent/dist ./apps/agent/dist
COPY apps/agent/entrypoint.sh ./apps/agent/entrypoint.sh
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh apps/agent/entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
