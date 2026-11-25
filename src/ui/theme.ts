/** Dark / light theme with a toggle, persisted locally (no network). */
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'ud-theme';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(win: Window): StorageLike | undefined {
  try {
    return win.localStorage;
  } catch {
    return undefined;
  }
}

export function initialTheme(win: Window): Theme {
  const saved = safeStorage(win)?.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return win.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.dataset.theme = theme;
  doc.documentElement.style.colorScheme = theme;
}

export function saveTheme(win: Window, theme: Theme): void {
  try {
    safeStorage(win)?.setItem(THEME_KEY, theme);
  } catch {
    /* private mode: ignore */
  }
}

export function currentTheme(doc: Document): Theme {
  return doc.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
