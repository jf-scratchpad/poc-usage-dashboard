import { existsSync } from 'node:fs';
import { preview, build, type PreviewServer } from 'vite';

const HOST = '127.0.0.1';
const PORT = Number(process.env.E2E_PORT ?? 4173);

let server: PreviewServer | undefined;

export function previewOrigin(): string {
  return `http://${HOST}:${PORT}`;
}

export async function startPreview(): Promise<string> {
  if (!existsSync('dist/index.html')) {
    await build();
  }
  server = await preview({
    preview: { host: HOST, port: PORT, strictPort: true },
  });
  return previewOrigin();
}

export async function stopPreview(): Promise<void> {
  await server?.close();
  server = undefined;
}
