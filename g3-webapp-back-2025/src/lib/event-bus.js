import { EventEmitter } from 'events';

const bus = new EventEmitter();

bus.setMaxListeners(50);

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
