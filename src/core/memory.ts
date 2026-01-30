/**
 * Memory Service
 * 
 * Persistent conversation memory using Supabase
 * Falls back to in-memory storage if Supabase not configured
 */

import { supabase, isSupabaseConfigured } from './supabase.js';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  skill_used?: string;
}

export interface Preference {
  category: string;
  key: string;
  value: any;
}

export interface PersonalDetail {
  detail_type: string;
  detail_key: string;
  detail_value: any;
  confidence?: number;
}

// In-memory fallback
const conversationCache = new Map<string, ConversationMessage[]>();
const preferencesCache = new Map<string, any>();
const detailsCache: PersonalDetail[] = [];

/**
 * Store conversation message
 */
export async function storeConversationMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  skillUsed?: string
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('conversations')
      .insert({
        telegram_chat_id: parseInt(chatId),
        message_text: content,
        message_type: role,
        skill_used: skillUsed,
      });
    
    if (error) {
      console.error('Error storing conversation:', error);
    }
  } else {
    // Fallback to in-memory
    if (!conversationCache.has(chatId)) {
      conversationCache.set(chatId, []);
    }
    conversationCache.get(chatId)!.push({
      role,
      content,
      timestamp: new Date(),
      skill_used: skillUsed,
    });
    
    // Keep only last 100 messages in memory
    const messages = conversationCache.get(chatId)!;
    if (messages.length > 100) {
      conversationCache.set(chatId, messages.slice(-100));
    }
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  chatId: string,
  limit = 20
): Promise<ConversationMessage[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('conversations')
      .select('message_type, message_text, created_at, skill_used')
      .eq('telegram_chat_id', parseInt(chatId))
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching conversation:', error);
      return [];
    }
    
    return (data || []).reverse().map(msg => ({
      role: msg.message_type as 'user' | 'assistant',
      content: msg.message_text,
      timestamp: new Date(msg.created_at),
      skill_used: msg.skill_used,
    }));
  } else {
    // Fallback to in-memory
    const messages = conversationCache.get(chatId) || [];
    return messages.slice(-limit);
  }
}

/**
 * Clear conversation history
 */
export async function clearConversation(chatId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('telegram_chat_id', parseInt(chatId));
    
    if (error) {
      console.error('Error clearing conversation:', error);
    }
  } else {
    conversationCache.delete(chatId);
  }
}

/**
 * Store a user preference
 */
export async function storePreference(
  category: string,
  key: string,
  value: any,
  learnedFrom?: string
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('preferences')
      .upsert({
        category,
        key,
        value,
        learned_from: learnedFrom,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'category,key',
      });
    
    if (error) {
      console.error('Error storing preference:', error);
    }
  } else {
    preferencesCache.set(`${category}:${key}`, value);
  }
}

/**
 * Get preferences by category
 */
export async function getPreferences(category?: string): Promise<Preference[]> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('preferences').select('*');
    
    if (category) {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching preferences:', error);
      return [];
    }
    
    return (data || []).map(p => ({
      category: p.category,
      key: p.key,
      value: p.value,
    }));
  } else {
    const prefs: Preference[] = [];
    preferencesCache.forEach((value, key) => {
      const [cat, k] = key.split(':');
      if (!category || cat === category) {
        prefs.push({ category: cat, key: k, value });
      }
    });
    return prefs;
  }
}

/**
 * Store a personal detail
 */
export async function storePersonalDetail(
  detailType: string,
  detailKey: string,
  detailValue: any,
  source?: string,
  confidence = 1.0
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('personal_details')
      .upsert({
        detail_type: detailType,
        detail_key: detailKey,
        detail_value: detailValue,
        source,
        confidence,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'detail_type,detail_key',
      });
    
    if (error) {
      console.error('Error storing personal detail:', error);
    }
  } else {
    detailsCache.push({
      detail_type: detailType,
      detail_key: detailKey,
      detail_value: detailValue,
      confidence,
    });
  }
}

/**
 * Get personal details
 */
export async function getPersonalDetails(detailType?: string): Promise<PersonalDetail[]> {
  if (isSupabaseConfigured && supabase) {
    let query = supabase.from('personal_details').select('*');
    
    if (detailType) {
      query = query.eq('detail_type', detailType);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching personal details:', error);
      return [];
    }
    
    return (data || []).map(d => ({
      detail_type: d.detail_type,
      detail_key: d.detail_key,
      detail_value: d.detail_value,
      confidence: d.confidence,
    }));
  } else {
    return detailType 
      ? detailsCache.filter(d => d.detail_type === detailType)
      : detailsCache;
  }
}

/**
 * Log an autonomous action
 */
export async function logAutonomyAction(
  skillId: string,
  actionType: string,
  actionDetails: Record<string, any>,
  userApproved?: boolean,
  outcome?: string
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('autonomy_log')
      .insert({
        skill_id: skillId,
        action_type: actionType,
        action_details: actionDetails,
        user_approved: userApproved,
        outcome,
      });
    
    if (error) {
      console.error('Error logging autonomy action:', error);
    }
  }
}

/**
 * Store portfolio snapshot
 */
export async function storePortfolioSnapshot(
  holdings: any[],
  totalValue: number,
  dailyChange: number,
  dailyChangePct: number
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('portfolio_snapshots')
      .insert({
        snapshot_date: new Date().toISOString().split('T')[0],
        holdings,
        total_value: totalValue,
        daily_change: dailyChange,
        daily_change_pct: dailyChangePct,
      });
    
    if (error) {
      console.error('Error storing portfolio snapshot:', error);
    }
  }
}

/**
 * Store market report
 */
export async function storeMarketReport(
  reportType: 'morning' | 'midday' | 'afternoon' | 'overnight',
  content: any,
  deliveredVia?: string,
  driveFileId?: string
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('market_reports')
      .insert({
        report_type: reportType,
        report_date: new Date().toISOString().split('T')[0],
        content,
        delivered_via: deliveredVia,
        drive_file_id: driveFileId,
      });
    
    if (error) {
      console.error('Error storing market report:', error);
    }
  }
}

/**
 * Build context from memories for AI
 */
export async function buildMemoryContext(chatId: string): Promise<string> {
  const [prefs, details, recentConvo] = await Promise.all([
    getPreferences(),
    getPersonalDetails(),
    getConversationHistory(chatId, 5),
  ]);
  
  let context = '';
  
  if (details.length > 0) {
    context += '\n\n## Known Facts About User\n';
    for (const detail of details.slice(0, 10)) {
      context += `- ${detail.detail_key}: ${JSON.stringify(detail.detail_value)}\n`;
    }
  }
  
  if (prefs.length > 0) {
    context += '\n## User Preferences\n';
    for (const pref of prefs.slice(0, 10)) {
      context += `- ${pref.category}/${pref.key}: ${JSON.stringify(pref.value)}\n`;
    }
  }
  
  if (recentConvo.length > 0) {
    context += '\n## Recent Conversation Context\n';
    context += '(Last few exchanges for continuity)\n';
  }
  
  return context;
}

/**
 * Check database connection
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }
  
  try {
    const { error } = await supabase.from('skills').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Get conversation history formatted for Gemini API
 * Returns array in Gemini Content format: { role: 'user' | 'model', parts: [{ text }] }
 */
export async function getGeminiHistory(
  chatId: string,
  limit = 10
): Promise<Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>> {
  const history = await getConversationHistory(chatId, limit);
  
  return history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));
}
