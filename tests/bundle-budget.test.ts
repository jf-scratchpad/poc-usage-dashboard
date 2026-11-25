import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BUDGET, measureDist, runBundleBudget, violationsOf } from '../scripts/bundle-budget';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  return dir;
}

describe('bundle budget', () => {
  it('defines a finite regression budget', () => {
    expect(BUDGET.maxJsBytes).toBe(900 * 1024);
    expect(BUDGET.maxJsGzipBytes).toBe(200 * 1024);
    expect(BUDGET.maxDistBytes).toBe(2 * 1024 * 1024);
  });

  it('accepts a small dist tree', async () => {
    const dist = tempDist();
    writeFileSync(join(dist, 'index.html'), '<html></html>');
    writeFileSync(join(dist, 'assets', 'index.js'), 'console.log("ok");');
    const report = await measureDist(dist);
    expect(report.violations).toEqual([]);
    expect(report.files.some((f) => f.path === 'assets/index.js' && f.gzipBytes !== null)).toBe(true);
  });

  it('flags a JavaScript file over the uncompressed budget', () => {
    const js = { path: 'assets/huge.js', bytes: BUDGET.maxJsBytes + 1, gzipBytes: 10 };
    expect(violationsOf({ files: [js], distBytes: js.bytes }).join(' ')).toMatch(/huge\.js/);
  });

  it('flags a JavaScript file over the gzip budget', () => {
    const js = {
      path: 'assets/fat.js',
      bytes: BUDGET.maxJsBytes,
      gzipBytes: BUDGET.maxJsGzipBytes + 1,
    };
    expect(violationsOf({ files: [js], distBytes: js.bytes }).join(' ')).toMatch(/gzip/);
  });

  it('CLI returns 1 when dist/ is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-nodist-'));
    dirs.push(dir);
    const errors: string[] = [];
    const code = await runBundleBudget(dir, { log: () => {}, error: (m) => errors.push(m) });
    expect(code).toBe(1);
    expect(errors.join(' ')).toMatch(/dist\/ is missing/);
  });

  it('CLI returns 0 for a small built tree', async () => {
    const cwd = tempDist();
    mkdirSync(join(cwd, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(cwd, 'dist', 'index.html'), '<html></html>');
    writeFileSync(join(cwd, 'dist', 'assets', 'index.js'), 'console.log("ok");');
    const logs: string[] = [];
    const code = await runBundleBudget(cwd, { log: (m) => logs.push(m), error: () => {} });
    expect(code).toBe(0);
    expect(logs.join('\n')).toMatch(/Bundle budget ok/);
  });

  it('ignores source maps when totaling dist/', async () => {
    const dist = tempDist();
    writeFileSync(join(dist, 'assets', 'index.js'), 'ok');
    writeFileSync(join(dist, 'assets', 'index.js.map'), 'x'.repeat(10000));
    const report = await measureDist(dist);
    expect(report.files.some((f) => f.path.endsWith('.map'))).toBe(false);
    expect(report.distBytes).toBe(2);
  });
});
