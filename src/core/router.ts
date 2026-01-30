/**
 * Skill Router - Intent Classification and Routing
 * 
 * Handles autonomous routing of user messages to appropriate skills
 * without requiring explicit commands.
 * 
 * Flow: User Message → Intent Classifier → Skill Router → Execute Skill(s)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { logAutonomyAction } from './memory.js';

export interface Skill {
  id: string;
  name: string;
  description: string;
  triggerPatterns: string[];
  requiredInputs: string[];
  outputs: string[];
  dependencies: string[];
  autonomyLevel: 'full' | 'approval_required';
  enabled: boolean;
}

export interface RoutingResult {
  skillId: string;
  confidence: number;
  extractedParams: Record<string, unknown>;
  requiresApproval: boolean;
  reasoning?: string;
}

export interface IntentClassification {
  primaryIntent: string;
  confidence: number;
  entities: Record<string, string>;
  reasoning: string;
}

// Skill registry - loaded from Supabase or fallback to defaults
let SKILL_REGISTRY: Skill[] = [];

// Default skills (used if Supabase not available)
const DEFAULT_SKILLS: Skill[] = [
  {
    id: 'calendar',
    name: 'Calendar Management',
    description: 'Manages Google Calendar - scheduling, viewing, modifying events',
    triggerPatterns: [
      'schedule', 'meeting', 'appointment', 'calendar', 'event',
      'when am i free', 'what\'s on my calendar', 'book time',
      'cancel meeting', 'reschedule', 'availability'
    ],
    requiredInputs: ['action', 'datetime?', 'title?', 'attendees?'],
    outputs: ['confirmation', 'event_details'],
    dependencies: [],
    autonomyLevel: 'approval_required',
    enabled: true,
  },
  {
    id: 'email',
    name: 'Email Management',
    description: 'Manages Gmail - reading, summarizing, drafting, sending emails',
    triggerPatterns: [
      'email', 'inbox', 'mail', 'message from', 'send to',
      'reply to', 'draft', 'unread', 'important emails'
    ],
    requiredInputs: ['action', 'recipient?', 'subject?', 'body?'],
    outputs: ['email_summary', 'draft', 'confirmation'],
    dependencies: [],
    autonomyLevel: 'approval_required',
    enabled: true,
  },
  {
    id: 'market',
    name: 'Market Intelligence',
    description: 'Stock and crypto market analysis, portfolio tracking',
    triggerPatterns: [
      'stock', 'market', 'portfolio', 'crypto', 'bitcoin',
      'price of', 'how\'s the market', 'investment', 'trading',
      'positions', 'gains', 'losses', 'analysis', 'nvda', 'aapl', 'tsla'
    ],
    requiredInputs: ['query_type', 'symbols?', 'timeframe?'],
    outputs: ['market_report', 'analysis', 'recommendations'],
    dependencies: [],
    autonomyLevel: 'full',
    enabled: true,
  },
  {
    id: 'code-exec',
    name: 'Code Execution',
    description: 'Executes coding tasks via Claude Code',
    triggerPatterns: [
      'code', 'program', 'script', 'fix bug', 'implement',
      'create function', 'refactor', 'debug', 'deploy',
      'commit', 'push', 'pull request', 'github'
    ],
    requiredInputs: ['task_description', 'repo?', 'files?'],
    outputs: ['code_output', 'commit_info', 'execution_result'],
    dependencies: [],
    autonomyLevel: 'approval_required',
    enabled: true,
  },
  {
    id: 'social',
    name: 'Social Media Management',
    description: 'Monitors and posts to X (Twitter) and Facebook',
    triggerPatterns: [
      'tweet', 'post', 'twitter', 'x.com', 'facebook',
      'social media', 'mentions', 'dm', 'direct message',
      'followers', 'engagement'
    ],
    requiredInputs: ['platform', 'action', 'content?'],
    outputs: ['post_draft', 'mentions_summary', 'engagement_report'],
    dependencies: [],
    autonomyLevel: 'approval_required',
    enabled: true,
  },
  {
    id: 'kanban',
    name: 'Project Management',
    description: 'Kanban board for task and project management',
    triggerPatterns: [
      'task', 'todo', 'project', 'kanban', 'board',
      'add task', 'complete', 'move to', 'backlog',
      'in progress', 'done', 'blocked', 'lifewave', 'vumira'
    ],
    requiredInputs: ['action', 'task_title?', 'status?', 'project?'],
    outputs: ['task_confirmation', 'board_summary'],
    dependencies: [],
    autonomyLevel: 'full',
    enabled: true,
  },
  {
    id: 'reminders',
    name: 'Reminders',
    description: 'Calendar-linked reminders and notifications',
    triggerPatterns: [
      'remind me', 'reminder', 'don\'t forget', 'alert me',
      'notify me', 'set reminder', 'remember to'
    ],
    requiredInputs: ['reminder_text', 'datetime'],
    outputs: ['reminder_confirmation'],
    dependencies: ['calendar'],
    autonomyLevel: 'full',
    enabled: true,
  },
  {
    id: 'general',
    name: 'Executive Assistant (General)',
    description: 'General queries, research, decision support - default handler',
    triggerPatterns: [], // Catches anything not matched by other skills
    requiredInputs: ['query'],
    outputs: ['response'],
    dependencies: [],
    autonomyLevel: 'full',
    enabled: true,
  },
];

/**
 * Initialize skill registry from Supabase
 */
