/**
 * Email Skill
 * 
 * Gmail integration for SparkyBot
 * - Read and summarize emails
 * - Draft emails (approval required)
 * - Send emails (approval required)
 * - VIP sender alerts
 */

export interface Email {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  date: Date;
  isRead: boolean;
  isVip: boolean;
}

export interface EmailSkillConfig {
  accounts: string[];
  pollingIntervalActive: number;
  pollingIntervalInactive: number;
  vipSenders: string[];
  summaryFormat: 'brief' | 'detailed';
}

export const DEFAULT_CONFIG: EmailSkillConfig = {
  accounts: [
    'johndempsey@johndempsey.us',
    'kdrsparky@gmail.com',
  ],
  pollingIntervalActive: 30,
  pollingIntervalInactive: 60,
  vipSenders: [],
  summaryFormat: 'detailed', // User prefers verbose
};

// TODO: Implement Gmail API integration
export async function getUnreadEmails(): Promise<Email[]> {
  throw new Error('Not implemented');
}

export async function summarizeThread(threadId: string): Promise<string> {
  throw new Error('Not implemented');
}

export async function draftEmail(to: string[], subject: string, body: string): Promise<string> {
  throw new Error('Not implemented');
}

export async function sendEmail(draftId: string): Promise<void> {
  throw new Error('Not implemented');
}
