# Google OAuth Setup Guide

This guide walks through setting up Google OAuth2 credentials for the JECRC Mail Priority Sync system.

## Prerequisites

- A Google Cloud Platform (GCP) account
- Access to Google Cloud Console: https://console.cloud.google.com

## Steps

### 1. Create or Select a GCP Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Note your project ID for reference

### 2. Enable Gmail API

1. Navigate to **APIs & Services > Library**
2. Search for "Gmail API"
3. Click on "Gmail API" and click **Enable**

### 3. Configure OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**
2. Select **External** user type (for test users mode)
3. Fill in the required fields:
   - **App name**: JECRC Mail Priority Sync
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes**
6. Add the following scope:
   - `https://www.googleapis.com/auth/gmail.readonly`
7. Click **Update** and then **Save and Continue**
8. On the **Test users** page, add test user emails (JECRC student emails)
   - **Important**: In test mode, only these emails can authenticate
   - You can add up to 100 test users without verification
9. Click **Save and Continue** and review your settings

### 4. Create OAuth2 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Application type: Web application**
4. Set the name: `JECRC Mail Sync Web Client`
5. Under **Authorized redirect URIs**, add:
   - For local development: `http://localhost:3000/auth/google/callback`
   - For production: `https://yourdomain.com/auth/google/callback`
6. Click **Create**
7. Copy the **Client ID** and **Client Secret** - you'll need these for your `.env` file

### 5. Configure Environment Variables

1. Copy `.env.example` to `.env` if you haven't already:

   ```bash
   cp .env.example .env
   ```

2. Update the following variables in `.env`:

   ```bash
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
   ```

3. Generate encryption keys:

   ```bash
   # Generate ENCRYPTION_KEY (32 bytes)
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

   # Generate JWT_SECRET (64 bytes)
   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
   ```

4. Add the generated keys to `.env`:
   ```bash
   ENCRYPTION_KEY=<output-from-first-command>
   JWT_SECRET=<output-from-second-command>
   ```

### 6. Run Database Migrations

Generate and run Prisma migrations to create the user and token tables:

```bash
npx pnpm@10.13.1 --filter @jecrc/database prisma:generate
npx pnpm@10.13.1 --filter @jecrc/database prisma migrate dev --name add-auth-tables
```

## Testing OAuth Flow

### 1. Start the Infrastructure

```bash
pnpm infra:up
```

### 2. Start the API

```bash
pnpm dev:api
```

### 3. Test the OAuth Flow

1. Open your browser and navigate to:

   ```
   http://localhost:3000/auth/google
   ```

2. You should be redirected to Google's consent screen

3. Sign in with a test user email (must be added in Step 3.8)

4. Grant the requested permissions (gmail.readonly)

5. You'll be redirected back to the callback URL with a response containing:

   ```json
   {
     "message": "Authentication successful",
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": "uuid",
       "email": "student@jecrcu.edu.in",
       "name": "Student Name"
     }
   }
   ```

6. Copy the `token` value for authenticated requests

### 4. Test Authenticated Endpoint

Use the token to access protected endpoints:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" http://localhost:3000/auth/me
```

Expected response:

```json
{
  "id": "uuid",
  "email": "student@jecrcu.edu.in",
  "name": "Student Name",
  "hasGmailToken": true,
  "createdAt": "2026-07-22T..."
}
```

## Important Security Notes

### Test User Mode

- Your app is currently in **test mode** (limited to 100 users)
- Only users explicitly added as test users can authenticate
- This is intentional to stay under Google's OAuth verification threshold
- **Do not** submit for verification unless expanding beyond pilot scope

### Refresh Token Security

- Refresh tokens are encrypted using AES-256-GCM before storage
- Never log or expose refresh tokens in API responses
- The encryption key must be kept secret and backed up securely
- Rotate the encryption key periodically in production

### JWT Secret

- Keep your JWT_SECRET secure and private
- Use a strong, randomly generated secret (at least 64 bytes)
- Never commit secrets to version control
- Rotate JWT secrets periodically in production

## Troubleshooting

### "No refresh token returned"

This usually means the user has already granted consent. Solutions:

1. Revoke access at https://myaccount.google.com/permissions
2. Re-authenticate through the OAuth flow
3. The `prompt: 'consent'` parameter forces consent on each auth

### "Access blocked: This app's request is invalid"

- Check that your redirect URI exactly matches what's configured in GCP Console
- Ensure the Gmail API is enabled for your project
- Verify the user is added as a test user

### "Invalid grant" error on token refresh

- The refresh token may have been revoked by the user
- The user needs to re-authenticate through the OAuth flow
- Check that the encrypted token is being decrypted correctly

## Next Steps

Once OAuth is working:

- Phase 2 will add Gmail Pub/Sub webhook setup
- Phase 2 will implement the actual Gmail message ingestion
- Consider implementing proper session management (HttpOnly cookies) for the dashboard
