# Clean Plate Hauling Co — Command Center
## Handoff for deploy

### Project path
`/home/user/workspace/junk-command-center`

### Run / build
```bash
cd /home/user/workspace/junk-command-center
npm install       # already done in this run
npm run dev       # dev server, Express + Vite on port 5000
npm run build     # builds client to dist/public and server to dist/index.cjs
npm run start     # NODE_ENV=production node dist/index.cjs
```

### Deploy (for main agent)
The template's `queryClient.ts` uses `__PORT_5000__` for proxy rewriting at deploy time. To deploy:
1. `npm run build` (already done — `dist/` exists)
2. Start production server:
   ```
   start_server(command="NODE_ENV=production node dist/index.cjs", project_path="/home/user/workspace/junk-command-center", port=5000)
   ```
3. `deploy_website(project_path="/home/user/workspace/junk-command-center/dist/public", site_name="clean-plate-hauling", entry_point="index.html")`

Note: SQLite seeds itself on first boot in whatever working directory the server runs in. The seed is idempotent (skips when `leads` table is non-empty).

### Stack
Express + Vite + React + Tailwind + shadcn/ui + Drizzle ORM + better-sqlite3, hash routing via wouter. Same template as the webapp skill, no deviations.

### File map (major changes)
- `shared/schema.ts` — leads, jobs, crews, estimates, settings, follow_ups
- `server/storage.ts` — schema bootstrap (raw `CREATE TABLE` so we skip drizzle-kit migrations), full storage interface, seedIfEmpty() with 12 leads, 7 jobs, 3 crews, 3 estimates, 7 follow-up templates, and a settings row
- `server/routes.ts` — CRUD for leads/jobs/estimates/settings, `/api/calculate-quote` cost+price calculator, `/api/export/{leads,jobs,estimates}.csv`
- `client/src/App.tsx` — Router wired with Shell, 7 pages
- `client/src/components/Logo.tsx` — custom inline SVG logo (license-plate "CP" + chevron-arrow hauling marks)
- `client/public/favicon.svg` — matching favicon
- `client/src/components/Shell.tsx` — sidebar nav, mobile bottom bar, live dispatch status block, theme toggle
- `client/src/components/ThemeProvider.tsx` — dark/light context, no storage APIs (per template rules)
- `client/src/index.css` — full asphalt/safety-lime token system, both light + dark mode, plus `.grit-bg` and `.tape-stripe` industrial utilities
- `client/index.html` — Inter / Space Grotesk / JetBrains Mono via Google Fonts
- `client/src/pages/Dashboard.tsx` — 8 KPI cards, today's run sheet, follow-up alerts, 7-day revenue chart, lead funnel, source attribution, profit safety check
- `client/src/pages/Pipeline.tsx` — kanban board + table view, search, stage filter, new-lead modal, inline stage updates with PATCH
- `client/src/pages/Dispatch.tsx` — 5-day route board, crew assignment, status updates, expandable 6-item readiness checklist persisted as JSON
- `client/src/pages/QuoteCalc.tsx` — live calculation via `/api/calculate-quote`, sliders for truck fill / labor / crew / stairs / heavy items / distance / discount, suggested + floor + cost + profit + margin, save tied to lead
- `client/src/pages/SheetsCRM.tsx` — CSV export buttons (functional), CSV import preview, recommended column mapping table, sample CSV copy-to-clipboard, "Connect Google Sheets (waiting on connector)" placeholder
- `client/src/pages/FollowUps.tsx` — call/text/email scripts with variable substitution, copy-to-clipboard via browser API
- `client/src/pages/Settings.tsx` — full pricing variable config

### Design system
- **Palette:** asphalt-slate sidebar (HSL 220 16% 8% dark / 220 14% 14% light), warm off-white surfaces (HSL 40 18% 96%), safety-lime accent (HSL 74 88-92% 53-55%), amber/destructive for warnings
- **Fonts:** Space Grotesk display, Inter body, JetBrains Mono for tabular labels + scripts
- **Dark mode:** First-class, default-on (matches dispatch room feel). Toggle in sidebar.
- **No `localStorage`/`sessionStorage`/cookies anywhere** — theme is React state.

### Data-testid coverage
Every interactive element (nav, buttons, inputs, sliders, selects, checklists, dialog triggers) and meaningful dynamic value (KPI values, list rows, mapping rows, quote outputs) has a `data-testid`. Patterns: `button-*`, `input-*`, `select-*`, `nav-*`, `kpi-*-value`, `row-*-{id}`, `card-lead-{id}`, `checklist-{jobId}-{key}`, etc.

### Sheets-friendly
- CSV export endpoints work end-to-end (`/api/export/leads.csv`, etc.) and link in the Sheets CRM page.
- Sample CSV in the UI shows the exact column names the in-app fields use, so the user can rename their existing Google Sheet columns to match.
- Column-mapping panel explicitly calls out required vs optional fields, with notes on phone format, date format, and accepted stage values.
- "Connect Google Sheets" CTA is intentionally disabled and tells the user (and the main agent) what to do when the connector is back.

### QA captured (in project root)
- `qa-dashboard.png` — dark mode dashboard (full-page)
- `qa-dashboard-light.png` — light mode dashboard
- `qa-pipeline.png` — kanban board
- `qa-pipeline-table.png` — table view
- `qa-dispatch.png` — run sheet
- `qa-quote.png` — quote calculator with live profit warning
- `qa-sheets.png` — Sheets CRM hub
- `qa-followups.png` — scripts with variable substitution
- `qa-settings.png` — owner controls

### Notable implementation details
- **Quote engine** (`/api/calculate-quote`) reads from settings each call, so changing Settings instantly affects every new quote. Floor price = `cost / (1 - targetMargin)`. Profit warnings trigger when quote is below floor OR margin is more than 10pts below target.
- **Stages array** is the source of truth for valid stage values in both backend and frontend.
- **Job checklist** is stored as JSON text and toggled with a single PATCH; readiness badge turns green when 6/6.
- **No drizzle-kit migrations** — `server/storage.ts` runs raw `CREATE TABLE IF NOT EXISTS` on startup, which is enough for SQLite and avoids extra build steps.
- **Seeding** uses dates relative to "now" so the dashboard always shows fresh-looking work regardless of when it's deployed.

### Open follow-ups for main agent
- Connect Google Sheets (when available) — the UI already explains exactly what to map.
- Deploy with the commands above. Do not deploy from this subagent.
