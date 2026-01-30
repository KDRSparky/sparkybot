/**
 * Email Skill
 * 
 * Gmail integration for SparkyBot
 * - Read and summarize emails
 * - Draft emails (approval required)
 * - Send emails (approval required)
 * - VIP sender alerts
 */

import { gmail_v1 } from 'googleapis';
import { getGmailService, PRIMARY_EMAIL } from '../../services/google-auth.js';
import { isVipEmail, getVipContacts, suggestVipContact } from '../../services/supabase.js';

export interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: Date;
  isRead: boolean;
  isVip?: boolean;
  labels?: string[];
}

export interface EmailThread {
  id: string;
  subject: string;
  messages: Email[];
  snippet: string;
  lastMessageDate: Date;
}

export interface EmailSkillConfig {
  accounts: string[];
  pollingIntervalActive: number;
  pollingIntervalInactive: number;
  vipSenders: string[];
  summaryFormat: 'brief' | 'detailed';
}

// User timezone (Central Time)
const USER_TIMEZONE = 'America/Chicago';

export const DEFAULT_CONFIG: EmailSkillConfig = {
  accounts: [
    'johndempsey@johndempsey.us',
    'kdrsparky@gmail.com',
  ],
  pollingIntervalActive: 30,
  pollingIntervalInactive: 60,
  vipSenders: [],
  summaryFormat: 'detailed',
};

// Cache for VIP emails to reduce DB calls
let vipEmailCache: Set<string> | null = null;
let vipCacheExpiry: number = 0;
const VIP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load VIP contacts into cache
 */
async function loadVipCache(): Promise<Set<string>> {
  if (vipEmailCache && Date.now() < vipCacheExpiry) {
    return vipEmailCache;
  }

  try {
    const vipContacts = await getVipContacts();
    vipEmailCache = new Set(
      vipContacts
        .filter(c => c.email)
        .map(c => c.email!.toLowerCase())
    );
    vipCacheExpiry = Date.now() + VIP_CACHE_TTL;
    return vipEmailCache;
  } catch (error) {
    console.error('Failed to load VIP cache:', error);
    return new Set();
  }
}

/**
 * Check if an email address belongs to a VIP
 */
export async function checkVipStatus(email: string): Promise<boolean> {
  const cache = await loadVipCache();
  return cache.has(email.toLowerCase());
}

/**
 * Clear VIP cache (call when VIP list is updated)
 */
export function clearVipCache(): void {
  vipEmailCache = null;
  vipCacheExpiry = 0;
}

/**
 * Enrich emails with VIP status
 */
async function enrichWithVipStatus(emails: Email[]): Promise<Email[]> {
  const cache = await loadVipCache();
  
  return emails.map(email => ({
    ...email,
    isVip: cache.has(email.from.toLowerCase()),
  }));
}

/**
 * Sort emails with VIPs first, then by date
 */
function sortEmailsVipFirst(emails: Email[]): Email[] {
  return [...emails].sort((a, b) => {
    // VIPs first
    if (a.isVip && !b.isVip) return -1;
    if (!a.isVip && b.isVip) return 1;
    // Then by date (newest first)
    return b.date.getTime() - a.date.getTime();
  });
}

/**
 * Get unread emails from Gmail
 */
export async function getUnreadEmails(
  maxResults: number = 20,
  email?: string
): Promise<Email[]> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread',
      maxResults,
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      emails.push(parseGmailMessage(fullMsg.data));
    }

    // Enrich with VIP status and sort VIPs first
    const enrichedEmails = await enrichWithVipStatus(emails);
    return sortEmailsVipFirst(enrichedEmails);
  } catch (error: any) {
    console.error('Error fetching unread emails:', error.message);
    throw new Error(`Failed to fetch unread emails: ${error.message}`);
  }
}

/**
 * Get recent emails (read or unread)
 */
export async function getRecentEmails(
  maxResults: number = 20,
  email?: string
): Promise<Email[]> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      emails.push(parseGmailMessage(fullMsg.data));
    }

    // Enrich with VIP status and sort VIPs first
    const enrichedEmails = await enrichWithVipStatus(emails);
    return sortEmailsVipFirst(enrichedEmails);
  } catch (error: any) {
    console.error('Error fetching recent emails:', error.message);
    throw new Error(`Failed to fetch recent emails: ${error.message}`);
  }
}

