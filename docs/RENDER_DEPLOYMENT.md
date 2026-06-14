# Render deployment checklist

This repo is ready to deploy as a single Render Web Service using `render.yaml`.

## 1. Create the Render service

1. Push this repository to GitHub.
2. In Render, choose **New +** → **Blueprint**.
3. Select this repo.
4. Render will read `render.yaml` and create `clean-plate-command-center`.

The blueprint pins Node `20.20.2`, runs `npm ci --include=dev && npm run build` so Render installs the Vite/esbuild/tsx build tools, starts with `npm start`, and checks `/api/healthz`. Auto-deploy is enabled so every merged commit to the connected branch redeploys automatically.

## 2. Add secrets before first public use

In Render, open the service **Environment** tab and set these secret values:

```bash
APP_BASIC_AUTH_USER=owner
APP_BASIC_AUTH_PASSWORD=<long random password>
APP_LOGIN_PASSWORD=<different long random owner password>
OPENAI_API_KEY=<server-side OpenAI key>
```

Do not commit real values to git.

## 3. Google CRM mode

The app can boot without Google OAuth secrets, but standalone production Sheets/Gmail access needs:

```bash
GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<google oauth client secret>
GOOGLE_OAUTH_REFRESH_TOKEN=<owner refresh token with sheets and gmail scopes>
```

If those are missing, the app keeps using the preview/connector runtime path where available.

## 4. Persistent local storage on Render

The blueprint mounts a 1 GB Render disk at `/var/data` and sets:

```bash
SQLITE_FILE=/var/data/clean-plate.sqlite
```

That keeps the SQLite file off Render's ephemeral filesystem. This is not a production database migration; it is the smallest persistent option for getting the app live on Render.

## 5. Deploy the latest code so you can preview it

If an existing Render service still shows an older commit, Node `24.x`, or build command `npm ci && npm run build`, update the service settings manually or recreate it from the Blueprint. The correct deploy log should show:

```text
Using Node.js version 20.20.2
Running build command 'npm ci --include=dev && npm run build'
```

For the fastest preview:

1. Merge the latest PR into the branch Render watches.
2. In Render, open the service and choose **Manual Deploy** → **Clear build cache & deploy**.
3. Confirm the deployed commit matches the latest GitHub commit.
4. Open the generated `https://<service-name>.onrender.com` URL.

## 6. Smoke test after deploy

After Render reports the deploy as live:

```bash
curl https://<your-render-url>/api/healthz
```

Expected response:

```json
{"ok":true,"service":"clean-plate-command-center"}
```

Then open the Render URL in a browser, pass Basic Auth, complete owner login, and confirm the CRM page loads.
