# Clean Plate Command Center Production Hosting Path

This app can be moved from a Perplexity preview into a real private business web app at a domain like `app.cleanplatehaulingco.com`.

## Recommended setup

Use this order:

1. **Render, Railway, or Fly.io for the full-stack app**: host the Node/Express backend and React frontend together.
2. **A private subdomain**: `app.cleanplatehaulingco.com`.
3. **Host secret manager**: store app password, OpenAI key, and Google credentials as environment variables.
4. **Google Cloud project**: create proper Google Sheets and Gmail OAuth/service-account credentials for standalone hosting.
5. **GitHub repo**: deploy from GitHub after owner-approved app changes.

The app now includes a Dockerfile, Render blueprint, environment template, basic private access gate, and health check.

## Live-data runtime modes

The backend now supports two Google runtimes:

1. **Perplexity connector mode**: if standalone Google OAuth secrets are not set, the app keeps using the connected Perplexity Google Sheets/Gmail tools. This preserves the current preview behavior.
2. **Standalone Google OAuth mode**: if `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` are set, the app calls Google Sheets and Gmail directly from the server.

This means the same app can run inside Perplexity today and move to real hosting later without losing live CRM, Sheet sync, AI logs, or Gmail invoice sending.

## What is safe now

- **No secrets in frontend JavaScript**: all Google/Gmail/AI calls stay on the Express server.
- **Outer private app gate**: set `APP_BASIC_AUTH_USER` and `APP_BASIC_AUTH_PASSWORD` in production to require browser Basic Auth before the app opens.
- **Inner owner login**: set `APP_LOGIN_PASSWORD` so the app shows an owner login screen and protects live API routes with a server-issued token.
- **Health check**: `/api/healthz` lets hosting platforms verify the app is alive without exposing CRM data.
- **Sheet config moved to env vars**: the CRM Sheet ID and tab names can be changed without code edits.
- **Dashboard link moved to env vars**: invoice/email links can point to the real app domain later.

## Environment variables

Set these in the host secret manager:

```bash
NODE_ENV=production
PORT=5000
APP_BASIC_AUTH_USER=owner
APP_BASIC_AUTH_PASSWORD=<long random password>
APP_LOGIN_PASSWORD=<different long random owner password>
APP_ACCESS_TOKEN_TTL_MINUTES=720
OPENAI_API_KEY=<server-side AI key>
GOOGLE_SHEETS_CRM_ID=1empthEL88RFmo4tLy3i84V_IBjlKSYCSK9n9F06OpFA
GOOGLE_SHEETS_CRM_NAME=Junk Removal Business Tracker
GOOGLE_SHEETS_CRM_TAB=CRM
GOOGLE_SHEETS_JOB_TAB=Job Entry
GOOGLE_SHEETS_AI_LOG_TAB=AI App Log
GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<google oauth client secret>
GOOGLE_OAUTH_REFRESH_TOKEN=<owner refresh token with sheets and gmail scopes>
PUBLIC_DASHBOARD_URL=https://app.cleanplatehaulingco.com
```

Do not commit real passwords, API keys, OAuth refresh tokens, or service account JSON.

## Login and protection model

Use both layers in production:

1. **Host-level Basic Auth**: blocks casual traffic before the app shell loads.
2. **In-app owner login**: blocks API access until the owner password is entered.

The in-app login returns a server-issued bearer token. The frontend keeps that token in memory only. It is not written to localStorage, sessionStorage, IndexedDB, or frontend code. Refreshing the browser requires logging in again.

Recommended password rules:

- Use a unique 20+ character password for `APP_BASIC_AUTH_PASSWORD`.
- Use a different unique 20+ character password for `APP_LOGIN_PASSWORD`.
- Store both only in the hosting secret manager.
- Rotate them if anyone outside ownership gets access.

## Google Sheets and Gmail credentials

The current Perplexity preview uses connected tools through the Perplexity runtime. A truly independent production app needs its own Google credential path.

### Best small-business option

Use **Google OAuth** for the owner account:

1. Create a Google Cloud project.
2. Enable Google Sheets API and Gmail API.
3. Configure OAuth consent screen as internal/testing first.
4. Create OAuth client credentials.
5. Store the encrypted refresh token server-side after owner login.
6. The backend uses that refresh token to call Sheets and Gmail.

For the current app, the required OAuth scopes are:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/gmail.send
```

Set the resulting refresh token as `GOOGLE_OAUTH_REFRESH_TOKEN` in the host secret manager. The app will automatically switch from Perplexity connector mode to standalone Google mode when all three Google OAuth secrets are present.

This is best if the app will send invoices from the owner Gmail and access the owner’s actual CRM Sheet.

### Simpler Sheets-only option

Use a **Google service account** for Sheets:

1. Create a service account in Google Cloud.
2. Share the CRM Google Sheet with the service account email.
3. Store service account JSON in the host secret manager.
4. Backend writes to the CRM, Job Entry, and AI App Log tabs.

This is good for Sheets sync, but Gmail invoice sending still needs OAuth.

## Deployment flow

### Render

1. Push this app to GitHub.
2. Connect the repo to Render.
3. Use `render.yaml` or create a Web Service manually.
4. Add all environment variables in Render.
5. Set the health check path to `/api/healthz`.
6. Add custom domain `app.cleanplatehaulingco.com`.
7. Point DNS CNAME from the domain provider to Render.

### Docker host

```bash
docker build -t clean-plate-command-center .
docker run --env-file .env -p 5000:5000 clean-plate-command-center
```

Use a managed database or persistent volume before using Docker for permanent production data.

## Data storage

The app currently uses SQLite for local app data. For a private single-owner app, SQLite is acceptable if the host provides a persistent disk and automated backups.

For a future SaaS version, move to Supabase/Postgres with:

- row-level security
- owner/admin/operator roles
- tenant isolation
- daily backups
- migration approvals

## Required next production work

Before fully leaving the Perplexity runtime, build these:

1. Replace `external-tool` connector calls with Google API clients.
2. Add OAuth connect/reconnect screen for Google Sheets and Gmail.
3. Encrypt stored Google refresh tokens.
4. Add owner/admin user login instead of basic auth.
5. Add automated database backups.
6. Add staging environment before production deploys.
7. Add audit logs for every Sheet write, Gmail send, price change, app build draft, and agent action.

## Safe production rule

The AI can suggest, draft, analyze, and prepare changes. It should not permanently send email, overwrite Sheets, delete records, deploy production, or change pricing rules unless the owner approves the exact action.
