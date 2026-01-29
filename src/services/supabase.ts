/**
 * Supabase Service
 * 
 * Database operations for SparkyBot
 * All tables use Row Level Security
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient;

export function initSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role for full access
    );
  }
  return supabase;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase not initialized. Call initSupabase() first.');
  }
  return supabase;
}

// ===========================================
// Conversation History (30-day retention)
// ===========================================

export async function saveMessage(
  chatId: number,
  text: string,
  type: 'user' | 'assistant',
  skillUsed?: string
) {
  const { error } = await getSupabase()
    .from('conversations')
    .insert({
      telegram_chat_id: chatId,
      message_text: text,
      message_type: type,
      skill_used: skillUsed,
    });
  
  if (error) throw error;
}

export async function getRecentMessages(chatId: number, limit: number = 20) {
  const { data, error } = await getSupabase()
    .from('conversations')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data?.reverse() || [];
}

// ===========================================
// Preferences
// ===========================================

export async function getPreference(category: string, key: string) {
  const { data, error } = await getSupabase()
    .from('preferences')
    .select('value')
    .eq('category', category)
    .eq('key', key)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error; // Ignore not found
  return data?.value;
}

export async function setPreference(category: string, key: string, value: unknown, source?: string) {
  const { error } = await getSupabase()
    .from('preferences')
    .upsert({
      category,
      key,
      value,
      learned_from: source,
      updated_at: new Date().toISOString(),
    });
  
  if (error) throw error;
}

// ===========================================
// VIP Contacts
// ===========================================

export async function getVipContacts() {
  const { data, error } = await getSupabase()
    .from('vip_contacts')
    .select('*')
    .eq('confirmed', true)
    .order('priority', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function isVipEmail(email: string): Promise<boolean> {
  const { data } = await getSupabase()
    .from('vip_contacts')
    .select('id')
    .eq('email', email)
    .eq('confirmed', true)
    .single();
  
  return !!data;
}

export async function suggestVipContact(contact: {
  name: string;
  email?: string;
  reason: string;
}) {
  const { error } = await getSupabase()
    .from('vip_contacts')
    .insert({
      name: contact.name,
      email: contact.email,
      notes: contact.reason,
      suggested_by_bot: true,
      confirmed: false,
    });
  
  if (error) throw error;
}

// ===========================================
// Approval Queue
// ===========================================

export async function createApprovalRequest(
  skillId: string,
  actionType: string,
  details: unknown,
  telegramMessageId?: number
) {
  const { data, error } = await getSupabase()
    .from('approval_queue')
    .insert({
      skill_id: skillId,
      action_type: actionType,
      action_details: details,
      telegram_message_id: telegramMessageId,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function resolveApproval(
  id: string,
  status: 'approved' | 'rejected' | 'modified',
  response?: unknown
) {
  const { error } = await getSupabase()
    .from('approval_queue')
    .update({
      status,
      user_response: response,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);
  
  if (error) throw error;
}

export async function getPendingApprovals() {
  const { data, error } = await getSupabase()
    .from('approval_queue')
    .select('*')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

// ===========================================
// Autonomy Tracking
// ===========================================

export async function logAutonomyAction(
  skillId: string,
  actionType: string,
  details: unknown,
  approved: boolean,
  outcome: 'success' | 'failure' | 'modified'
) {
  const { error } = await getSupabase()
    .from('autonomy_log')
    .insert({
      skill_id: skillId,
      action_type: actionType,
      action_details: details,
      user_approved: approved,
      outcome,
    });
  
  if (error) throw error;
}

export async function getSkillAccuracy(skillId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await getSupabase()
    .from('autonomy_log')
    .select('outcome')
    .eq('skill_id', skillId)
    .gte('created_at', since);
  
  if (error) throw error;
  if (!data || data.length === 0) return null;
  
  const successes = data.filter(d => d.outcome === 'success').length;
  return successes / data.length;
}
