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
  it('preserves same-query split search counts and strips private response data', () => {
    const evidence = {source:'naver-searchad',keyword:'지원금 신청',measuredAt:stamp,pc:100,mobile:null,pcUnder10:false,mobileUnder10:true,totalMin:100,totalMax:109,status:'range',accessToken:'SECRET'};
    const board:any = publicBoard('topic-briefs',{builtAt:stamp,briefs:[{...brief,searchVolume:999,searchVolumeUnder10:true,searchVolumeEvidence:evidence}]},now);
    expect(board.briefs[0]).toMatchObject({searchVolume:null,searchVolumeUnder10:false,searchVolumeEvidence:{totalMin:100,totalMax:109,pc:100,mobile:null}});
    expect(JSON.stringify(board)).not.toContain('SECRET');
    const invalid:any = publicBoard('topic-briefs',{builtAt:stamp,briefs:[{...brief,searchVolume:999,searchVolumeEvidence:{...evidence,keyword:'다른 검색어'}}]},now);
    expect(invalid.briefs[0].searchVolume).toBeNull();
    expect(invalid.briefs[0].searchVolumeEvidence).toBeUndefined();
  });
  it('publishes bounded inventory metadata without provider errors or private details', () => {
    const inventory = {targetCount:30,actualCount:1,complete:false,shortfall:29,shortfallReason:'추가 자료 확인 중',supportedCount:0,refillRounds:2,attempts:3,failures:[{reason:'SECRET'}],byField:{정책:1},token:'SECRET'};
    const board:any = publicBoard('topic-briefs',{builtAt:stamp,briefs:[brief],inventory,rounds:[{slot:'아침',builtAt:stamp,briefs:[brief],inventory}]},now);
    const expected = {targetCount:30,actualCount:1,complete:false,shortfall:29,shortfallReason:'추가 자료 확인 중',supportedCount:0,refillRounds:2,attempts:3};
    expect(board.inventory).toEqual(expected);
    expect(board.rounds[0].inventory).toEqual(expected);
    expect(JSON.stringify(board)).not.toContain('SECRET');
  });
  it('preserves writing tables and public paragraphs while excluding private nested fields', () => {
    const writingPackage = { version:1, status:'ready', title:'공개 제목', sourceIds:['f1'], sections:[{heading:'조건',paragraphs:['공개 설명'],factIds:['f1'],token:'SECRET'}], table:{caption:'조건표',headers:['항목','기준'],rows:[['조건','확인'],[{password:'SECRET'},'제외']],factIds:['f1'],privateDraft:'SECRET'},privateDraft:'SECRET' };
    const board: any = publicBoard('topic-briefs', {builtAt:stamp,briefs:[{...brief,writingPackage}]}, now);
    expect(board.briefs[0].writingPackage.table.rows).toEqual([['조건','확인']]);
    expect(board.briefs[0].writingPackage.sections[0].paragraphs).toEqual(['공개 설명']);
    expect(JSON.stringify(board)).not.toContain('SECRET');
  });
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
