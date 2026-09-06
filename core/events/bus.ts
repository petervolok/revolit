type Handler<Payload> = (payload: Payload) => void | Promise<void>;

/**
 * Шина событий. Ядро сообщает о происходящем, модули подписываются.
 * Ядро при этом ничего не знает о подписчиках.
 *
 * В отличие от «крючков» с произвольными строками, здесь набор событий
 * описан типом — опечатка в названии не пройдёт проверку.
 */
export interface EventBus<Events extends Record<string, unknown>> {
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void;
  emit<K extends keyof Events>(event: K, payload: Events[K]): Promise<void>;
  listenerCount(event: keyof Events): number;
}

export function createEventBus<Events extends Record<string, unknown>>(): EventBus<Events> {
  const handlers = new Map<keyof Events, Set<Handler<never>>>();

  return {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler as Handler<never>);
      return () => {
        handlers.get(event)?.delete(handler as Handler<never>);
      };
    },

    async emit(event, payload) {
      const set = handlers.get(event);
      if (!set?.size) return;

      // Сбой подписчика не должен срывать основную операцию:
      // выполняем всех и только сообщаем об ошибках.
      const results = await Promise.allSettled(
        [...set].map((handler) => (handler as Handler<Events[typeof event]>)(payload))
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          console.error(`[события] обработчик "${String(event)}" завершился ошибкой`, result.reason);
        }
      }
    },

    listenerCount(event) {
      return handlers.get(event)?.size ?? 0;
    },
  };
}
