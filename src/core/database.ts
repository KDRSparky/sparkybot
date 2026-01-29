/**
 * Supabase Database Integration
 * 
 * Handles:
 * - Conversation history persistence
 * - Memory/context storage (preferences, personal_details)
 * - VIP contacts
 * - Portfolio snapshots
 * - Market reports
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Types matching the schema
export interface Conversation {
  id?: string;
  telegram_chat_id: number;
  message_text: string;
  message_type: 'user' | 'assistant';
  skill_used?: string;
  created_at?: string;
  metadata?: Record<string, any>;
}

export interface Preference {
  id?: string;
  category: string;
  key: string;
  value: any;
  learned_from?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PersonalDetail {
  id?: string;
  detail_type: string;
  detail_key: string;
  detail_value: any;
  source?: string;
  confidence?: number;
  created_at?: string;
  updated_at?: string;
}

export interface VIPContact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  twitter_handle?: string;
  facebook_id?: string;
  priority?: number;
  notes?: string;
  suggested_by_bot?: boolean;
  confirmed?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioSnapshot {
  id?: string;
  snapshot_date: string;
  holdings: any;
  total_value: number;
  daily_change?: number;
  daily_change_pct?: number;
  created_at?: string;
}

export interface MarketReport {
  id?: string;
  report_type: 'morning' | 'midday' | 'afternoon' | 'overnight';
  report_date: string;
  content: any;
  delivered_via?: string;
  drive_file_id?: string;
  created_at?: string;
}

// Singleton client
let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function initSupabase(): SupabaseClient | null {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('⚠️ Supabase not configured - running without persistence');
    return null;
  }

  supabase = createClient(url, key);
  console.log('✅ Supabase connected');
  return supabase;
}

/**
 * Get Supabase client (initializes if needed)
 */
export function getSupabase(): SupabaseClient | null {
  if (!supabase) {
    return initSupabase();
  }
  return supabase;
}

// ============================================
// Conversation History
// ============================================

/**
 * Save a message to conversation history
 */
export async function saveMessage(
  chatId: number,
  messageType: 'user' | 'assistant',
  messageText: string,
  skillUsed?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    await db.from('conversations').insert({
      telegram_chat_id: chatId,
      message_type: messageType,
      message_text: messageText,
      skill_used: skillUsed,
      metadata,
    });
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

/**
 * Get recent conversation history for context
 */
export async function getRecentHistory(
  chatId: number,
  limit: number = 20
): Promise<Conversation[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from('conversations')
      .select('*')
      .eq('telegram_chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []).reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error fetching history:', error);
    return [];
  }
}

/**
 * Clear conversation history
 */
export async function clearHistory(chatId: number): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    await db.from('conversations').delete().eq('telegram_chat_id', chatId);
  } catch (error) {
    console.error('Error clearing history:', error);
  }
}

/**
 * Build Gemini history from database
 */
export async function buildGeminiHistory(chatId: number): Promise<Array<{role: string; parts: Array<{text: string}>}>> {
  const history = await getRecentHistory(chatId, 20);
  
  return history.map(msg => ({
    role: msg.message_type === 'user' ? 'user' : 'model',
    parts: [{ text: msg.message_text }],
  }));
}

// ============================================
// Preferences & Personal Details (Memory)
// ============================================

/**
 * Save or update a preference
 */
export async function savePreference(
  category: string,
  key: string,
  value: any,
  learnedFrom?: string
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    await db.from('preferences').upsert(
      {
        category,
        key,
        value,
        learned_from: learnedFrom,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'category,key' }
    );
  } catch (error) {
    console.error('Error saving preference:', error);
  }
}

/**
 * Get preferences by category
 */
export async function getPreferences(category?: string): Promise<Preference[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    let query = db.from('preferences').select('*');
    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return [];
  }
}

/**
 * Save a personal detail
 */
export async function savePersonalDetail(
  detailType: string,
  detailKey: string,
  detailValue: any,
  source?: string,
  confidence: number = 1.0
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    await db.from('personal_details').upsert(
      {
        detail_type: detailType,
        detail_key: detailKey,
        detail_value: detailValue,
        source,
        confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'detail_type,detail_key' }
    );
  } catch (error) {
    console.error('Error saving personal detail:', error);
  }
}

/**
 * Get all personal details for building context
 */
export async function getPersonalDetails(): Promise<PersonalDetail[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from('personal_details')
      .select('*')
      .order('confidence', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching personal details:', error);
    return [];
  }
}

// ============================================
// VIP Contacts
// ============================================

/**
 * Add or update a VIP contact
 */
export async function saveVIPContact(contact: Omit<VIPContact, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    await db.from('vip_contacts').upsert(
      {
        ...contact,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );
  } catch (error) {
    console.error('Error saving VIP contact:', error);
  }
}

/**
 * Get all VIP contacts
 */
export async function getVIPContacts(): Promise<VIPContact[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data, error } = await db
      .from('vip_contacts')
      .select('*')
      .order('priority', { ascending: false })
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching VIP contacts:', error);
    return [];
  }
}

/**
 * Search VIP contacts
 */
export async function findVIPContact(searchTerm: string): Promise<VIPContact | null> {
  const db = getSupabase();
  if (!db) return null;

  try {
    const { data, error } = await db
      .from('vip_contacts')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .limit(1)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    return null;
  }
}

// ============================================
// Portfolio & Market Reports
// ============================================

/**
 * Save a portfolio snapshot
 */
export async function savePortfolioSnapshot(
  holdings: any[],
  totalValue: number,
  dailyChange?: number,
  dailyChangePct?: number
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    
    await db.from('portfolio_snapshots').upsert(
      {
        snapshot_date: today,
        holdings,
        total_value: totalValue,
        daily_change: dailyChange,
        daily_change_pct: dailyChangePct,
      },
      { onConflict: 'snapshot_date' }
    );
  } catch (error) {
    console.error('Error saving portfolio snapshot:', error);
  }
}

/**
 * Get portfolio history
 */
export async function getPortfolioHistory(days: number = 30): Promise<PortfolioSnapshot[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await db
      .from('portfolio_snapshots')
      .select('*')
      .gte('snapshot_date', startDate.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    return [];
  }
}

/**
 * Save a market report
 */
export async function saveMarketReport(
  reportType: MarketReport['report_type'],
  content: any,
  deliveredVia?: string
): Promise<void> {
  const db = getSupabase();
  if (!db) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    
    await db.from('market_reports').insert({
      report_type: reportType,
      report_date: today,
      content,
      delivered_via: deliveredVia,
    });
  } catch (error) {
    console.error('Error saving market report:', error);
  }
}

/**
 * Get recent market reports
 */
export async function getRecentMarketReports(days: number = 7): Promise<MarketReport[]> {
  const db = getSupabase();
  if (!db) return [];

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await db
      .from('market_reports')
      .select('*')
      .gte('report_date', startDate.toISOString().split('T')[0])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching market reports:', error);
    return [];
  }
}
