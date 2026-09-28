import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { publicBoard, writeSuccessfulBoard } from '../../main/board-cache';

const now = Date.parse('2026-09-28T04:00:00Z');
const stamp = new Date(now).toISOString();
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const brief = { title: '지원금 신청 조건 확인', coreKeyword: '지원금 신청', timing: 'NOW', field: '정책', facts: [{ id: 'f1', title: '지원금 신청', snippet: '조건 확인', body: '비공개 기사 전체', apiKey: 'SECRET', link: 'https://news.naver.com/article/1', publishedAt: stamp }], factIds: ['f1'] };

describe('public board projection and successful snapshot', () => {
  it('normalizes legacy briefs and only publishes whitelisted fields', () => {
    const board: any = publicBoard('topic-briefs', { builtAt: stamp, briefs: [brief], token: 'SECRET', rounds: [{ slot: '아침', builtAt: stamp, briefs: [brief], config: 'SECRET' }] }, now);
    expect(board.briefs[0].editorial.status).toBe('needs_research');
    expect(JSON.stringify(board)).not.toContain('SECRET');
    expect(JSON.stringify(board)).not.toContain('비공개 기사 전체');
    expect(board.rounds[0].briefs).toHaveLength(1);
  });
  it('rejects malformed, empty, future and expired payloads', () => {
    expect(publicBoard('topic-briefs', { builtAt: stamp, briefs: [] }, now)).toBeNull();
    expect(publicBoard('topic-briefs', { builtAt: new Date(now + 600000).toISOString(), briefs: [brief] }, now)).toBeNull();
    expect(publicBoard('brief-titles', { generatedAt: stamp, titles: [{ keyword: '가나다', seo: '가나다 제목', at: new Date(now - 25 * 3600000).toISOString() }] }, now)).toBeNull();
  });
  it('drops stale title rows individually and retains each creation time', () => {
    const board: any = publicBoard('brief-titles', { generatedAt: stamp, titles: [{ keyword: '최신', seo: '최신 소식 제목', at: stamp, prompt: 'SECRET' }, { keyword: '과거', seo: '지난 소식 제목', at: '2020-01-01' }] }, now);
    expect(board.titles).toEqual([{ keyword: '최신', seo: '최신 소식 제목', at: stamp }]);
  });
  it('preserves the previous file for empty, canceled, or older results', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-board-test-')); dirs.push(dir);
    const file = path.join(dir, 'board.json');
    const original = { builtAt: stamp, briefs: [brief] };
    expect(writeSuccessfulBoard(file, 'topic-briefs', original, { nowMs: now })).toBe(true);
    const prior = fs.readFileSync(file, 'utf8');
    expect(writeSuccessfulBoard(file, 'topic-briefs', { builtAt: stamp, briefs: [] }, { nowMs: now })).toBe(false);
    expect(writeSuccessfulBoard(file, 'topic-briefs', original, { nowMs: now, cancelled: true })).toBe(false);
    expect(writeSuccessfulBoard(file, 'topic-briefs', { ...original, builtAt: new Date(now - 1).toISOString() }, { nowMs: now })).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(prior);
    expect(fs.readdirSync(dir)).toEqual(['board.json']);
  });
  it('retains source evidence for issue briefs without publishing private fields', () => {
    const board: any = publicBoard('issue-niche', { publishedAt: stamp, rows: [], issues: [{ issue: '예시 이슈', why: '보도 확인', headlines: [{ title: '예시 보도', link: 'https://news.naver.com/a', body: 'SECRET' }], concentrated: [], nextWave: [] }], token: 'SECRET' }, now);
    expect(board.issues[0].headlines[0].title).toBe('예시 보도');
    expect(JSON.stringify(board)).not.toContain('SECRET');
  });
});
