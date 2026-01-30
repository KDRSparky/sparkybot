/**
 * Base Skill Class
 * 
 * All skills extend this base class to ensure consistent interface
 * and behavior across the skill system.
 */

import { logAutonomyAction } from './memory.js';

export interface SkillInput {
  message: string;
  chatId: string;
  params: Record<string, unknown>;
  context?: {
    conversationHistory?: Array<{ role: string; content: string }>;
    userPreferences?: Record<string, unknown>;
  };
}

export interface SkillOutput {
  success: boolean;
  response: string;
  data?: unknown;
  requiresApproval?: boolean;
  approvalDetails?: {
    action: string;
    description: string;
    params: Record<string, unknown>;
  };
  error?: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  triggerPatterns: string[];
  autonomyLevel: 'full' | 'approval_required';
  enabled: boolean;
}

/**
 * Abstract base class for all skills
 */
export abstract class BaseSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly triggerPatterns: string[];
  readonly autonomyLevel: 'full' | 'approval_required';
  protected enabled: boolean;

  constructor(config: SkillConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.triggerPatterns = config.triggerPatterns;
    this.autonomyLevel = config.autonomyLevel;
    this.enabled = config.enabled;
  }

  /**
   * Check if this skill should handle the given message
   */
  matches(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return this.triggerPatterns.some(pattern => 
      lowerMessage.includes(pattern.toLowerCase())
    );
  }

  /**
   * Check if this action requires user approval
   */
  requiresApproval(action: string): boolean {
    return this.autonomyLevel === 'approval_required';
  }

  /**
   * Main execution method - must be implemented by subclasses
   */
  abstract execute(input: SkillInput): Promise<SkillOutput>;

  /**
   * Validate input before execution
   */
  protected validateInput(input: SkillInput): { valid: boolean; error?: string } {
    if (!input.message || input.message.trim().length === 0) {
      return { valid: false, error: 'Empty message' };
    }
    return { valid: true };
  }

  /**
   * Log skill execution for autonomy tracking
   */
  protected async logExecution(
    action: string,
    details: Record<string, unknown>,
    outcome: 'success' | 'failure' | 'pending_approval'
  ): Promise<void> {
    await logAutonomyAction(
      this.id,
      action,
      details,
      outcome !== 'pending_approval',
      outcome
    );
  }

  /**
   * Format response with Sparky's personality
   */
  protected formatResponse(
    content: string,
    includeDadJoke: boolean = false
  ): string {
    // Subclasses can override to add skill-specific formatting
    return content;
  }

  /**
   * Check if skill is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable the skill
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

/**
 * Skill that handles general conversation (default fallback)
 */
export class GeneralSkill extends BaseSkill {
  private generateResponse: (message: string) => Promise<string>;

  constructor(responseGenerator: (message: string) => Promise<string>) {
    super({
      id: 'general',
      name: 'Executive Assistant (General)',
      description: 'General queries, research, decision support',
      triggerPatterns: [],
      autonomyLevel: 'full',
      enabled: true,
    });
    this.generateResponse = responseGenerator;
  }

  matches(_message: string): boolean {
    // General skill matches everything as fallback
    return true;
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const validation = this.validateInput(input);
    if (!validation.valid) {
      return {
        success: false,
        response: validation.error || 'Invalid input',
        error: validation.error,
      };
    }

    try {
      const response = await this.generateResponse(input.message);
      
      await this.logExecution('respond', {
        messageLength: input.message.length,
        responseLength: response.length,
      }, 'success');

      return {
        success: true,
        response,
      };
    } catch (error: any) {
      await this.logExecution('respond', {
        error: error.message,
      }, 'failure');

      return {
        success: false,
        response: 'I had trouble processing that request.',
        error: error.message,
      };
    }
  }
}

/**
 * Skill registry for managing all active skills
 */
export class SkillRegistry {
  private skills: Map<string, BaseSkill> = new Map();
  private defaultSkill: BaseSkill | null = null;

  /**
   * Register a skill
   */
  register(skill: BaseSkill): void {
    this.skills.set(skill.id, skill);
    
    // Set general as default
    if (skill.id === 'general') {
      this.defaultSkill = skill;
    }
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): BaseSkill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get the default skill
   */
  getDefault(): BaseSkill | null {
    return this.defaultSkill;
  }

  /**
   * Get all registered skills
   */
  getAll(): BaseSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all enabled skills
   */
  getEnabled(): BaseSkill[] {
    return this.getAll().filter(s => s.isEnabled());
  }

  /**
   * Find the best matching skill for a message
   */
  findMatch(message: string): BaseSkill | null {
    // Try to find a specific skill that matches
    for (const skill of this.getEnabled()) {
      if (skill.id !== 'general' && skill.matches(message)) {
        return skill;
      }
    }
    
    // Fall back to default skill
    return this.defaultSkill;
  }

  /**
   * Execute a skill by ID
   */
  async execute(skillId: string, input: SkillInput): Promise<SkillOutput> {
    const skill = this.get(skillId);
    
    if (!skill) {
      return {
        success: false,
        response: `Skill "${skillId}" not found`,
        error: 'SKILL_NOT_FOUND',
      };
    }

    if (!skill.isEnabled()) {
      return {
        success: false,
        response: `Skill "${skillId}" is currently disabled`,
        error: 'SKILL_DISABLED',
      };
    }

    return skill.execute(input);
  }
}

// Export a singleton registry
export const skillRegistry = new SkillRegistry();
