# Deploying / running on another device

Your **data lives in Supabase** (cloud) and the app is a **static PWA**, so
"porting" only moves the frontend. Everything the app writes (log, targets,
plan state, weight, workouts) is stored per-user in Supabase and syncs to any
device that signs in — you don't copy any data.

Two ways to host it, and you can use both at once (they're just different URLs
pointing at the same Supabase project):

- **A. Netlify (recommended)** — deploy once, get a permanent HTTPS URL that
  installs on your phone and every laptop. Nothing has to stay running.
- **B. Self-host on the media laptop** — run it locally, reach it over Tailscale.
  Fully self-contained, but that laptop has to stay awake.

Both need the same two secrets (safe to expose — the anon key only works through
Row-Level Security):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Get them from Supabase → Project Settings → API. See `.env.example`.

---

## A. Netlify (recommended)

`netlify.toml` is already in the repo (build command, SPA fallback, service-worker
cache header). Pick one of the two setups:

### A1. Connected to GitHub (auto-deploys on every push)

1. Create a repo on GitHub and push:
   ```sh
   gh repo create fodmap-noom-dash --private --source=. --push
   # or: git remote add origin <url> && git push -u origin main
   ```
2. On https://app.netlify.com → **Add new site → Import an existing project** →
   pick the repo. It auto-detects the Vite build from `netlify.toml`.
3. **Site settings → Environment variables** → add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. You get a URL like `https://your-app.netlify.app`. Every future
   `git push` redeploys automatically.

### A2. Netlify CLI (no GitHub needed)

```sh
npm run build                         # builds dist/ with your local .env.local
npx netlify-cli deploy --prod --dir=dist
```

The first run walks you through logging in and creating the site. (With this
route the env vars come from your **local** `.env.local` at build time, so you
don't need to set them in Netlify.)

### After deploying

- Open the URL on your phone/laptops and **Install** (Add to Home Screen /
  install icon) to get the offline PWA.
- **If sign-in fails on the new URL:** in Supabase → Authentication → URL
  Configuration, add the Netlify URL to **Site URL** / redirect allowlist.
- The Edge Functions (`analyze-meal`, `analyze-label`) and DB migrations already
  live in Supabase — nothing to redeploy for them.

---

## B. Self-host on the media laptop (Tailscale)

Good when you want it fully self-contained. The laptop must be awake while you
use the app.

**One-time setup on the media laptop:**

1. Install **Node 22+** and **Tailscale** (sign in to the same tailnet as your
   phone).
2. Get the code — either `git clone <your repo>` (if you pushed to GitHub) or
   copy this project folder over.
3. Install deps and add secrets:
   ```sh
   npm ci
   cp .env.example .env.local      # then edit .env.local with your two values
   ```

**Run it (each time / after an update):**

```sh
npm run host        # builds, then serves the built app on http://127.0.0.1:4173
```

Leave that window open, and in a second terminal expose it over HTTPS:

```sh
tailscale serve https / http://127.0.0.1:4173
```

Then open your tailnet URL — `https://<this-laptop>.<tailnet>.ts.net` — on any
device and Install it. (`tailscale serve status` shows the exact URL.)

**Keep it always-on:** as long as `npm run host` keeps running and the laptop is
awake, it stays reachable. To survive reboots without re-typing commands, run it
under a process manager (e.g. `npx pm2 start "npm run host" --name fodmap`) or a
Windows Task Scheduler "At log on" task. Set the laptop's power settings so it
doesn't sleep.

**Updating:** `git pull` (or recopy), then `npm ci` if dependencies changed, then
`npm run host` again.

---

## Notes

- The two `VITE_*` values are baked into the built bundle (that's why they're
  `VITE_`-prefixed). The anon key is meant to be public; every table is guarded
  by RLS. Never put the Supabase **service_role** key or the Anthropic key in the
  client — those stay server-side (Supabase Function secrets).
- Both hosts talk to the **same** Supabase project, so your data is identical
  everywhere and each device just signs in.
- New DB migrations (like `0014_plan_state.sql`) are applied in Supabase once and
  take effect for every host.
