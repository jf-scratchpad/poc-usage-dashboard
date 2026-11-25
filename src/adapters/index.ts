import type { UsageRecord } from '../schema/usage';
import { getAdapters } from './registry';

export { azureAdapter, parseAzureCostExport } from './azure';
export { cursorAdapter, parseCursorUsage } from './cursor';
export { grokBotAdapter, parseGrokBotUsage } from './grok-bot';
export { llmApiAdapter, parseLlmApiUsage } from './llm-api';
export {
  getAdapters,
  getSourceMeta,
  listSourceMeta,
  registerAdapter,
  resetRegistry,
  sourceColor,
  sourceLabel,
  type SourceMeta,
} from './registry';

/**
 * Single entry point the web app uses. Runs every registered collector (see
 * src/adapters/registry.ts) and concatenates validated usage records. Sample
 * data is bundled at build time; there is no runtime network call or
 * filesystem access.
 */
export async function loadAllUsage(): Promise<UsageRecord[]> {
  const batches = await Promise.all(getAdapters().map((adapter) => adapter.load()));
  return batches.flat();
}
