import { totalsByWeek, type WeekTotals } from '../../aggregate';
import { parseDate } from '../../aggregate';
import type { UsageRecord } from '../../schema/usage';
import { h } from '../dom';
import type { ViewContext } from './types';

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function shortDate(date: string): string {
  return SHORT.format(parseDate(date));
}

export function longDate(date: string): string {
  return LONG.format(parseDate(date));
}

/** Week buckets spanning the whole filter window, so axes are continuous. */
export function weeksInWindow(records: readonly UsageRecord[], ctx: Pick<ViewContext, 'window'>): WeekTotals[] {
  return totalsByWeek(records, { from: ctx.window.from, to: ctx.window.to });
}

export function viewHeader(title: string, subtitle?: string, ...extra: (Node | string)[]): HTMLElement {
  return h(
    'header',
    { class: 'view-header' },
    h('h2', { tabindex: '-1', 'data-view-title': true }, title),
    subtitle ? h('p', { class: 'muted' }, subtitle) : null,
    ...extra,
  );
}

export function tile(label: string, value: string, hint?: string, attrs: Record<string, string> = {}): HTMLElement {
  return h(
    'div',
    { class: 'tile', ...attrs },
    h('p', { class: 'tile-label' }, label),
    h('p', { class: 'tile-value' }, value),
    hint ? h('p', { class: 'tile-hint muted' }, hint) : null,
  );
}

/** Shared empty state with a link that clears the filters. */
export function emptyState(ctx: ViewContext, message: string): HTMLElement {
  return h(
    'div',
    { class: 'state state-empty', 'data-state': 'empty', role: 'status' },
    h('p', {}, message),
    h('p', {}, h('a', { href: ctx.resetHref, class: 'button' }, 'Reset filters')),
  );
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