/**
 * Get a specific email thread with all messages
 */
export async function getEmailThread(
  threadId: string,
  email?: string
): Promise<EmailThread> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const thread = response.data;
    const messages: Email[] = [];

    for (const msg of thread.messages || []) {
      messages.push(parseGmailMessage(msg, true));
    }

    // Enrich messages with VIP status
    const enrichedMessages = await enrichWithVipStatus(messages);

    return {
      id: thread.id || threadId,
      subject: enrichedMessages[0]?.subject || '(No subject)',
      messages: enrichedMessages,
      snippet: thread.snippet || '',
      lastMessageDate: enrichedMessages[enrichedMessages.length - 1]?.date || new Date(),
    };
  } catch (error: any) {
    console.error('Error fetching email thread:', error.message);
    throw new Error(`Failed to fetch email thread: ${error.message}`);
  }
}

/**
 * Get a specific email by ID with full body
 */
export async function getEmail(
  messageId: string,
  email?: string
): Promise<Email> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const email_parsed = parseGmailMessage(response.data, true);
    
    // Enrich with VIP status
    const enriched = await enrichWithVipStatus([email_parsed]);
    return enriched[0];
  } catch (error: any) {
    console.error('Error fetching email:', error.message);
    throw new Error(`Failed to fetch email: ${error.message}`);
  }
}

/**
 * Get unread emails from VIP senders only
 */
export async function getVipEmails(
  maxResults: number = 20,
  email?: string
): Promise<Email[]> {
  // Get all unread emails first
  const allEmails = await getUnreadEmails(maxResults * 2, email);
  
  // Filter to only VIPs (they're already enriched)
  const vipEmails = allEmails.filter(e => e.isVip);
  
  return vipEmails.slice(0, maxResults);
}

/**
 * Search emails with a query
 */
export async function searchEmails(
  query: string,
  maxResults: number = 20,
  email?: string
): Promise<Email[]> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = response.data.messages || [];
    const emails: Email[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      });

      emails.push(parseGmailMessage(fullMsg.data));
    }

    // Enrich with VIP status and sort VIPs first
    const enrichedEmails = await enrichWithVipStatus(emails);
    return sortEmailsVipFirst(enrichedEmails);
  } catch (error: any) {
    console.error('Error searching emails:', error.message);
    throw new Error(`Failed to search emails: ${error.message}`);
  }
}

/**
 * Draft a reply to an email
 * NOTE: This should go through approval flow before being sent
 */
export async function draftReply(
  threadId: string,
  body: string,
  email?: string
): Promise<{ draftId: string; message: Email }> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  // Get the thread to find the last message
  const thread = await getEmailThread(threadId, email);
  const lastMessage = thread.messages[thread.messages.length - 1];

  // Build the reply headers
  const replyTo = lastMessage.from;
  const subject = lastMessage.subject.startsWith('Re:') 
    ? lastMessage.subject 
    : `Re: ${lastMessage.subject}`;

  const rawMessage = createRawEmail(replyTo, subject, body, threadId);

  try {
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          threadId,
          raw: rawMessage,
        },
      },
    });

    return {
      draftId: response.data.id || '',
      message: {
        id: response.data.message?.id || '',
        threadId,
        from: email || PRIMARY_EMAIL,
        to: [replyTo],
        subject,
        snippet: body.substring(0, 100),
        body,
        date: new Date(),
        isRead: true,
      },
    };
  } catch (error: any) {
    console.error('Error creating draft:', error.message);
    throw new Error(`Failed to create draft: ${error.message}`);
  }
}

/**
 * Create a new email draft
 * NOTE: This should go through approval flow before being sent
 */
