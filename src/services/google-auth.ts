/**
 * Google OAuth2 Authentication Service
 * 
 * Handles OAuth token management for Google APIs (Calendar, Gmail, Drive)
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { supabase, isSupabaseConfigured } from '../core/supabase.js';

// Google OAuth scopes
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
];

/**
 * Get credentials at runtime (not module load time)
 */
function getCredentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3456/oauth/callback',
  };
}

// Map email to environment variable name for refresh tokens
const refreshTokenEnvMap: Record<string, string> = {
  'johndempsey@johndempsey.us': 'GOOGLE_REFRESH_TOKEN_JOHNDEMPSEY',
  'kdrsparky@gmail.com': 'GOOGLE_REFRESH_TOKEN_KDRSPARKY',
};

/**
 * Get refresh token from environment (called at runtime, not module load)
 */
function getRefreshTokenFromEnv(email: string): string | null {
  const envVar = refreshTokenEnvMap[email];
  if (envVar) {
    return process.env[envVar] || null;
  }
  return null;
}

// Primary email for Calendar/Gmail operations
export const PRIMARY_EMAIL = process.env.GOOGLE_PRIMARY_EMAIL || 'johndempsey@johndempsey.us';

/**
 * Create an OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  const creds = getCredentials();
  return new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    creds.redirectUri
  );
}

/**
 * Generate authorization URL for user to grant access
 */
export function getAuthUrl(oauth2Client?: OAuth2Client): string {
  const client = oauth2Client || createOAuth2Client();
  
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function getTokensFromCode(
  code: string,
  oauth2Client?: OAuth2Client
): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}> {
  const client = oauth2Client || createOAuth2Client();
  const { tokens } = await client.getToken(code);
  
  return {
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token || '',
    expiry_date: tokens.expiry_date || 0,
  };
}

/**
 * Store refresh token in Supabase
 */
export async function storeRefreshToken(
  email: string,
  refreshToken: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('Supabase not configured, cannot store refresh token');
    return false;
  }

  try {
    const { error } = await supabase
      .from('preferences')
      .upsert({
        category: 'google_oauth',
        key: `refresh_token_${email}`,
        value: { refresh_token: refreshToken, email },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'category,key' });

    if (error) {
      console.error('Failed to store refresh token:', error);
      return false;
    }

    console.log(`✅ Stored refresh token for ${email}`);
    return true;
  } catch (err) {
    console.error('Error storing refresh token:', err);
    return false;
  }
}

/**
 * Get refresh token from Supabase or environment
 */
export async function getRefreshToken(email: string): Promise<string | null> {
  // First try Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('preferences')
        .select('value')
        .eq('category', 'google_oauth')
        .eq('key', `refresh_token_${email}`)
        .single();

      if (!error && data?.value?.refresh_token) {
        return data.value.refresh_token;
      }
    } catch (err) {
      // Fall through to environment variable
    }
  }

  // Fallback to environment variable (read at runtime)
  return getRefreshTokenFromEnv(email);
}

/**
 * Get authenticated OAuth2 client for a specific email
 */
export async function getAuthenticatedClient(email: string): Promise<OAuth2Client | null> {
  const refreshToken = await getRefreshToken(email);
  
  if (!refreshToken) {
    console.warn(`No refresh token found for ${email}`);
    return null;
  }

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  // Force token refresh to ensure we have a valid access token
  try {
    await client.getAccessToken();
    return client;
  } catch (err) {
    console.error(`Failed to refresh token for ${email}:`, err);
    return null;
  }
}

/**
 * Check if Google credentials are configured
 */
export function isGoogleConfigured(): boolean {
  const creds = getCredentials();
  return !!(creds.clientId && creds.clientSecret);
}

/**
 * Get Google Calendar service
 */
export async function getCalendarService(email?: string) {
  const targetEmail = email || PRIMARY_EMAIL;
  const auth = await getAuthenticatedClient(targetEmail);
  if (!auth) {
    console.error(`Cannot get Calendar service - no auth for ${targetEmail}`);
    return null;
  }
  
  return google.calendar({ version: 'v3', auth });
}

/**
 * Get Gmail service
 */
export async function getGmailService(email?: string) {
  const targetEmail = email || PRIMARY_EMAIL;
  const auth = await getAuthenticatedClient(targetEmail);
  if (!auth) {
    console.error(`Cannot get Gmail service - no auth for ${targetEmail}`);
    return null;
  }
  
  return google.gmail({ version: 'v1', auth });
}

/**
 * Get Google Drive service
 */
export async function getDriveService(email?: string) {
  const targetEmail = email || PRIMARY_EMAIL;
  const auth = await getAuthenticatedClient(targetEmail);
  if (!auth) {
    console.error(`Cannot get Drive service - no auth for ${targetEmail}`);
    return null;
  }
  
  return google.drive({ version: 'v3', auth });
}

/**
 * Test Google API connection
 */
export async function testGoogleConnection(email?: string): Promise<{
  success: boolean;
  email: string;
  services: {
    calendar: boolean;
    gmail: boolean;
    drive: boolean;
  };
  error?: string;
}> {
  const targetEmail = email || PRIMARY_EMAIL;
  const result = {
    success: false,
    email: targetEmail,
    services: {
      calendar: false,
      gmail: false,
      drive: false,
    },
  };

  try {
    // Test Calendar
    const calendar = await getCalendarService(targetEmail);
    if (calendar) {
      const calList = await calendar.calendarList.list({ maxResults: 1 });
      result.services.calendar = !!calList.data.items;
    }

    // Test Gmail
    const gmail = await getGmailService(targetEmail);
    if (gmail) {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      result.services.gmail = !!profile.data.emailAddress;
    }

    // Test Drive
    const drive = await getDriveService(targetEmail);
    if (drive) {
      const about = await drive.about.get({ fields: 'user' });
      result.services.drive = !!about.data.user;
    }

    result.success = result.services.calendar || result.services.gmail || result.services.drive;
    return result;
  } catch (err: any) {
    return {
      ...result,
      error: err.message,
    };
  }
}
