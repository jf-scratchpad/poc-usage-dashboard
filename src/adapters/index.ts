import type { UsageRecord } from '../schema/usage';
import { azureAdapter } from './azure';
import { cursorAdapter } from './cursor';
import { grokBotAdapter } from './grok-bot';

export { azureAdapter, parseAzureCostExport } from './azure';
export { cursorAdapter, parseCursorUsage } from './cursor';
export { grokBotAdapter, parseGrokBotUsage } from './grok-bot';

const ADAPTERS = [grokBotAdapter, cursorAdapter, azureAdapter] as const;

/**
 * Single entry point the web app uses. Runs every collector and concatenates
 * validated usage records. Sample data is bundled at build time; there is no
 * runtime network call or filesystem access.
 */
export async function loadAllUsage(): Promise<UsageRecord[]> {
  const batches = await Promise.all(ADAPTERS.map((adapter) => adapter.load()));
  return batches.flat();
}
