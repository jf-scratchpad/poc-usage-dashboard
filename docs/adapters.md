# Adapters

Each collector turns a source-shaped file in `data/sample/` into validated
`UsageRecord`s. The web app only imports `loadAllUsage()` from
`src/adapters/index.ts`. Sample data is bundled at build time (JSON imports
or Vite `?raw`); there is no filesystem access and no network call at runtime.

All three sample files are **fictional**. See [data/sample/README.md](../data/sample/README.md).

## Grok Bot — `src/adapters/grok-bot.ts`

- **Sample:** `data/sample/grok-bot-usage.json`, an invented Grok Bot usage
  export. Each `entries[]` item is one day × one assistant, with `requests`,
  `credits_consumed`, and `cost_usd`.
- **Mapping:** `assistant` → `assistant_or_project`, `requests` → `units`,
  `unit_type` is `requests`, `source` is `grok-bot`. Credits stay in the raw
  file as native context and are not mapped.
- **Parse API:** `parseGrokBotUsage(raw)` (also used by `grokBotAdapter.load()`).
- **REAL DATA PLUGS IN HERE:** replace the JSON import in `grok-bot.ts` with a
  Grok Bot plan usage export for the period (per-assistant / per-bot download
  or official usage export), then pass the parsed object to `parseGrokBotUsage()`.
  Do not add credentials or network calls in this repo; a live collector would
  run outside the static site and write a file the build can import.

## Cursor — `src/adapters/cursor.ts`

- **Sample:** `data/sample/cursor-usage.csv`, an invented Cursor admin usage
  export. Each data row is a usage event: one day × project × kind/model,
  with `requests`, token counts, and `cost_usd`. `#` comment lines mark the
  file as fictional and are skipped.
- **Mapping:** events are rolled up to one `UsageRecord` per day × `project`.
  `requests` are summed into `units` (`unit_type` is `requests`); `cost_usd`
  is summed. Kind, model, and token columns are validated then discarded at
  the schema layer.
- **Parse API:** `parseCursorUsage(csvText)` (also used by `cursorAdapter.load()`).
- **REAL DATA PLUGS IN HERE:** replace the `?raw` import in `cursor.ts` with a
  Cursor admin / dashboard usage export (team usage CSV, or the admin usage
  API written out as a CSV in this shape) and pass the text to
  `parseCursorUsage()`. Same rule: no credentials or network calls here.

## Azure Cost Management — `src/adapters/azure.ts`

- **Sample:** `data/sample/azure-cost-management.csv`, an invented daily
  actual-cost export. Columns follow a PreTaxCost-style Cost Management
  shape (`Date`, `SubscriptionId`, `ResourceGroup`, `ResourceId`,
  `ServiceName`, `Meter*`, `Tags`, `Quantity`, `UnitOfMeasure`,
  `PreTaxCost`, `Currency`). Subscription and resource IDs are the fake
  placeholder `00000000-0000-0000-0000-000000000000`.
- **Mapping:** line items are rolled up to one `UsageRecord` per day ×
  project. The project comes from the `Tags` JSON `project` field, falling
  back to `ResourceGroup`. Meter quantities are not comparable across
  services (hours vs. GB vs. tokens), so `unit_type` is `USD` and `units`
  equals the summed `PreTaxCost` (already USD in the sample). Non-USD
  `Currency` values are rejected; convert at the plug-in point.
- **Dates:** `YYYY-MM-DD` (sample) and the `yyyyMMdd` form used by some
  Cost Management Query API responses are both accepted.
- **Parse API:** `parseAzureCostExport(csvText)` (also used by `azureAdapter.load()`).
- **REAL DATA PLUGS IN HERE:** replace the `?raw` import in `azure.ts` with an
  Azure Cost Management daily actual-cost export, or a Cost Details / Query
  API result written out as CSV in this shape. Convert to USD if the account
  bills in another currency, then pass the text to `parseAzureCostExport()`.
  Same rule: no credentials or network calls here.

## `loadAllUsage()`

`src/adapters/index.ts` runs the three adapters (Grok Bot, Cursor, Azure) and
concatenates their records. Every record has already passed `validateRecord`.

## Tests

| File | What it covers |
| --- | --- |
| `tests/adapters/grok-bot.test.ts` | Sample parse, field mapping, totals vs. the raw file, bad rows |
| `tests/adapters/cursor.test.ts` | Sample parse, day×project roll-up, totals vs. the raw file, bad rows |
| `tests/adapters/azure.test.ts` | Sample parse, project-tag roll-up, totals vs. the raw file, non-USD, bad rows, `yyyyMMdd` dates |
| `tests/adapters/load-all.test.ts` | `loadAllUsage()` combines all three sources and matches per-adapter totals |
