/**
 * Job type definitions for BullMQ queues
 */

export interface SyncUserEmailsJob {
  userId: string;
  triggerSource: 'webhook' | 'manual' | 'renewal';
}

export interface ProcessEmailJob {
  userId: string;
  messageId: string;
}

export interface RenewWatchJob {
  userId: string;
}

export interface ReminderCheckJob {
  triggeredBy: 'cron' | 'manual';
}

export interface RescanEmailsJob {
  userId: string;
}

export const QueueNames = {
  EMAIL_SYNC: 'email-sync',
  EMAIL_PROCESSING: 'email-processing',
  WATCH_RENEWAL: 'watch-renewal',
  REMINDER_CHECK: 'reminder-check',
  EMAIL_RESCAN: 'email-rescan',
} as const;
