/**
 * Tiny hash router. Hash routing keeps the static site working from any
 * subpath (GitHub Pages serves it under /poc-usage-dashboard/) with no
 * server rewrites. Format: `#/<view>[/<param>]?<filter query>`.
 */
import { isSource, type Source } from '../schema/usage';
import { defaultFilters, filtersEqual, filtersToParams, parseFilters, type Filters } from './filters';

export type Route =
  | { name: 'overview' }
  | { name: 'assistant'; assistant: string }
  | { name: 'source'; source: Source }
  | { name: 'budgets' }
  | { name: 'forecast' }
  | { name: 'anomalies' }
  | { name: 'notfound'; path: string };

export type RouteName = Route['name'];

export type AppLocation = { route: Route; filters: Filters };

function safeDecode(s: string): string | undefined {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}

export function parseRoute(path: string): Route {
  const parts = path.split('/').filter((p) => p !== '');
  const [head, param, ...rest] = parts;
  if (head === undefined) return { name: 'overview' };
  if (rest.length === 0) {
    if (param === undefined) {
      if (head === 'overview') return { name: 'overview' };
      if (head === 'budgets') return { name: 'budgets' };
      if (head === 'forecast') return { name: 'forecast' };
      if (head === 'anomalies') return { name: 'anomalies' };
    } else {
      const value = safeDecode(param);
      if (head === 'assistant' && value && value.trim() !== '') return { name: 'assistant', assistant: value };
      if (head === 'source' && value && isSource(value)) return { name: 'source', source: value };
    }
  }
  return { name: 'notfound', path: '/' + parts.join('/') };
}

export function parseHash(hash: string): AppLocation {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q === -1 ? raw : raw.slice(0, q);
  const query = q === -1 ? '' : raw.slice(q + 1);
  return { route: parseRoute(path), filters: parseFilters(new URLSearchParams(query)) };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case 'overview':
      return '/';
    case 'assistant':
      return `/assistant/${encodeURIComponent(route.assistant)}`;
    case 'source':
      return `/source/${encodeURIComponent(route.source)}`;
    case 'notfound':
      return route.path;
    default:
      return `/${route.name}`;
  }
}

export function formatHash(route: Route, filters: Filters = defaultFilters()): string {
  const query = filtersToParams(filters).toString();
  return `#${routePath(route)}${query ? `?${query}` : ''}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return routePath(a) === routePath(b);
}

export function locationsEqual(a: AppLocation, b: AppLocation): boolean {
  return sameRoute(a.route, b.route) && filtersEqual(a.filters, b.filters);
}

export type RouteListener = (loc: AppLocation, previous: AppLocation | undefined) => void;

/** Minimal browser binding: listens to hashchange and writes the hash. */
export class HashRouter {
  private current: AppLocation | undefined;
  private readonly onHashChange = (): void => this.emit();

  constructor(
    private readonly win: Window,
    private readonly listener: RouteListener,
  ) {}

  start(): void {
    this.win.addEventListener('hashchange', this.onHashChange);
    this.emit();
  }

  stop(): void {
    this.win.removeEventListener('hashchange', this.onHashChange);
  }

  get location(): AppLocation {
    return this.current ?? parseHash(this.win.location.hash);
  }

  /** Navigates and notifies. `replace` avoids a history entry (used for filter typing). */
  navigate(route: Route, filters: Filters, options: { replace?: boolean } = {}): void {
    const hash = formatHash(route, filters);
    if (options.replace) {
      this.win.history.replaceState(this.win.history.state, '', hash);
      this.emit();
    } else if (this.win.location.hash !== hash) {
      this.win.location.hash = hash; // fires hashchange -> emit
      // Some environments dispatch hashchange asynchronously; emit now and dedupe.
      this.emit();
    }
  }

  private emit(): void {
    const next = parseHash(this.win.location.hash);
    const prev = this.current;
    if (prev && locationsEqual(prev, next)) return;
    this.current = next;
    this.listener(next, prev);
  }
}
