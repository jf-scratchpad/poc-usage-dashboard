# Decisions

Notable choices and why. One line each where possible.

- **Stack: Node 20 LTS, TypeScript (strict), npm with a committed lockfile, Vite, Chart.js, Vitest.** The approved stack for this trial; no backend, no runtime network calls.
- **`UsageAdapter.load()` is async (`Promise<UsageRecord[]>`).** Sample adapters could be sync, but real collectors (API exports, CSV downloads) are async, so the interface won't need to change when real data plugs in.
