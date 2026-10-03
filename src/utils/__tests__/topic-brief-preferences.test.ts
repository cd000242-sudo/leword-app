import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readBriefProvider, saveBriefProvider } from '../../main/topic-brief-preferences';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('saved topic brief engine', () => {
  it('persists the chosen engine across reads without changing generation credentials', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brief-pref-')); dirs.push(dir);
    expect(readBriefProvider(dir)).toBeUndefined();
    saveBriefProvider(dir, 'codex');
    expect(readBriefProvider(dir)).toBe('codex');
    saveBriefProvider(dir, 'gemini');
    expect(readBriefProvider(dir)).toBe('gemini');
    expect(JSON.parse(readFileSync(join(dir, 'topic-briefs', 'engine.json'), 'utf8'))).toEqual({ provider: 'gemini' });
    expect(() => saveBriefProvider(dir, '../../secrets')).toThrow();
    expect(readBriefProvider(dir)).toBe('gemini');
  });
});
