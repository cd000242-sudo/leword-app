import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const { mergeCandidateFiles } = require('../../../scripts/candidate-shards');

/**
 * partial 샤드가 합치기를 죽이던 것 (2026-09-15 검증에서 실행으로 확인).
 *
 * 부분 저장(partial: true)은 240분에 잘린 샤드의 몫을 살리려고 넣은 것인데, 정작 합치기가
 * partial 샤드를 만나면 경고 문구 안의 `file` 이 정의돼 있지 않아 ReferenceError 로 죽었다.
 * 즉 "잘려도 partial 은 올라간다" 는 설계가 한 번도 끝까지 간 적이 없다.
 */
describe('partial 샤드 합치기', () => {
  it('partial 샤드를 경고와 함께 합친다 — 죽지 않는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shard-partial-'));
    const whole = path.join(dir, 'a.json');
    const partial = path.join(dir, 'b.json');
    fs.writeFileSync(whole, JSON.stringify({ topics: { 영화: [{ keyword: '가' }] }, report: [{ topic: '영화' }] }), 'utf8');
    fs.writeFileSync(partial, JSON.stringify({
      partial: true, partialTopicsDone: ['음악'], topics: { 음악: [{ keyword: '나' }] }, report: [{ topic: '음악' }],
    }), 'utf8');
    const merged = mergeCandidateFiles([whole, partial], { expect: 2 });
    expect(Object.keys(merged.topics).sort()).toEqual(['영화', '음악']);
    expect(merged.topics['음악']).toHaveLength(1);
  });
});
