/**
 * Adapter plugin registry.
 *
 * One place that knows every source: its display metadata (name, unit, color)
 * and the adapter that loads it. The UI reads labels and colors from here and
 * `loadAllUsage()` runs whatever adapters are registered.
 *
 * How to add a source (full checklist in docs/adapters.md, "Adding a source"):
 *   1. Append the id to SOURCES in src/schema/usage.ts.
 *   2. Describe it in SOURCE_META in ./sources.ts (typecheck fails until you do).
 *   3. Write src/adapters/<id>.ts with a parser + a `// REAL DATA PLUGS IN HERE` block.
 *   4. Add the adapter to BUILTIN_ADAPTERS below, add sample data and tests.
 */
import { SOURCES, type Source, type UsageAdapter } from '../schema/usage';
export * from './sources';
import { azureAdapter } from './azure';
import { cursorAdapter } from './cursor';
import { grokBotAdapter } from './grok-bot';
import { llmApiAdapter } from './llm-api';

const BUILTIN_ADAPTERS: readonly UsageAdapter[] = [grokBotAdapter, cursorAdapter, azureAdapter, llmApiAdapter];

const adapters = new Map<Source, UsageAdapter>();

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/**
 * Registers an adapter for a known source. Throws if the source is unknown,
 * has no metadata, or already has an adapter (pass `{ replace: true }` to
 * swap one, e.g. a real collector or a test double).
 */
export function registerAdapter(adapter: UsageAdapter, options?: { replace?: boolean }): void {
  if (!(SOURCES as readonly string[]).includes(adapter.source)) {
    throw new RegistryError(`unknown source ${JSON.stringify(adapter.source)}; add it to SOURCES first`);
  }
  if (adapters.has(adapter.source) && !options?.replace) {
    throw new RegistryError(`an adapter for ${adapter.source} is already registered`);
  }
  adapters.set(adapter.source, adapter);
}

export function unregisterAdapter(source: Source): boolean {
  return adapters.delete(source);
}

/** Restores the built-in adapter set (used at startup and by tests). */
export function resetRegistry(): void {
  adapters.clear();
  for (const a of BUILTIN_ADAPTERS) registerAdapter(a);
}

/** Registered adapters in SOURCES order. */
export function getAdapters(): UsageAdapter[] {
  return SOURCES.flatMap((s) => {
    const a = adapters.get(s);
    return a ? [a] : [];
  });
}

resetRegistry();
