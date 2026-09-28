-- Оповещения о состоянии шины (Р-44) — токен бота и chat_id в базе, откат на переменные
-- окружения TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID, тем же приёмом, что и почта (Р-25).
ALTER TABLE "ProgramSettings" ADD COLUMN "telegramBotToken" TEXT;
ALTER TABLE "ProgramSettings" ADD COLUMN "telegramChatId" TEXT;
