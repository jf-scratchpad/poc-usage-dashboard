import type { Dataset } from '../data';
import type { DateWindow, Filters } from '../filters';
import type { Route } from '../router';
import type { ChartHost } from '../charts';
import type { DataTable } from '../table';
import type { Theme } from '../theme';
import type { UsageRecord } from '../../schema/usage';

export type ViewContext = {
  /** Container to render into (already empty). */
  root: HTMLElement;
  data: Dataset;
  route: Route;
  filters: Filters;
  window: DateWindow;
  /** Records after every global filter (date, sources, search). */
  filtered: UsageRecord[];
  theme: Theme;
  charts: ChartHost;
  /** Href for another route that keeps the current filters. */
  hrefFor(route: Route): string;
  /** Navigate to another route keeping the current filters (chart clicks). */
  navigate(route: Route): void;
  /** Href for this route with filters reset. */
  resetHref: string;
};

export type ViewResult = {
  /** Page title / heading text. */
  title: string;
  state: 'ready' | 'empty';
  /** Tables for export; the first is the primary CSV export. */
  tables: DataTable[];
  /** Resolves when lazy charts have been created (tests await this). */
  chartsReady?: Promise<void>;
};

export type ViewModule = { render(ctx: ViewContext): ViewResult };
