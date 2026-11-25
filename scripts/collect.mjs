#!/usr/bin/env node
// `npm run collect` — validates every adapter, dedupes, and writes
// public/data/usage.v1.json + public/data/manifest.json.
// `npm run collect -- --check` exits 1 if the committed files are stale.
// Uses Vite's own SSR loader (already a dependency) instead of adding tsx.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data');
const check = process.argv.includes('--check');

const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let code = 0;
try {
  const mod = await server.ssrLoadModule('/scripts/collect-run.ts');
  const { files, summary } = await mod.run();
  if (check) {
    for (const [name, content] of Object.entries(files)) {
      const current = await readFile(join(outDir, name), 'utf8').catch(() => '');
      if (current !== content) {
        console.error(`public/data/${name} is stale; run npm run collect`);
        code = 1;
      }
    }
    if (code === 0) console.log(`collect --check ok: ${summary}`);
  } else {
    await mkdir(outDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) await writeFile(join(outDir, name), content);
    console.log(`collect wrote public/data: ${summary}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
