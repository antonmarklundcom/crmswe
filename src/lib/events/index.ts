// Tiny internal event dispatcher factory (PLAN.md §5): "not a message bus;
// just a typed function registry." Each module instantiates its own bus for
// its own event map (modules/crm/events.ts, modules/forms/events.ts, ...).
// Listeners fan out synchronously and are expected to enqueue jobs
// themselves (e.g. automation trigger evaluation, PLAN.md §7.2) rather than
// do slow work inline.

type Listener<T> = (payload: T) => void | Promise<void>;

export function createEventBus<EventMap extends Record<string, unknown>>() {
  const listeners = new Map<keyof EventMap, Listener<never>[]>();

  return {
    on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>) {
      const list = (listeners.get(event) ?? []) as Listener<EventMap[K]>[];
      list.push(listener);
      listeners.set(event, list as Listener<never>[]);
    },

    async emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
      const list = (listeners.get(event) ?? []) as Listener<EventMap[K]>[];
      for (const listener of list) {
        await listener(payload);
      }
    },
  };
}
