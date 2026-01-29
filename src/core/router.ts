/**
 * Skill Router - Intent Classification and Routing
 * 
 * Handles autonomous routing of user messages to appropriate skills
 * without requiring explicit commands.
 * 
 * Flow: User Message → Intent Classifier → Skill Router → Execute Skill(s)
 */

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
}

// Skill registry - will be loaded from Supabase in production
const SKILL_REGISTRY: Skill[] = [
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
      'positions', 'gains', 'losses', 'analysis'
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
      'commit', 'push', 'pull request'
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
      'in progress', 'done', 'blocked'
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
      'notify me', 'set reminder'
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
 * Simple keyword-based intent classification
 * TODO: Replace with AI-based classification
 */
export function classifyIntent(message: string): RoutingResult[] {
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
