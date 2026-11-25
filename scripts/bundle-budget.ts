import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

/** Regression budget for the static build. Tightened later once sample data is code-split. */
export const BUDGET = {
  /** Largest JavaScript asset, uncompressed. */
  maxJsBytes: 900 * 1024,
  /** Largest JavaScript asset, gzip. */
  maxJsGzipBytes: 200 * 1024,
  /** Whole dist/ tree (files only, no maps). */
  maxDistBytes: 2 * 1024 * 1024,
} as const;

export type FileSize = { path: string; bytes: number; gzipBytes: number | null };
export type BudgetReport = {
  files: FileSize[];
  distBytes: number;
  violations: string[];
};

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export async function measureDist(distDir: string): Promise<BudgetReport> {
  const files: FileSize[] = [];
  let distBytes = 0;
  for (const full of await walk(distDir)) {
    if (full.endsWith('.map')) continue;
    const bytes = (await stat(full)).size;
    distBytes += bytes;
    const isJs = full.endsWith('.js');
    files.push({
      path: relative(distDir, full),
      bytes,
      gzipBytes: isJs ? gzipSync(readFileSync(full)).length : null,
    });
  }
  files.sort((a, b) => b.bytes - a.bytes);
  return { files, distBytes, violations: violationsOf({ files, distBytes }) };
}

export function violationsOf(report: Omit<BudgetReport, 'violations'>): string[] {
  const violations: string[] = [];
  if (report.distBytes > BUDGET.maxDistBytes) {
    violations.push(
      `dist/ is ${report.distBytes} bytes, budget is ${BUDGET.maxDistBytes}`,
    );
  }
  for (const file of report.files) {
    if (file.path.endsWith('.js') && file.bytes > BUDGET.maxJsBytes) {
      violations.push(`${file.path} is ${file.bytes} bytes, JS budget is ${BUDGET.maxJsBytes}`);
    }
    if (file.gzipBytes !== null && file.gzipBytes > BUDGET.maxJsGzipBytes) {
      violations.push(
        `${file.path} is ${file.gzipBytes} bytes gzip, gzip JS budget is ${BUDGET.maxJsGzipBytes}`,
      );
    }
  }
  return violations;
}

export type CliIo = {
  log: (msg: string) => void;
  error: (msg: string) => void;
};

export async function runBundleBudget(
  cwd: string = process.cwd(),
  io: CliIo = { log: console.log, error: console.error },
): Promise<number> {
  const distDir = join(cwd, 'dist');
  try {
    await stat(distDir);
  } catch {
    io.error('dist/ is missing. Run `npm run build` first.');
    return 1;
  }
  const report = await measureDist(distDir);
  for (const file of report.files.slice(0, 10)) {
    const gz = file.gzipBytes !== null ? `, gzip ${file.gzipBytes}` : '';
    io.log(`${file.path}: ${file.bytes}${gz}`);
  }
  io.log(`total dist/: ${report.distBytes}`);
  if (report.violations.length > 0) {
    io.error('Bundle budget exceeded:');
    for (const v of report.violations) io.error(`- ${v}`);
    return 1;
  }
  io.log('Bundle budget ok.');
  return 0;
}
