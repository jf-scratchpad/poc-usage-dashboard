# usage-dashboard-trial

A static web dashboard of AI usage and spend per assistant and per week, across Grok Bot, Cursor, and Azure. **Sample data only**: no real accounts, credentials, or network calls.

Trial repo (Wed Nov 25, 2026). Nothing else depends on it. Full docs are coming in the quality track.

```bash
npm ci
npm test
npm run build   # static files in dist/
```

## Dashboard

The static site loads records from `loadAllUsage()` and draws spend by week, spend by assistant or project, and the top consumers, with a source filter. Until collectors are wired in, the page shows an empty state. All figures are sample data.

```bash
npm run dev        # local preview
npm run preview    # serve the production build in dist/
```

