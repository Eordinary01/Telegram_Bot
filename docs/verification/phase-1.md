# Phase 1 Verification

Phase 1 is complete when you can successfully authenticate with Google OAuth and store encrypted tokens in the database.

## Prerequisites

1. **Google OAuth Credentials**: Follow `docs/oauth-setup.md` to get your credentials
2. **Updated .env**: Your `.env` file must have valid values for:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `ENCRYPTION_KEY`

## Automated Checks

All quality checks must pass:

```bash
npx pnpm@10.13.1 typecheck
npx pnpm@10.13.1 test
npx pnpm@10.13.1 lint
npx pnpm@10.13.1 format:check
```

## Database Migration

Run Prisma migration to create User and GmailToken tables:

```bash
npx pnpm@10.13.1 --filter @jecrc/database prisma migrate dev --name add-auth-tables
```

Expected output:

```
Applying migration `20XX_add_auth_tables`
Your database is now in sync with your schema.
```

## Manual OAuth Flow Test

### 1. Start Infrastructure

```bash
pnpm infra:up
```

Verify PostgreSQL and Redis are running:

```bash
docker compose ps
```

### 2. Start API Server

```bash
pnpm dev:api
```

Expected output:

```
{"level":30,"time":...,"name":"jecrc-mail-sync","host":"0.0.0.0","port":3000,"msg":"API server is listening"}
```

### 3. Start Web Dashboard

In a new terminal:

```bash
pnpm dev:web
```

Expected output:

```
VITE vX.X.X  ready in XXX ms
➜  Local:   http://localhost:5173/
```

### 4. Test OAuth Flow

1. **Open browser**: Navigate to `http://localhost:5173`
2. **Click "Connect with Gmail"**: Should redirect to Google consent screen
3. **Sign in**: Use a test user email (must be added in Google Cloud Console)
4. **Grant permissions**: Approve access to "View your email messages and settings"
5. **Verify success**: You should see:
   ```
   ✅ Gmail Connected Successfully!
   Welcome, [Your Name/Email]
   Your Gmail is now connected. The system will automatically monitor your emails.
   ```

### 5. Verify Database Storage

Check that user and token were stored:

```bash
# Connect to PostgreSQL
docker exec -it gmail_automation_bot-postgres-1 psql -U jecrc -d jecrc_mail

# Query users
SELECT id, email, name, created_at FROM users;

# Query tokens (encrypted)
SELECT user_id, scope, created_at FROM gmail_tokens;

# Exit psql
\q
```

Expected results:

- One user record with your test email
- One gmail_tokens record with `gmail.readonly` scope
- `encrypted_refresh_token`, `encryption_iv`, and `encryption_auth_tag` fields populated

## Security Verification

### Verify Token Encryption

The refresh token should NEVER appear in plaintext. Check:

1. **Database inspection**: The `encrypted_refresh_token` field should be base64-encoded gibberish
2. **API logs**: No refresh tokens in console output (check for `[REDACTED]`)
3. **Network traffic**: OAuth callback doesn't return tokens to client

### Test Token Refresh

The system should be able to decrypt and use the stored refresh token:

```typescript
// This will be tested in Phase 2 when we implement Gmail API calls
// For now, verify encryption/decryption works in unit tests
```

## Cleanup

To reset and test again:

```bash
# Stop servers (Ctrl+C in each terminal)

# Clear database
docker exec -it gmail_automation_bot-postgres-1 psql -U jecrc -d jecrc_mail -c "TRUNCATE users CASCADE;"

# Or restart infrastructure
pnpm infra:down
pnpm infra:up
```

## Common Issues

### "This app is not verified"

**Solution**: Your app is in test mode. Click "Advanced" → "Go to [App Name] (unsafe)" → This is expected for internal apps under 100 users.

### "No refresh token returned"

**Causes**:

1. User already granted consent previously
2. `prompt: 'consent'` not working

**Solution**:

1. Revoke access at https://myaccount.google.com/permissions
2. Try OAuth flow again

### "Invalid redirect URI"

**Causes**:

1. Mismatch between `.env` value and Google Cloud Console
2. HTTP vs HTTPS mismatch

**Solution**: Ensure `GOOGLE_REDIRECT_URI` exactly matches the URI in Google Cloud Console (including trailing slash).

### Database connection error

**Solution**:

```bash
pnpm infra:up
pnpm check:connections
```

## What's Next

Phase 1 provides OAuth authentication. In Phase 2, we'll:

- Set up Gmail Pub/Sub push notifications
- Implement `users.watch()` for real-time email monitoring
- Create history sync worker to fetch new emails
- Store email metadata in database
