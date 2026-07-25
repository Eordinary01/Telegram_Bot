import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import type { AppConfig } from '@jecrc/config';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
export const USERINFO_PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.profile';

/**
 * Creates a configured OAuth2 client for Google APIs.
 */
export function createOAuth2Client(config: AppConfig): OAuth2Client {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}

/**
 * Generates the authorization URL for the OAuth flow.
 * @param oauth2Client - Configured OAuth2 client
 * @param state - Optional state parameter for CSRF protection
 * @returns Authorization URL to redirect user to
 */
export function getAuthorizationUrl(oauth2Client: OAuth2Client, state?: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: Record<string, any> = {
    access_type: 'offline', // Required to get refresh token
    scope: [GMAIL_READONLY_SCOPE, USERINFO_EMAIL_SCOPE, USERINFO_PROFILE_SCOPE],
    prompt: 'consent', // Force consent to ensure refresh token on first auth
  };

  if (state) {
    options.state = state;
  }

  return oauth2Client.generateAuthUrl(options);
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string;
}

/**
 * Exchanges authorization code for tokens.
 * @param oauth2Client - Configured OAuth2 client
 * @param code - Authorization code from OAuth callback
 * @returns Token data including refresh token
 */
export async function exchangeCodeForTokens(
  oauth2Client: OAuth2Client,
  code: string,
): Promise<TokenExchangeResult> {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('No access token returned from Google OAuth');
  }

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token returned from Google OAuth. User may need to revoke access and re-authenticate.',
    );
  }

  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt,
    scope: tokens.scope ?? GMAIL_READONLY_SCOPE,
  };
}

/**
 * Refreshes an expired access token using a refresh token.
 * @param oauth2Client - Configured OAuth2 client
 * @param refreshToken - Valid refresh token
 * @returns New access token and expiry
 */
export async function refreshAccessToken(
  oauth2Client: OAuth2Client,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date | null }> {
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('No access token returned from refresh');
  }

  const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

  return {
    accessToken: credentials.access_token,
    expiresAt,
  };
}

/**
 * Retrieves user info from Google using an access token.
 * @param accessToken - Valid access token
 * @returns User email and name
 */
export async function getUserInfo(
  accessToken: string,
): Promise<{ email: string; name: string | null }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const { data } = await oauth2.userinfo.get();

  if (!data.email) {
    throw new Error('No email returned from Google user info');
  }

  return {
    email: data.email,
    name: data.name ?? null,
  };
}
