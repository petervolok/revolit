import { prisma } from '../data/prisma';
import { coreEvents } from '../events/coreEvents';
import { writeAudit } from './audit';
import { createSession } from './session';

/** Общий конец входа: с кодом из письма (verify) и без него (login при выключенном втором факторе) */
export async function completeLogin(params: {
  userId: string;
  programId: string;
  email: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const { userId, programId, email, ip, userAgent } = params;

  await createSession(userId, { ip, userAgent });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await writeAudit({ programId, userId, actorEmail: email, action: 'auth.login.success', ip, userAgent });
  await coreEvents.emit('auth.logged_in', { programId, userId, ip });
}