export async function draftEmail(
  to: string[],
  subject: string,
  body: string,
  email?: string
): Promise<{ draftId: string; message: Email }> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  const rawMessage = createRawEmail(to.join(', '), subject, body);

  try {
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });

    return {
      draftId: response.data.id || '',
      message: {
        id: response.data.message?.id || '',
        threadId: response.data.message?.threadId || '',
        from: email || PRIMARY_EMAIL,
        to,
        subject,
        snippet: body.substring(0, 100),
        body,
        date: new Date(),
        isRead: true,
      },
    };
  } catch (error: any) {
    console.error('Error creating draft:', error.message);
    throw new Error(`Failed to create draft: ${error.message}`);
  }
}

/**
 * Send a draft email
 * NOTE: This should go through approval flow
 */
export async function sendDraft(
  draftId: string,
  email?: string
): Promise<Email> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    const response = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId,
      },
    });

    return parseGmailMessage(response.data);
  } catch (error: any) {
    console.error('Error sending draft:', error.message);
    throw new Error(`Failed to send draft: ${error.message}`);
  }
}

/**
 * Send an email directly (without creating a draft first)
 * NOTE: This should go through approval flow
 */
export async function sendEmail(
  to: string[],
  subject: string,
  body: string,
  email?: string
): Promise<Email> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  const rawMessage = createRawEmail(to.join(', '), subject, body);

  try {
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
      },
    });

    return parseGmailMessage(response.data);
  } catch (error: any) {
    console.error('Error sending email:', error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Mark an email as read
 */
export async function markAsRead(
  messageId: string,
  email?: string
): Promise<void> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });
  } catch (error: any) {
    console.error('Error marking email as read:', error.message);
    throw new Error(`Failed to mark email as read: ${error.message}`);
  }
}

/**
 * Archive an email (remove from inbox)
 */
export async function archiveEmail(
  messageId: string,
  email?: string
): Promise<void> {
  const gmail = await getGmailService(email || PRIMARY_EMAIL);
  if (!gmail) {
    throw new Error(`Cannot access Gmail for ${email || PRIMARY_EMAIL}`);
  }

  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });
  } catch (error: any) {
    console.error('Error archiving email:', error.message);
    throw new Error(`Failed to archive email: ${error.message}`);
  }
}

/**
 * Format emails as a readable summary
 */
