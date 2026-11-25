import { h } from '../dom';
import { viewHeader } from './common';
import type { ViewContext, ViewResult } from './types';

export function render(ctx: ViewContext): ViewResult {
  const path = ctx.route.name === 'notfound' ? ctx.route.path : '';
  ctx.root.append(
    viewHeader('Page not found'),
    h(
      'div',
      { class: 'state state-empty', 'data-state': 'empty', role: 'status' },
      h('p', {}, `There is no view at “${path}”. Assistant and source links must match the data.`),
      h('p', {}, h('a', { href: ctx.hrefFor({ name: 'overview' }), class: 'button' }, 'Go to the overview')),
    ),
  );
  return { title: 'Not found', state: 'empty', tables: [] };
}
