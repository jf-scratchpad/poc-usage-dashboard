import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const pages = readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8');
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
const vite = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

describe('GitHub Pages workflow', () => {
  it('triggers on push to main and workflow_dispatch', () => {
    expect(pages).toMatch(/branches:\s*\[[^\]]*main/);
    expect(pages).toMatch(/workflow_dispatch:/);
  });

  it('grants id-token: write only on the deploy job, and pages: write only on Pages jobs', () => {
    const workflowPerms = pages.split(/^\s*jobs:/m)[0] ?? '';
    expect(workflowPerms).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(workflowPerms).not.toMatch(/pages:\s*write/);
    expect(workflowPerms).not.toMatch(/id-token:\s*write/);

    const afterJobs = pages.split(/^\s*jobs:/m)[1] ?? '';
    const buildJob = afterJobs.split(/^\s*deploy:/m)[0] ?? '';
    const deployJob = afterJobs.split(/^\s*deploy:/m)[1] ?? '';
    expect(buildJob).toMatch(/pages:\s*write/);
    expect(buildJob).not.toMatch(/id-token:\s*write/);
    expect(deployJob).toMatch(/pages:\s*write/);
    expect(deployJob).toMatch(/id-token:\s*write/);
  });

  it('uses the official Pages actions and the project base path', () => {
    expect(pages).toMatch(/uses:\s*actions\/configure-pages@v\d+/);
    expect(pages).toMatch(/uses:\s*actions\/upload-pages-artifact@v\d+/);
    expect(pages).toMatch(/uses:\s*actions\/deploy-pages@v\d+/);
    expect(pages).toContain('VITE_BASE: /poc-usage-dashboard/');
    expect(pages).toMatch(/path:\s*dist/);
  });

  it('does not try to enable Pages from the workflow (needs administration:write)', () => {
    expect(pages).not.toMatch(/enablement:\s*true/);
  });
});

describe('CI workflow stays least-privilege', () => {
  it('does not grant Pages or id-token write', () => {
    expect(ci).not.toMatch(/pages:\s*write/);
    expect(ci).not.toMatch(/id-token:\s*write/);
  });
});

describe('Vite base path', () => {
  it('defaults to relative paths and honors VITE_BASE', () => {
    expect(vite).toContain("process.env.VITE_BASE || './'");
  });
});
