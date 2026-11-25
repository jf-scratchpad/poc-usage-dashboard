import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanFileName, scanRepo, scanText } from '../scripts/limits';

// Fixtures are assembled at runtime so this file never contains a literal match itself.
const j = (...parts: string[]) => parts.join('');

describe('limits scanner: detects', () => {
  const cases: Array<[string, string]> = [
    ['private key block', j('-----BEGIN ', 'RSA PRIVATE KEY-----')],
    ['GitHub token', j('gh', 'p_', 'a'.repeat(36))],
    ['Slack token', j('xo', 'xb-', '1234567890-abcdef')],
    ['AWS access key', j('AK', 'IA', 'ABCDEFGHIJKLMNOP')],
    ['API key (sk-)', j('s', 'k-', 'x'.repeat(24))],
    ['hard-coded credential', j('api', '_key', ' = "', 'abcdefghijklmnop', '"')],
    ['MAC address', j('a4:83:', 'e7:12:', '34:56')],
    ['hardware identifier field', j('"serial', '_number": "', 'C02XYZ12345"')],
    ['hardware identifier field', j('IOPlatform', 'UUID = ', 'ABCDEF12-3456')],
  ];
  it.each(cases)('%s', (rule, line) => {
    expect(scanText('x.ts', line).map((f) => f.rule)).toContain(rule);
  });

  it('forbidden file names', () => {
    expect(scanFileName('keys/app.pem')).toHaveLength(1);
    expect(scanFileName('.env')).toHaveLength(1);
    expect(scanFileName('.env.local')).toHaveLength(1);
  });
});

describe('limits scanner: ignores ordinary content', () => {
  it.each([
    'const cost_usd = 12.34;',
    'date: "2026-11-23", units: 1200',
    'time 12:34:56 is not a MAC',
    'const token = getTokenFromEnv();',
    'sha 6f1c2e3d4b5a',
  ])('%s', (line) => {
    expect(scanText('x.ts', line)).toEqual([]);
  });

  it('allows .env.example', () => {
    expect(scanFileName('.env.example')).toEqual([]);
  });
});

describe('repository', () => {
  it('contains no secrets, hardware identifiers, or forbidden files', () => {
    const findings = scanRepo(resolve(__dirname, '..'));
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
  });
});
