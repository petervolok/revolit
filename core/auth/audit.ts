import { prisma } from '../data/prisma';

export type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.login.locked'
  | 'auth.code.sent'
  | 'auth.code.failed'
  | 'auth.logout'
  | 'auth.password_reset.requested'
  | 'auth.password_reset.completed'
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'role.assigned'
  | 'role.revoked'
  | 'entity_template.created'
  | 'entity_template.deleted'
  | 'entity_record.deleted'
  | 'setup.completed';

interface AuditEntry {
  programId: string;
  userId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  target?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Запись в журнал действий. Журнал не должен ломать основную операцию,
 * поэтому ошибки записи только логируются.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        programId: entry.programId,
        userId: entry.userId ?? null,
        actorEmail: entry.actorEmail ?? null,
        action: entry.action,
        target: entry.target,
        targetId: entry.targetId,
        details: entry.details as object | undefined,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    console.error('[audit] не удалось записать событие', entry.action, error);
  }
}
