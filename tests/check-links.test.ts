import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkHref, checkMarkdownLinks, extractLinks, runLinkCheck } from '../scripts/check-links';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('extractLinks', () => {
  it('finds markdown and autolinks', () => {
    const hits = extractLinks('[docs](docs/ARCHITECTURE.md)\nSee <https://example.com/x>.\n![img](docs/x.png)');
    expect(hits.map((h) => h.href)).toEqual([
      'docs/ARCHITECTURE.md',
      'https://example.com/x',
      'docs/x.png',
    ]);
  });
});

describe('checkHref', () => {
  it('accepts http(s) URLs, mailto, and anchors', () => {
    const file = '/tmp/README.md';
    expect(checkHref(file, 'https://example.com/path')).toBeNull();
    expect(checkHref(file, 'mailto:nobody@example.com')).toBeNull();
    expect(checkHref(file, '#section')).toBeNull();
  });

  it('rejects a broken relative path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-'));
    dirs.push(dir);
    const file = join(dir, 'README.md');
    writeFileSync(file, '');
    expect(checkHref(file, 'docs/missing.md')).toMatch(/missing file/);
  });

  it('accepts a relative path that exists, including hash fragments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'ARCHITECTURE.md'), '# hi\n');
    const file = join(dir, 'README.md');
    writeFileSync(file, '');
    expect(checkHref(file, 'docs/ARCHITECTURE.md#pieces')).toBeNull();
  });

  it('rejects an invalid URL', () => {
    expect(checkHref('/tmp/README.md', 'https://exa mple.com')).toBe('invalid URL');
  });
});

describe('checkMarkdownLinks', () => {
  it('reports only broken links in documented markdown files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-repo-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'README.md'), '[ok](docs/ARCHITECTURE.md)\n[bad](docs/nope.md)\n');
    writeFileSync(join(dir, 'docs', 'ARCHITECTURE.md'), 'See [root](../README.md).\n');
    writeFileSync(join(dir, 'notes.md'), '[ignored](does-not-exist.md)\n');
    const { findings } = checkMarkdownLinks(dir);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.href).toBe('docs/nope.md');
  });
});

describe('runLinkCheck', () => {
  it('returns 0 when links resolve', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-ok-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'README.md'), '[docs](docs/ARCHITECTURE.md)\n');
    writeFileSync(join(dir, 'docs', 'ARCHITECTURE.md'), '# ok\n');
    const logs: string[] = [];
    expect(runLinkCheck(dir, { log: (m) => logs.push(m), error: () => {} })).toBe(0);
    expect(logs.join(' ')).toMatch(/Doc links ok/);
  });

  it('returns 1 when a relative link is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'links-bad-'));
    dirs.push(dir);
    writeFileSync(join(dir, 'README.md'), '[bad](docs/nope.md)\n');
    const errors: string[] = [];
    expect(runLinkCheck(dir, { log: () => {}, error: (m) => errors.push(m) })).toBe(1);
    expect(errors.join(' ')).toMatch(/nope\.md/);
  });
});
