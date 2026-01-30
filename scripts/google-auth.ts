/**
 * Google OAuth Token Generator
 * 
 * Run this script to authorize Google accounts and get refresh tokens.
 * 
 * Usage: npx tsx scripts/google-auth.ts
 */

import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials from config file or environment
let credentials: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const configPath = path.join(__dirname, '..', 'config', 'google-credentials.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  credentials = {
    clientId: config.installed.client_id,
    clientSecret: config.installed.client_secret,
    redirectUri: 'http://localhost:3456/oauth/callback',
  };
} else {
  credentials = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: 'http://localhost:3456/oauth/callback',
  };
}

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

async function main() {
  console.log('🔐 Google OAuth Token Generator\n');
  console.log('═'.repeat(60));
  
  if (!credentials.clientId || !credentials.clientSecret) {
    console.error('❌ Google credentials not found!');
    console.error('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    console.error('   Or place google-credentials.json in config/');
    process.exit(1);
  }

  console.log(`\n📋 Client ID: ${credentials.clientId.substring(0, 20)}...`);
  console.log(`📋 Redirect URI: ${credentials.redirectUri}`);
  console.log(`📋 Scopes: ${SCOPES.length} scopes requested\n`);

  const oauth2Client = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('═'.repeat(60));
  console.log('\n🌐 Opening authorization URL...\n');
  console.log('If the browser doesn\'t open, visit this URL:\n');
  console.log(authUrl);
  console.log('\n' + '═'.repeat(60));

  // Start local server to receive callback
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = url.parse(req.url || '', true);
      
      if (reqUrl.pathname === '/oauth/callback') {
        const code = reqUrl.query.code as string;
        
        if (!code) {
          res.writeHead(400);
          res.end('Error: No authorization code received');
          return;
        }

        console.log('\n✅ Authorization code received!');
        console.log('   Exchanging for tokens...\n');

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user email
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        console.log('═'.repeat(60));
        console.log(`\n🎉 SUCCESS! Authorized: ${email}\n`);
        console.log('📋 Tokens:\n');
        console.log(`   Access Token: ${tokens.access_token?.substring(0, 30)}...`);
        console.log(`   Refresh Token: ${tokens.refresh_token}`);
        console.log(`   Expiry: ${new Date(tokens.expiry_date || 0).toISOString()}`);
        console.log('\n' + '═'.repeat(60));
        
        console.log('\n📝 Add this refresh token to Railway environment variables:');
        console.log(`\n   GOOGLE_REFRESH_TOKEN_${email?.replace(/[@.]/g, '_').toUpperCase()}=${tokens.refresh_token}\n`);
        
        console.log('   Or store it in Supabase preferences table with key:');
        console.log(`   google_refresh_token_${email}\n`);

        // Send success response
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>SparkyBot - Authorization Success</title></head>
          <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px;">
            <h1>✅ Authorization Successful!</h1>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Refresh Token:</strong></p>
            <textarea style="width: 100%; height: 100px; font-family: monospace;" readonly>${tokens.refresh_token}</textarea>
            <p style="color: #666;">You can close this window and return to the terminal.</p>
            <p>Copy the refresh token above and add it to your environment variables.</p>
          </body>
          </html>
        `);

        // Close server after a delay
        setTimeout(() => {
          console.log('\n👋 Server shutting down...');
          console.log('\n🔄 To authorize another account, run this script again.\n');
          server.close();
          process.exit(0);
        }, 2000);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (error) {
      console.error('Error during OAuth:', error);
      res.writeHead(500);
      res.end('Error during authorization');
    }
  });

  server.listen(3456, () => {
    console.log('\n⏳ Waiting for authorization...');
    console.log('   (Server running on http://localhost:3456)\n');
    
    // Try to open browser
    const command = process.platform === 'win32' 
      ? `start "" "${authUrl}"`
      : process.platform === 'darwin'
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
    
    exec(command, (err: Error | null) => {
      if (err) {
        console.log('⚠️  Could not open browser automatically.');
        console.log('   Please open the URL above manually.\n');
      }
    });
  });
}

main().catch(console.error);
