/**
 * Kanban / Project Management Skill
 * 
 * Task and project management for SparkyBot
 * - Personal tasks + LifeWave + Vumira projects
 * - Telegram inline keyboards + Web UI
 * - GitHub issues sync
 * - Anomaly tickets mixed in (tagged)
 */

export interface KanbanCard {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 1 | 2 | 3 | 4 | 5; // 1 = highest
  dueDate?: Date;
  githubIssueId?: number;
  githubIssueUrl?: string;
  isAnomaly: boolean;
  anomalyDetails?: {
    skillId: string;
    errorMessage: string;
    retryCount: number;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  githubRepo?: string;
  status: 'active' | 'completed' | 'archived';
}

export interface KanbanSkillConfig {
  defaultProject: string;
  syncWithGithub: boolean;
  telegramKeyboards: boolean;
}

export const DEFAULT_CONFIG: KanbanSkillConfig = {
  defaultProject: 'Personal',
  syncWithGithub: true,
  telegramKeyboards: true,
};

// Default projects
export const DEFAULT_PROJECTS: Project[] = [
  { id: 'personal', name: 'Personal', status: 'active' },
  { id: 'lifewave', name: 'LifeWave', githubRepo: 'lifewave', status: 'active' },
  { id: 'vumira', name: 'Vumira', githubRepo: 'vumira', status: 'active' },
];

// TODO: Implement Kanban with Supabase and GitHub sync
export async function createCard(card: Partial<KanbanCard>): Promise<KanbanCard> {
  throw new Error('Not implemented');
}

export async function updateCard(id: string, updates: Partial<KanbanCard>): Promise<KanbanCard> {
  throw new Error('Not implemented');
}

export async function moveCard(id: string, status: KanbanCard['status']): Promise<KanbanCard> {
  throw new Error('Not implemented');
}

export async function getCardsByProject(projectId: string): Promise<KanbanCard[]> {
  throw new Error('Not implemented');
}

export async function getCardsByStatus(status: KanbanCard['status']): Promise<KanbanCard[]> {
  throw new Error('Not implemented');
}

export async function createAnomalyTicket(skillId: string, error: Error): Promise<KanbanCard> {
  throw new Error('Not implemented');
}

export async function syncWithGithub(projectId: string): Promise<void> {
  throw new Error('Not implemented');
}

// Generate Telegram inline keyboard for card management
export function generateCardKeyboard(card: KanbanCard) {
  const statuses: KanbanCard['status'][] = ['backlog', 'todo', 'in_progress', 'review', 'done'];
  return {
    inline_keyboard: statuses
      .filter(s => s !== card.status)
      .map(status => [{
        text: `Move to ${status.replace('_', ' ')}`,
        callback_data: `kanban:move:${card.id}:${status}`,
      }]),
  };
}