export function formatEmailsSummary(emails: Email[]): string {
  if (emails.length === 0) {
    return 'No emails found.';
  }

  const lines: string[] = [];
  let currentDate = '';

  for (const email of emails) {
    const emailDate = email.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: USER_TIMEZONE,
    });

    if (emailDate !== currentDate) {
      if (currentDate) lines.push('');
      lines.push(`📅 **${emailDate}**`);
      currentDate = emailDate;
    }

    const time = email.date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: USER_TIMEZONE,
    });

    const readIndicator = email.isRead ? '' : '🔵 ';
    const vipIndicator = email.isVip ? '⭐ ' : '';
    const fromDisplay = email.fromName || email.from;

    lines.push(`${readIndicator}${vipIndicator}**${fromDisplay}** (${time})`);
    lines.push(`   ${email.subject}`);
    if (email.snippet) {
      lines.push(`   _${email.snippet.substring(0, 80)}..._`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a single email for display
 */
export function formatEmailDetail(email: Email): string {
  const lines: string[] = [];
  
  lines.push(`**From:** ${email.fromName ? `${email.fromName} <${email.from}>` : email.from}`);
  lines.push(`**To:** ${email.to.join(', ')}`);
  lines.push(`**Subject:** ${email.subject}`);
  lines.push(`**Date:** ${email.date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: USER_TIMEZONE,
  })}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(email.body || email.snippet || '(No content)');

  return lines.join('\n');
}

/**
 * Parse a Gmail API message into our Email interface
 */
function parseGmailMessage(
  msg: gmail_v1.Schema$Message,
  includeBody: boolean = false
): Email {
  const headers = msg.payload?.headers || [];
  const getHeader = (name: string) => 
    headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const fromHeader = getHeader('From');
  const fromMatch = fromHeader.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+)>?$/);
  const fromName = fromMatch?.[1]?.trim();
  const fromEmail = fromMatch?.[2]?.trim() || fromHeader;

  const toHeader = getHeader('To');
  const to = toHeader.split(',').map(t => t.trim()).filter(Boolean);

  const dateStr = getHeader('Date');
  const date = dateStr ? new Date(dateStr) : new Date();

  const isUnread = msg.labelIds?.includes('UNREAD') ?? false;

  let body = '';
  if (includeBody && msg.payload) {
    body = extractEmailBody(msg.payload);
  }

  return {
    id: msg.id || '',
    threadId: msg.threadId || '',
    from: fromEmail,
    fromName,
    to,
    subject: getHeader('Subject') || '(No subject)',
    snippet: msg.snippet || '',
    body,
    date,
    isRead: !isUnread,
    labels: msg.labelIds || [],
  };
}

/**
 * Extract email body from Gmail payload
 */
function extractEmailBody(payload: gmail_v1.Schema$MessagePart): string {
  // Check for plain text body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Check for HTML body (we'll strip tags for now)
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64(payload.body.data);
    return stripHtml(html);
  }

  // Check parts recursively
  if (payload.parts) {
    // Prefer plain text
    const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plainPart) {
      return extractEmailBody(plainPart);
    }

    // Fall back to HTML
    const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (htmlPart) {
      return extractEmailBody(htmlPart);
    }

    // Try multipart
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith('multipart/')) {
        const nested = extractEmailBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

/**
 * Decode base64 URL-safe string
 */
function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Strip HTML tags and decode entities
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create a raw email message for Gmail API
 */
function createRawEmail(
  to: string,
  subject: string,
  body: string,
  threadId?: string
): string {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ===========================================
// VIP Contact Management
// ===========================================

export interface VipContact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  twitter_handle?: string;
  facebook_id?: string;
  priority?: number;
  notes?: string;
}

/**
 * Add a VIP contact
 */
export async function addVipContact(contact: VipContact): Promise<void> {
  const { getSupabase } = await import('../../services/supabase.js');
  
  const { error } = await getSupabase()
    .from('vip_contacts')
    .insert({
      name: contact.name,
      email: contact.email?.toLowerCase(),
      phone: contact.phone,
      twitter_handle: contact.twitter_handle,
      facebook_id: contact.facebook_id,
      priority: contact.priority || 1,
      notes: contact.notes,
      suggested_by_bot: false,
      confirmed: true,
    });

  if (error) throw error;
  
  // Clear cache so new VIP is recognized immediately
  clearVipCache();
}

/**
 * Remove a VIP contact by email
 */
export async function removeVipContact(email: string): Promise<boolean> {
  const { getSupabase } = await import('../../services/supabase.js');
  
  const { data, error } = await getSupabase()
    .from('vip_contacts')
    .delete()
    .eq('email', email.toLowerCase())
    .select();

  if (error) throw error;
  
  // Clear cache
  clearVipCache();
  
  return (data?.length || 0) > 0;
}

/**
 * List all VIP contacts
 */
export async function listVipContacts(): Promise<VipContact[]> {
  const contacts = await getVipContacts();
  return contacts as VipContact[];
}

/**
 * Suggest a contact as VIP (bot-initiated)
 * This creates an unconfirmed entry that needs user approval
 */
export async function suggestAsVip(
  name: string,
  email: string,
  reason: string
): Promise<void> {
  await suggestVipContact({
    name,
    email: email.toLowerCase(),
    reason,
  });
}

/**
 * Confirm a suggested VIP contact
 */
export async function confirmVipSuggestion(email: string): Promise<boolean> {
  const { getSupabase } = await import('../../services/supabase.js');
  
  const { data, error } = await getSupabase()
    .from('vip_contacts')
    .update({ confirmed: true })
    .eq('email', email.toLowerCase())
    .eq('suggested_by_bot', true)
    .eq('confirmed', false)
    .select();

  if (error) throw error;
  
  // Clear cache
  clearVipCache();
  
  return (data?.length || 0) > 0;
}

/**
 * Get pending VIP suggestions (unconfirmed)
 */
export async function getPendingVipSuggestions(): Promise<VipContact[]> {
  const { getSupabase } = await import('../../services/supabase.js');
  
  const { data, error } = await getSupabase()
    .from('vip_contacts')
    .select('*')
    .eq('suggested_by_bot', true)
    .eq('confirmed', false);

  if (error) throw error;
  return (data || []) as VipContact[];
}