export async function initializeSkillRegistry(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
        .eq('enabled', true);
      
      if (!error && data && data.length > 0) {
        SKILL_REGISTRY = data.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          triggerPatterns: s.trigger_patterns || [],
          requiredInputs: s.required_inputs || [],
          outputs: s.outputs || [],
          dependencies: s.dependencies || [],
          autonomyLevel: s.autonomy_level as 'full' | 'approval_required',
          enabled: s.enabled,
        }));
        console.log(`📚 Loaded ${SKILL_REGISTRY.length} skills from Supabase`);
        return;
      }
    } catch (err) {
      console.warn('Failed to load skills from Supabase, using defaults');
    }
  }
  
  SKILL_REGISTRY = DEFAULT_SKILLS;
  console.log(`📚 Using ${SKILL_REGISTRY.length} default skills`);
}

/**
 * AI-powered intent classification using Gemini
 */
export async function classifyIntentWithAI(
  message: string,
  genAI: GoogleGenerativeAI
): Promise<IntentClassification> {
  const skillDescriptions = SKILL_REGISTRY
    .filter(s => s.id !== 'general')
    .map(s => `- ${s.id}: ${s.description}`)
    .join('\n');

  const prompt = `You are an intent classifier for a personal executive assistant bot.

Available skills:
${skillDescriptions}
- general: For general conversation, questions, and anything that doesn't fit other categories

User message: "${message}"

Classify this message. Respond in JSON format only:
{
  "primaryIntent": "skill_id",
  "confidence": 0.0-1.0,
  "entities": { "key": "value" },
  "reasoning": "brief explanation"
}

Rules:
- Choose the most specific skill that matches
- Extract relevant entities (dates, names, symbols, etc.)
- Use "general" only if no other skill fits
- Confidence should reflect how certain you are`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        primaryIntent: parsed.primaryIntent || 'general',
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
        reasoning: parsed.reasoning || '',
      };
    }
  } catch (err) {
    console.error('AI classification failed, falling back to keyword matching:', err);
  }
  
  // Fallback to keyword matching
  const keywordResult = classifyIntentKeyword(message);
  return {
    primaryIntent: keywordResult[0]?.skillId || 'general',
    confidence: keywordResult[0]?.confidence || 0.5,
    entities: {},
    reasoning: 'Fallback to keyword matching',
  };
}

/**
 * Fast keyword-based intent classification (no API call)
 */
export function classifyIntentKeyword(message: string): RoutingResult[] {
  const lowerMessage = message.toLowerCase();
  const results: RoutingResult[] = [];
  
  for (const skill of SKILL_REGISTRY) {
    if (!skill.enabled || skill.id === 'general') continue;
    
    const matchedPatterns = skill.triggerPatterns.filter(pattern => 
      lowerMessage.includes(pattern.toLowerCase())
    );
    
    if (matchedPatterns.length > 0) {
      const confidence = Math.min(matchedPatterns.length / skill.triggerPatterns.length + 0.5, 1);
      results.push({
        skillId: skill.id,
        confidence,
        extractedParams: {},
        requiresApproval: skill.autonomyLevel === 'approval_required',
      });
    }
  }
  
  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);
  
  // If no matches, use general skill
  if (results.length === 0) {
    results.push({
      skillId: 'general',
      confidence: 1,
      extractedParams: {},
      requiresApproval: false,
    });
  }
  
  return results;
}

/**
 * Main routing function - determines which skill(s) to invoke
 */
export async function routeMessage(
  message: string,
  chatId: string,
  genAI?: GoogleGenerativeAI,
  useAI: boolean = false
): Promise<RoutingResult> {
  // Ensure registry is initialized
  if (SKILL_REGISTRY.length === 0) {
    await initializeSkillRegistry();
  }
  
  let classification: IntentClassification;
  
  if (useAI && genAI) {
    // Use AI for better classification (costs API call)
    classification = await classifyIntentWithAI(message, genAI);
  } else {
    // Use fast keyword matching
    const keywordResults = classifyIntentKeyword(message);
    classification = {
      primaryIntent: keywordResults[0].skillId,
      confidence: keywordResults[0].confidence,
      entities: {},
      reasoning: 'Keyword matching',
    };
  }
  
  const skill = getSkill(classification.primaryIntent);
  
  const result: RoutingResult = {
    skillId: classification.primaryIntent,
    confidence: classification.confidence,
    extractedParams: classification.entities,
    requiresApproval: skill?.autonomyLevel === 'approval_required',
    reasoning: classification.reasoning,
  };
  
  // Log the routing decision
  await logAutonomyAction(
    result.skillId,
    'route',
    {
      message: message.substring(0, 100),
      confidence: result.confidence,
      reasoning: result.reasoning,
    },
    undefined,
    'success'
  );
  
  return result;
}

/**
 * Get skill by ID
 */
export function getSkill(skillId: string): Skill | undefined {
  return SKILL_REGISTRY.find(s => s.id === skillId);
}

/**
 * Get all enabled skills
 */
export function getEnabledSkills(): Skill[] {
  return SKILL_REGISTRY.filter(s => s.enabled);
}

/**
 * Get skill registry (for testing/debugging)
 */
export function getSkillRegistry(): Skill[] {
  return SKILL_REGISTRY;
}
