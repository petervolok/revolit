import { createEventBus } from './bus';

/**
 * События, о которых сообщает ядро. Модули подписываются на нужные.
 *
 * Объявлено через `type`, а не `interface`, намеренно: шина принимает
 * набор с произвольными ключами, а описания через `interface` под такое
 * требование в TypeScript не подходят. Свои перечни событий модули
 * объявляют так же.
 */
export type CoreEventMap = {
  'user.created': { programId: string; userId: string; email: string; actorId?: string };
  'user.updated': { programId: string; userId: string; actorId?: string };
  'user.deactivated': { programId: string; userId: string; actorId?: string };
  'user.activated': { programId: string; userId: string; actorId?: string };
  'role.created': { programId: string; roleId: string; actorId?: string };
  'role.updated': { programId: string; roleId: string; actorId?: string };
  'role.deleted': { programId: string; roleId: string; actorId?: string };
  'auth.logged_in': { programId: string; userId: string; ip?: string };
  'auth.logged_out': { programId: string; userId: string };
  'auth.password_changed': { programId: string; userId: string };
};

export const coreEvents = createEventBus<CoreEventMap>();
