/**
 * Google Drive Service
 * 
 * Handles file uploads and management for SparkyBot
 */

import { getDriveService, PRIMARY_EMAIL } from './google-auth.js';
import { Readable } from 'stream';

// Default folder name for SparkyBot files
const SPARKYBOT_FOLDER_NAME = 'SparkyBot Reports';

/**
 * Find or create the SparkyBot folder in Google Drive
 */
export async function getOrCreateFolder(
  folderName: string = SPARKYBOT_FOLDER_NAME,
  email?: string
): Promise<string | null> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return null;

  try {
    // Search for existing folder
    const searchResponse = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id || null;
    }

    // Create new folder
    const createResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    console.log(`📁 Created folder: ${folderName}`);
    return createResponse.data.id || null;
  } catch (error) {
    console.error('Error getting/creating folder:', error);
    return null;
  }
}

/**
 * Upload a text file to Google Drive
 */
export async function uploadTextFile(
  fileName: string,
  content: string,
  folderId?: string,
  email?: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return null;

  try {
    // Get folder ID if not provided
    const targetFolderId = folderId || await getOrCreateFolder();
    if (!targetFolderId) {
      console.error('Could not get folder ID');
      return null;
    }

    // Create readable stream from content
    const stream = Readable.from([content]);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [targetFolderId],
      },
      media: {
        mimeType: 'text/plain',
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    console.log(`📄 Uploaded file: ${fileName}`);
    return {
      fileId: response.data.id || '',
      webViewLink: response.data.webViewLink || '',
    };
  } catch (error) {
    console.error('Error uploading text file:', error);
    return null;
  }
}

/**
 * Upload content as a Google Doc (native Google format)
 */
export async function uploadAsGoogleDoc(
  title: string,
  content: string,
  folderId?: string,
  email?: string
): Promise<{ fileId: string; webViewLink: string } | null> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return null;

  try {
    // Get folder ID if not provided
    const targetFolderId = folderId || await getOrCreateFolder();
    if (!targetFolderId) {
      console.error('Could not get folder ID');
      return null;
    }

    // Convert markdown/text to simple HTML for Google Docs
    const htmlContent = convertToSimpleHtml(content);
    const stream = Readable.from([htmlContent]);

    const response = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: [targetFolderId],
      },
      media: {
        mimeType: 'text/html',
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    console.log(`📝 Created Google Doc: ${title}`);
    return {
      fileId: response.data.id || '',
      webViewLink: response.data.webViewLink || '',
    };
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    return null;
  }
}

/**
 * Convert markdown-style text to simple HTML
 */
function convertToSimpleHtml(text: string): string {
  let html = text
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<html><body><p>${html}</p></body></html>`;
}

/**
 * List files in a folder
 */
export async function listFilesInFolder(
  folderId?: string,
  maxResults: number = 20,
  email?: string
): Promise<Array<{ id: string; name: string; webViewLink: string; createdTime: string }>> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return [];

  try {
    const targetFolderId = folderId || await getOrCreateFolder();
    if (!targetFolderId) return [];

    const response = await drive.files.list({
      q: `'${targetFolderId}' in parents and trashed=false`,
      fields: 'files(id, name, webViewLink, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: maxResults,
    });

    return (response.data.files || []).map(f => ({
      id: f.id || '',
      name: f.name || '',
      webViewLink: f.webViewLink || '',
      createdTime: f.createdTime || '',
    }));
  } catch (error) {
    console.error('Error listing files:', error);
    return [];
  }
}

/**
 * Delete a file by ID
 */
export async function deleteFile(
  fileId: string,
  email?: string
): Promise<boolean> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return false;

  try {
    await drive.files.delete({ fileId });
    console.log(`🗑️ Deleted file: ${fileId}`);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  fileId: string,
  email?: string
): Promise<{ name: string; webViewLink: string; size: string } | null> {
  const drive = await getDriveService(email || PRIMARY_EMAIL);
  if (!drive) return null;

  try {
    const response = await drive.files.get({
      fileId,
      fields: 'name, webViewLink, size',
    });

    return {
      name: response.data.name || '',
      webViewLink: response.data.webViewLink || '',
      size: response.data.size || '0',
    };
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return null;
  }
}
