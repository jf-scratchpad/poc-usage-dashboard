import type { UsageRecord } from '../schema/usage';

/**
 * Single entry point the web app uses. Track 1 (collectors) replaces this stub
 * with the Grok Bot, Cursor, and Azure adapters.
 */
export async function loadAllUsage(): Promise<UsageRecord[]> {
  return [];
}
