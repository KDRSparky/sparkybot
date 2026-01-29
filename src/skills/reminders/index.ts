/**
 * Reminders Skill
 * 
 * Calendar-linked reminders for SparkyBot
 * - Create reminders with natural language
 * - Link to calendar events
 * - Telegram notifications
 */

export interface Reminder {
  id: string;
  text: string;
  triggerAt: Date;
  calendarEventId?: string;
  status: 'pending' | 'triggered' | 'dismissed';
  createdAt: Date;
}

export interface RemindersSkillConfig {
  defaultLeadTime: number; // minutes before event
  notificationChannel: 'telegram';
}

export const DEFAULT_CONFIG: RemindersSkillConfig = {
  defaultLeadTime: 15,
  notificationChannel: 'telegram',
};

// TODO: Implement reminders with Supabase and calendar integration
export async function createReminder(text: string, triggerAt: Date, calendarEventId?: string): Promise<Reminder> {
  throw new Error('Not implemented');
}

export async function getUpcomingReminders(hours: number = 24): Promise<Reminder[]> {
  throw new Error('Not implemented');
}

export async function dismissReminder(id: string): Promise<void> {
  throw new Error('Not implemented');
}

export async function triggerReminder(id: string): Promise<void> {
  throw new Error('Not implemented');
}
