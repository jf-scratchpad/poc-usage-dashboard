# Decisions

Notable choices and why. One line each where possible.

- **Stack: Node 20 LTS, TypeScript (strict), npm with a committed lockfile, Vite, Chart.js, Vitest.** The approved stack for this trial; no backend, no runtime network calls.
- **`UsageAdapter.load()` is async (`Promise<UsageRecord[]>`).** Sample adapters could be sync, but real collectors (API exports, CSV downloads) are async, so the interface won't need to change when real data plugs in.

- **Sample data is fictional, native-shaped, and covers 2026-08-31 through 2026-11-22 (12 weeks).** The trial forbids real account access; realistic export shapes let the adapters exercise real parsing. Weekday/weekend variation, a gentle upward trend, and three invented spikes (mid-September Azure OpenAI, mid-October coding push, mid-November pre-trial week) make weekly charts meaningful. IDs use the obviously fake placeholder `00000000-0000-0000-0000-000000000000`.
- **Hand-rolled CSV parser (`src/adapters/csv.ts`) instead of a library.** Stays on the approved stack with no extra dependency. Understands quoted fields, comment lines, and a BOM so the fictional headers in the sample CSVs are skipped.
- **Vite JSON import for Grok Bot; `?raw` imports for the Cursor and Azure CSVs.** The dashboard is a static site, so sample data is bundled at build time. There is no filesystem access and no network call at runtime.
- **Cursor events roll up to one record per day × project.** The native export is finer-grained (kind/model); the schema is one day × source × assistant/project.
- **Azure line items roll up to one record per day × project tag (`unit_type` is `USD`).** Cost Management meters use incomparable units (hours, GB, tokens), so summing quantities would mislead. `units` equals the summed `PreTaxCost`. The project comes from `Tags.project`, falling back to `ResourceGroup`.
- **Azure dates accept `YYYY-MM-DD` and `yyyyMMdd`; non-USD currency is rejected.** Some Cost Management Query API responses use compact `UsageDate` values. Currency conversion belongs at the real-data plug-in point, not in the static app.
- **Aggregation helpers were left to the web track.** Week / assistant / top-N / filter helpers belong with the charts in `src/app/`. Adding a second copy in this track would only create a merge conflict.
