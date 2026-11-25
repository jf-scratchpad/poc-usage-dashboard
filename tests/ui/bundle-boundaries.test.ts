import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the initial bundle small: walks STATIC imports from the entry point
 * (dynamic import() is ignored) and asserts that neither Chart.js nor the
 * bundled sample adapters are reachable.
 */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      if (!spec.startsWith('.')) {
        seen.add(`pkg:${spec}`);
        continue;
      }
      const base = resolve(dirname(file), spec);
      stack.push(base.endsWith('.css') || base.endsWith('.json') || /\?raw$/.test(base) ? base : `${base}.ts`);
    }
  }
  return seen;
}

describe('initial bundle boundaries', () => {
  const graph = [...staticGraph(resolve('src/ui/main.ts'))];

  it('does not statically import Chart.js', () => {
    expect(graph.filter((f) => f.startsWith('pkg:chart.js'))).toEqual([]);
  });

  it('does not statically import sample data or adapters (only source metadata in sources.ts)', () => {
    const adapters = graph.filter((f) => f.includes('/src/adapters/') && !f.endsWith('/sources.ts'));
    expect(adapters).toEqual([]);
    expect(graph.filter((f) => f.includes('/data/sample/'))).toEqual([]);
  });

  it('does not statically import any view module except shared helpers', () => {
    const views = graph.filter((f) => f.includes('/src/ui/views/') && !/\/(common|types)\.ts$/.test(f));
    expect(views).toEqual([]);
  });
});
