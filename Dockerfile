FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY core/package.json ./core/
COPY apps/crm/package.json ./apps/crm/
RUN npm install

FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
# Зависимости workspaces складываются в общую папку в корне
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run schema && npx prisma generate --schema apps/crm/prisma/schema.prisma
RUN npm run build

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
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
