import { EventEmitter } from 'node:events';

export interface EmailEvent {
  type: 'email_received' | 'sync_completed';
  userId: string;
  data?: Record<string, unknown>;
}

class EventBroadcaster extends EventEmitter {
  public broadcast(event: EmailEvent): void {
    this.emit('event', event);
    this.emit(`user:${event.userId}`, event);
  }
}

export const eventBroadcaster = new EventBroadcaster();
