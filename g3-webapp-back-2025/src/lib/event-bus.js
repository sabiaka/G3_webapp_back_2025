import { EventEmitter } from 'events';

const globalBus = globalThis.__g3EventBus || new EventEmitter();

if (!globalThis.__g3EventBus) {
  globalThis.__g3EventBus = globalBus;
}

globalThis.__g3EventBus.setMaxListeners(100);

const bus = globalThis.__g3EventBus;

export function emitEvent(event) {
  const payload = {
    timestamp: Date.now(),
    ...event,
  };
  bus.emit('message', payload);
}

export function onEvent(handler) {
  bus.on('message', handler);
  return () => bus.off('message', handler);
}
