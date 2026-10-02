// Собственный сгенерированный клиент (apps/agent2/prisma/generated) — знает про
// SensitivityRule и OperationLog, которых в клиенте сервера №1 нет и быть не может.
import { PrismaClient } from '../prisma/generated';

export type AgentPrismaClient = PrismaClient;

/**
 * Своя база (БД №2) — полные данные, читает и пишет всегда. Другой базы у агента нет:
 * изменения для БД №1 уходят по шине (Р-45), прямого подключения к ней больше не существует.
 */
export const db2: AgentPrismaClient = new PrismaClient();
