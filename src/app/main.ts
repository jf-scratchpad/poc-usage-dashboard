import './styles.css';
import { loadAllUsage } from '../adapters/index';
import { todayInTimeZone } from './dates';
import { renderApp } from './render';

async function main(): Promise<void> {
  const el = document.getElementById('app');
  if (!el) {
    throw new Error('Missing #app');
  }

  try {
    const records = await loadAllUsage();
    renderApp(el, records, { asOf: todayInTimeZone() });
  } catch (err) {
    el.replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Could not load usage data.';
    el.append(p);
    console.error(err);
  }
}

void main();
