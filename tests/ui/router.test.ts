// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { HashRouter, formatHash, parseHash, parseRoute, type AppLocation } from '../../src/ui/router';
import { defaultFilters } from '../../src/ui/filters';

describe('parseRoute / formatHash', () => {
  it('parses every known route', () => {
    expect(parseRoute('')).toEqual({ name: 'overview' });
    expect(parseRoute('/')).toEqual({ name: 'overview' });
    expect(parseRoute('/overview')).toEqual({ name: 'overview' });
    expect(parseRoute('/budgets')).toEqual({ name: 'budgets' });
    expect(parseRoute('/forecast')).toEqual({ name: 'forecast' });
    expect(parseRoute('/anomalies')).toEqual({ name: 'anomalies' });
    expect(parseRoute('/source/azure')).toEqual({ name: 'source', source: 'azure' });
    expect(parseRoute('/assistant/Cursor%20Agent')).toEqual({ name: 'assistant', assistant: 'Cursor Agent' });
  });

  it('returns notfound for unknown views, bad sources, and malformed encodings', () => {
    expect(parseRoute('/nope').name).toBe('notfound');
    expect(parseRoute('/source/aws').name).toBe('notfound');
    expect(parseRoute('/assistant/%E0%A4%A').name).toBe('notfound');
    expect(parseRoute('/assistant/a/b').name).toBe('notfound');
  });

  it('round-trips routes with filters, encoding names safely', () => {
    const f = { ...defaultFilters(), range: '4w' as const, q: 'a&b' };
    const hash = formatHash({ name: 'assistant', assistant: 'x/y z' }, f);
    expect(hash.startsWith('#/assistant/x%2Fy%20z?')).toBe(true);
    const loc = parseHash(hash);
    expect(loc.route).toEqual({ name: 'assistant', assistant: 'x/y z' });
    expect(loc.filters.q).toBe('a&b');
    expect(formatHash({ name: 'overview' })).toBe('#/');
  });
});

describe('HashRouter', () => {
  let router: HashRouter | undefined;
  afterEach(() => {
    router?.stop();
    window.history.replaceState(null, '', '#/');
  });

  it('emits on start, on navigate, on hashchange, and dedupes identical locations', async () => {
    window.history.replaceState(null, '', '#/budgets?range=4w');
    const seen: AppLocation[] = [];
    router = new HashRouter(window, (loc) => seen.push(loc));
    router.start();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.route.name).toBe('budgets');
    expect(seen[0]?.filters.range).toBe('4w');

    router.navigate({ name: 'source', source: 'cursor' }, defaultFilters());
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.hash).toBe('#/source/cursor');
    expect(seen).toHaveLength(2);

    router.navigate({ name: 'source', source: 'cursor' }, { ...defaultFilters(), q: 'Comp' }, { replace: true });
    expect(window.location.hash).toBe('#/source/cursor?q=Comp');
    expect(seen).toHaveLength(3);

    window.location.hash = '#/anomalies';
    window.dispatchEvent(new Event('hashchange'));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen.at(-1)?.route.name).toBe('anomalies');
    const count = seen.length;
    window.dispatchEvent(new Event('hashchange'));
    expect(seen).toHaveLength(count);
  });
});
