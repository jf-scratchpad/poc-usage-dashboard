import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type LinkHit = { file: string; line: number; href: string };
export type LinkFinding = LinkHit & { reason: string };

const SKIP_PREFIXES = ['mailto:', 'tel:'];
const DOC_NAMES = new Set([
  'README.md',
  'DECISIONS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
]);

/** Markdown inline and autolinks, plus bare relative .md/.html paths in backticks are ignored. */
const LINK_RE = /!?\[(?:[^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|<(https?:\/\/[^>\s]+)>/g;

export function extractLinks(text: string): Array<{ href: string; line: number }> {
  const hits: Array<{ href: string; line: number }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line))) {
      const href = m[1] ?? m[2];
      if (href) hits.push({ href, line: i + 1 });
    }
  }
  return hits;
}

export function collectMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === 'coverage' || name === '.git') {
        continue;
      }
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.md')) out.push(full);
    }
  }
  walk(root);
  return out.sort();
}

export function checkHref(file: string, href: string): string | null {
  const raw = href.trim();
  if (raw.startsWith('#')) return null;
  if (SKIP_PREFIXES.some((p) => raw.toLowerCase().startsWith(p))) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return `unsupported protocol ${url.protocol}`;
      }
      return null;
    } catch {
      return 'invalid URL';
    }
  }

  const [pathPart] = raw.split('#');
  if (!pathPart) return null;
  const target = resolve(dirname(file), pathPart);
  if (!existsSync(target)) {
    return `missing file ${pathPart}`;
  }
  return null;
}

export function checkMarkdownLinks(root: string): { files: string[]; findings: LinkFinding[] } {
  const files = collectMarkdownFiles(root).filter((f) => {
    const base = f.slice(root.length).replace(/^[\\/]/, '');
    const name = base.split(/[\\/]/).pop() ?? '';
    return DOC_NAMES.has(name) || base.startsWith('docs/') || base.startsWith('data/sample/');
  });
  const findings: LinkFinding[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const hit of extractLinks(text)) {
      const reason = checkHref(file, hit.href);
      if (reason) findings.push({ file, line: hit.line, href: hit.href, reason });
    }
  }
  return { files, findings };
}

export type CliIo = {
  log: (msg: string) => void;
  error: (msg: string) => void;
};

export function runLinkCheck(
  root: string = process.cwd(),
  io: CliIo = { log: console.log, error: console.error },
): number {
  const { files, findings } = checkMarkdownLinks(root);
  io.log(`Checked ${files.length} markdown files.`);
  if (findings.length > 0) {
    for (const f of findings) {
      const rel = f.file.startsWith(root) ? f.file.slice(root.length + 1) : f.file;
      io.error(`${rel}:${f.line}: ${f.reason} (${f.href})`);
    }
    return 1;
  }
  io.log('Doc links ok.');
  return 0;
}
