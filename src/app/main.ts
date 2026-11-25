import './styles.css';
import { loadUsageData } from '../data/load';
import { dataAsOf, todayInTimeZone } from './dates';
import { renderApp } from './render';

async function main(): Promise<void> {
  const el = document.getElementById('app');
  if (!el) {
    throw new Error('Missing #app');
  }

  try {
    // Collected public/data/usage.v1.json first; bundled adapters as fallback.
    const { records } = await loadUsageData();
    renderApp(el, records, { asOf: dataAsOf(records, todayInTimeZone()) });
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
