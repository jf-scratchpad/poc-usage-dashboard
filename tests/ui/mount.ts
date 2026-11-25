import { installCanvasMock } from '../canvas-mock';
import { FIXTURE_AS_OF, FIXTURE_RECORDS } from '../fixtures';
import { AppShell, type ShellOptions } from '../../src/ui/shell';
import type { UsageRecord } from '../../src/schema/usage';

let installed = false;

export type Mounted = { shell: AppShell; root: HTMLElement; cleanup(): void };

/** Mounts the full app shell at `hash` with fixture data and waits for the first render. */
export async function mountApp(hash = '#/', records: UsageRecord[] = FIXTURE_RECORDS, options: ShellOptions = {}): Promise<Mounted> {
  if (!installed) {
    installCanvasMock();
    installed = true;
  }
  window.localStorage.clear();
  window.history.replaceState(null, '', hash);
  const root = document.createElement('div');
  document.body.append(root);
  const shell = new AppShell(root, {
    loader: async () => ({ records, manifest: null, origin: 'json' }),
    today: FIXTURE_AS_OF,
    ...options,
  });
  await shell.start();
  return {
    shell,
    root,
    cleanup: () => {
      shell.destroy();
      root.remove();
      window.history.replaceState(null, '', '#/');
    },
  };
}

export async function go(m: Mounted, hash: string): Promise<void> {
  window.location.hash = hash;
  window.dispatchEvent(new Event('hashchange'));
  await new Promise((r) => setTimeout(r, 0));
  await m.shell.whenIdle();
}

export function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}
