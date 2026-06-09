# WC 2026 Bracket App

A bracket competition app for ~25 friends for the 2026 FIFA World Cup.

## Quick Start

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Start the backend

```bash
cd server
npm run dev
# runs on http://localhost:3001
```

### 3. Start the frontend (new terminal)

```bash
cd client
npm run dev
# opens http://localhost:5173
```

### 4. Create your admin account

1. Open http://localhost:5173 → Register with your username/password
2. In the server terminal or via API, promote yourself to admin:

```bash
# Replace 1 with your user ID (check server logs or use /api/auth/users)
curl -X POST http://localhost:3001/api/admin/promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"user_id": 1}'
```

Or: register, then temporarily add `is_admin = 1` in the SQLite DB for your user, then use the Admin → Users tab to promote others.

## Features

| Feature | Details |
|---|---|
| 🔐 Auth | JWT-based login/register per user |
| 📋 Group picks | Pick 1st, 2nd, 3rd in all 12 groups |
| 🏆 Knockout bracket | Full R32→R16→QF→SF→Final, auto-populated from group picks |
| 📊 Leaderboard | Live scores, auto-refreshes every 30s |
| 👀 All brackets | Browse any friend's picks |
| 🔒 Lock brackets | Admin locks picks before first match |
| ⚙ Live results | Admin enters match results → scores update instantly |
| 🔄 Auto-fetch | Optionally pull results automatically from football-data.org |

## Automatic result fetching (optional)

By default results are entered by the admin (Admin → Group / Knockout Results). You can also
have the app pull them automatically from [football-data.org](https://www.football-data.org):

1. Get a free API token: https://www.football-data.org/client/register
2. `cp server/.env.example server/.env` and set `FOOTBALL_DATA_TOKEN`.
3. Start the server with the env file: `node --env-file=.env index.js`
4. In **Admin → Results Sync**, click **Fetch results now** for a one-off pull, or
   **Enable auto-fetch** to poll on a schedule (default every 15 min, set `FETCH_INTERVAL_MIN`).

What it does:
- **Group standings** → fills 1st/2nd/3rd for each completed group and auto-marks the 8 best
  3rd-place teams as advancing.
- **Knockout games** → matches each finished game to the right bracket slot (m73…m104) by the
  teams involved, including the 3rd-place wildcard slots.
- Anything it can't confidently map is listed under "Needs manual entry" — enter those by hand.
- Manual entry always overrides the fetcher, so you can correct anything.

> Team names from the feed are normalized to ours (e.g. USA → United States, Türkiye, Curaçao,
> Korea Republic). If a name doesn't match, add an alias in `server/resultsFetcher.js`.

## Scoring

| Pick | Points |
|---|---|
| Correct group 1st place | 3 pts |
| Correct group 2nd place | 2 pts |
| Correct group 3rd place | 1 pt |
| Correct R32 winner | 2 pts |
| Correct R16 winner | 3 pts |
| Correct QF winner | 4 pts |
| Correct SF winner | 5 pts |
| Correct champion | 8 pts |
| Correct runner-up | 3 pts |

## Admin Workflow

1. **Before tournament starts (June 12, 2026):** Lock brackets via Admin → Lock Brackets
2. **After each group finishes:** Enter group standings via Admin → Group Results
3. **After each knockout match:** Enter result via Admin → Knockout Results (use match IDs like `r32_1`, `r16_3`, `qf_2`, `sf_1`, `final`)

## Team Data

Team groupings are in `server/teams.js`. Verify them at [fifa.com](https://www.fifa.com) and update as needed before the tournament starts — the group assignments in that file are approximate.

## Deployment

For local use on your home network, share your local IP (e.g. `http://192.168.1.x:5173`) with friends. For internet access, deploy to a VPS (DigitalOcean, Railway, Render) or use ngrok for a quick tunnel.

The SQLite database file (`server/bracket.db`) is created automatically on first run. Back it up periodically.
