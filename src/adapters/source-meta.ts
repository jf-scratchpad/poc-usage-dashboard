/**
 * Source display metadata (labels, unit types, colors), kept separate from the
 * adapters so the UI can import it without pulling the bundled sample data
 * into the initial JS chunk. `registry.ts` re-exports everything here.
 */
import { SOURCES, type Source } from '../schema/usage';

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
