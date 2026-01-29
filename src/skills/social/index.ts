/**
 * Social Media Skill
 * 
 * X (Twitter) and Facebook integration for SparkyBot
 * - Monitor mentions, DMs, followed accounts
 * - Draft posts (approval required)
 * - Post to user's personal accounts
 * - Immediate DM alerts
 */

export interface SocialPost {
  id: string;
  platform: 'twitter' | 'facebook';
  content: string;
  mediaUrls?: string[];
  status: 'draft' | 'pending_approval' | 'posted' | 'failed';
  postedAt?: Date;
  engagement?: {
    likes: number;
    shares: number;
    comments: number;
  };
}

export interface SocialMention {
  id: string;
  platform: 'twitter' | 'facebook';
  from: string;
  content: string;
  type: 'mention' | 'dm' | 'reply' | 'comment';
  timestamp: Date;
  isRead: boolean;
}

export interface SocialSkillConfig {
  platforms: ('twitter' | 'facebook')[];
  accounts: {
    twitter?: string;
    facebook?: string;
  };
  pollingIntervalActive: number;
  pollingIntervalInactive: number;
  dmAlertImmediate: boolean;
  monitorFollowed: boolean;
}

export const DEFAULT_CONFIG: SocialSkillConfig = {
  platforms: ['twitter', 'facebook'],
  accounts: {
    twitter: undefined, // To be configured
    facebook: undefined,
  },
  pollingIntervalActive: 30,
  pollingIntervalInactive: 60,
  dmAlertImmediate: true,
  monitorFollowed: true,
};

// TODO: Implement Twitter and Facebook API integration
export async function getMentions(platform: 'twitter' | 'facebook'): Promise<SocialMention[]> {
  throw new Error('Not implemented');
}

export async function getDMs(platform: 'twitter' | 'facebook'): Promise<SocialMention[]> {
  throw new Error('Not implemented');
}

export async function draftPost(platform: 'twitter' | 'facebook', content: string): Promise<SocialPost> {
  throw new Error('Not implemented');
}

export async function publishPost(postId: string): Promise<void> {
  throw new Error('Not implemented');
}

export async function getEngagementSummary(): Promise<string> {
  throw new Error('Not implemented');
}
