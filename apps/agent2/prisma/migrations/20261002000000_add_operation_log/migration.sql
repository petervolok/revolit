-- Журнал выполненных операций агента №2 (Р-45)
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");
