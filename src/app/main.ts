import { loadAllUsage } from '../adapters/index';

// Placeholder entry point. Track 2 (web app) replaces this with the charts.
async function main(): Promise<void> {
  const records = await loadAllUsage();
  const el = document.getElementById('app');
  if (el) el.textContent = `Loaded ${records.length} usage records.`;
}

void main();
