/**
 * Hard-limit scanner for the trial repo: no secrets and no hardware identifiers.
 * Run by tests/limits.test.ts, which runs in `npm test` and as its own CI step.
 *
 * Patterns are deliberately conservative. A false positive is fixed by changing the
 * content (use obviously fake placeholders), never by weakening the patterns silently;
 * any change here needs a line in DECISIONS.md.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type Finding = { file: string; line: number; rule: string; kind: 'secret' | 'hardware-id' | 'file' };

type Rule = { name: string; kind: Finding['kind']; re: RegExp };

export const CONTENT_RULES: Rule[] = [
  { name: 'private key block', kind: 'secret', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'GitHub token', kind: 'secret', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: 'Slack token', kind: 'secret', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { name: 'AWS access key', kind: 'secret', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'API key (sk-)', kind: 'secret', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'Azure storage key', kind: 'secret', re: /AccountKey=[A-Za-z0-9+/=]{20,}/ },
  { name: 'JWT', kind: 'secret', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./ },
  {
    name: 'hard-coded credential',
    kind: 'secret',
    re: /\b(api[_-]?key|secret|password|passwd|access[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
  },
  { name: 'MAC address', kind: 'hardware-id', re: /(?<![0-9A-Fa-f:-])([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/ },
  {
    name: 'hardware identifier field',
    kind: 'hardware-id',
    re: /\b(serial[_ -]?(number|no|num)?|hardware[_ -]?uuid|platform[_ -]?uuid|IOPlatformUUID|IOPlatformSerialNumber|udid|imei)\b["']?\s*[:=]\s*["']?[A-Za-z0-9-]{6,}/i,
  },
];

/** Files that must never be committed, by name. */
export const FORBIDDEN_FILE = /(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_rsa|id_ed25519)$/i;

/** Generated or vendored files that are not scanned for content. */
const SKIP_CONTENT = /(^|\/)(package-lock\.json|node_modules\/|dist\/|\.git\/)|\.(png|jpe?g|gif|ico|webp|woff2?)$/i;

export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, i) => {
    for (const rule of CONTENT_RULES) {
      if (rule.re.test(content)) findings.push({ file, line: i + 1, rule: rule.name, kind: rule.kind });
    }
  });
  return findings;
}

export function scanFileName(file: string): Finding[] {
  if (/(^|\/)\.env\.example$/i.test(file)) return [];
  return FORBIDDEN_FILE.test(file) ? [{ file, line: 0, rule: 'forbidden file type', kind: 'file' }] : [];
}

function walk(root: string, dir = root, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(root, full, out);
    else out.push(relative(root, full));
  }
  return out;
}

/** Lists files to scan: git-tracked plus untracked-but-not-ignored, falling back to a directory walk. */
export function listRepoFiles(root: string): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return walk(root);
  }
}

export function scanRepo(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of listRepoFiles(root)) {
    findings.push(...scanFileName(file));
    if (SKIP_CONTENT.test(file)) continue;
    let text: string;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // deleted in the working tree
    }
    findings.push(...scanText(file, text));
  }
  return findings;
}
