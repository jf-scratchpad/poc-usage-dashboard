import { h } from '../dom';
import { viewHeader } from './common';
import type { ViewContext, ViewResult } from './types';

/** Temporary view for routes whose real view is still in review. */
export function render(ctx: ViewContext): ViewResult {
  const title = ctx.route.name.charAt(0).toUpperCase() + ctx.route.name.slice(1);
  ctx.root.append(
    viewHeader(title),
    h('div', { class: 'state state-empty', 'data-state': 'empty', role: 'status' }, h('p', {}, 'This view is on its way in the next update.')),
  );
  return { title, state: 'empty', tables: [] };
}
