/**
 * Adapter plugin registry.
 *
 * One place that knows every source: its display metadata (name, unit, color)
 * and the adapter that loads it. The UI reads labels and colors from here and
 * `loadAllUsage()` runs whatever adapters are registered.
 *
 * How to add a source (full checklist in docs/adapters.md, "Adding a source"):
 *   1. Append the id to SOURCES in src/schema/usage.ts.
 *   2. Describe it in SOURCE_META below (typecheck fails until you do).
 *   3. Write src/adapters/<id>.ts with a parser + a `// REAL DATA PLUGS IN HERE` block.
 *   4. Add the adapter to BUILTIN_ADAPTERS below, add sample data and tests.
 */
import { SOURCES, type Source, type UsageAdapter } from '../schema/usage';
import { azureAdapter } from './azure';
import { cursorAdapter } from './cursor';
import { grokBotAdapter } from './grok-bot';
import { llmApiAdapter } from './llm-api';

export type SourceMeta = {
  id: Source;
  /** Human label for charts, filters, and badges. */
  displayName: string;
  /** What `units` counts for this source (matches the adapter's unit_type). */
  unitType: string;
  /** Chart color, a #rrggbb hex string. */
  color: string;
  description: string;
};

const SOURCE_META = {
  'grok-bot': {
    id: 'grok-bot',
    displayName: 'Grok Bot',
    unitType: 'requests',
    color: '#3ecfb2',
    description: 'Per-assistant Grok Bot plan usage (sample export).',
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    unitType: 'requests',
    color: '#b388ff',
    description: 'Cursor admin usage events rolled up per project (sample export).',
  },
  azure: {
    id: 'azure',
    displayName: 'Azure',
    unitType: 'USD',
    color: '#5b9fd4',
    description: 'Azure Cost Management daily actual cost per project tag (sample export).',
  },
  'llm-api': {
    id: 'llm-api',
    displayName: 'LLM API',
    unitType: 'tokens',
    color: '#f2a541',
    description: 'Direct model-API token usage per assistant, vendor neutral (fictional sample).',
  },
} as const satisfies Record<Source, SourceMeta>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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

export function getSourceMeta(id: Source): SourceMeta {
  return SOURCE_META[id];
}

/** Metadata for every source, in SOURCES order. */
export function listSourceMeta(): SourceMeta[] {
  return SOURCES.map((s) => SOURCE_META[s]);
}

export function sourceLabel(id: Source): string {
  return SOURCE_META[id].displayName;
}

export function sourceColor(id: Source): string {
  return SOURCE_META[id].color;
}

export function sourceLabels(): Record<Source, string> {
  return Object.fromEntries(SOURCES.map((s) => [s, SOURCE_META[s].displayName])) as Record<Source, string>;
}

export function sourceColors(): Record<Source, string> {
  return Object.fromEntries(SOURCES.map((s) => [s, SOURCE_META[s].color])) as Record<Source, string>;
}

/** Sanity checks on the metadata table; returns a list of problems (empty = ok). */
export function checkRegistry(): string[] {
  const problems: string[] = [];
  const colors = new Set<string>();
  for (const s of SOURCES) {
    const m: SourceMeta = SOURCE_META[s];
    if (m.id !== s) problems.push(`${s}: meta.id is ${m.id}`);
    if (!m.displayName.trim()) problems.push(`${s}: empty displayName`);
    if (!m.unitType.trim()) problems.push(`${s}: empty unitType`);
    if (!HEX_COLOR.test(m.color)) problems.push(`${s}: color ${m.color} is not #rrggbb`);
    if (colors.has(m.color.toLowerCase())) problems.push(`${s}: color ${m.color} is reused`);
    colors.add(m.color.toLowerCase());
  }
  return problems;
}

resetRegistry();
