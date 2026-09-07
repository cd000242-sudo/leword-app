import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const {
    shardTopics,
    mergeCandidateFiles,
} = require('../../../scripts/candidate-shards');

/**
 * 발굴을 여러 러너로 쪼개기 위한 두 조각을 잠근다.
 *
 * 왜 쪼개나: 2026-09-07 첫 32주제 회차 실측에서 발굴 한 스텝이 2시간 56분이었고
 * (자동완성 10,608회가 그중 2시간 49분), 회차 전체가 4시간 11분이었다. 잡 제한은
 * 300분이라 남은 여유가 49분뿐이다. 공급을 늘리려면 표본을 늘려야 하는데,
 * 한 잡에서 늘리면 제한에 걸려 **회차 전체가 0행으로 죽는다**. 러너를 나누면
 * 러너당 IP 요청 속도는 그대로 두고 벽시계만 1/N 로 준다.
 *
 * 여기서 잠그는 것은 두 가지다:
 *   1. 쪼갠 조각을 합치면 원래 주제 집합이 **정확히** 나온다(빠짐·중복 없음)
 *   2. 샤드 하나가 죽어도 나머지로 발행한다 — 그러나 전멸이면 조용히 넘어가지 않는다
 */

describe('주제 샤딩', () => {
    const topics = [
        '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마',
        '스타·연예인', '만화·애니', '방송', '일상·생각', '육아·결혼',
    ];

    it('샤드를 전부 합치면 원래 주제 집합이 그대로 나온다', () => {
        const shards = 4;
        const collected = Array.from({ length: shards }, (_, i) => shardTopics(topics, i, shards)).flat();
        expect([...collected].sort()).toEqual([...topics].sort());
    });

    it('한 주제가 두 샤드에 겹쳐 들어가지 않는다', () => {
        const shards = 4;
        const collected = Array.from({ length: shards }, (_, i) => shardTopics(topics, i, shards)).flat();
        expect(collected.length).toBe(new Set(collected).size);
        expect(collected.length).toBe(topics.length);
    });

    it('같은 인자면 항상 같은 결과다 — 재시도가 다른 주제를 파면 안 된다', () => {
        expect(shardTopics(topics, 2, 4)).toEqual(shardTopics(topics, 2, 4));
    });

    /*
     * 라운드로빈이어야 하는 이유: 주제별 소요가 17배까지 벌어진다
     * (실측 문학·책 2,657초 vs 게임 150초). 앞에서부터 뭉텅이로 자르면
     * 무거운 주제가 한 샤드에 몰려 그 샤드만 제한에 걸린다.
     */
    it('무거운 주제가 앞에 몰려 있어도 샤드에 흩어진다', () => {
        const heavyFirst = ['무거움1', '무거움2', '무거움3', '무거움4', '가벼움1', '가벼움2', '가벼움3', '가벼움4'];
        const shard0 = shardTopics(heavyFirst, 0, 4);
        // 뭉텅이로 잘랐다면 shard0 이 무거운 것만 둘 갖는다.
        expect(shard0).toEqual(['무거움1', '가벼움1']);
    });

    it('샤드가 하나면 전부 한 샤드에 들어간다', () => {
        expect(shardTopics(topics, 0, 1)).toEqual(topics);
    });

    it('주제보다 샤드가 많으면 빈 샤드가 생기고 죽지 않는다', () => {
        expect(shardTopics(['가', '나'], 3, 5)).toEqual([]);
    });

    it('범위를 벗어난 샤드 번호는 조용히 넘어가지 않고 던진다', () => {
        expect(() => shardTopics(topics, 4, 4)).toThrow();
        expect(() => shardTopics(topics, -1, 4)).toThrow();
        expect(() => shardTopics(topics, 0, 0)).toThrow();
    });

    it('원본 배열을 건드리지 않는다', () => {
        const original = [...topics];
        shardTopics(topics, 1, 3);
        expect(topics).toEqual(original);
    });
});

describe('샤드 결과 합치기', () => {
    function writeShard(dir: string, name: string, payload: unknown): string {
        const file = path.join(dir, name);
        fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
        return file;
    }

    function tempDir(): string {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'shard-merge-'));
    }

    it('서로 다른 주제를 하나의 topics 로 합친다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            filters: { minWords: 3, minVolume: 500 },
            starvedTopics: ['게임'],
            report: [{ topic: '영화', rows: 12 }],
            topics: { 영화: [{ keyword: '영화 쿠키영상' }] },
        });
        const b = writeShard(dir, 'b.json', {
            filters: { minWords: 3, minVolume: 500 },
            starvedTopics: ['스포츠'],
            report: [{ topic: '음악', rows: 9 }],
            topics: { 음악: [{ keyword: '음악 추천' }] },
        });

        const merged = mergeCandidateFiles([a, b]);
        expect(Object.keys(merged.topics).sort()).toEqual(['영화', '음악']);
        expect(merged.topics['영화']).toHaveLength(1);
        expect(merged.report).toHaveLength(2);
    });

    it('굶은 주제를 중복 없이 합친다 — 트림의 예외 목록이라 중복되면 안 된다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', { starvedTopics: ['게임', '스포츠'], topics: {}, report: [] });
        const b = writeShard(dir, 'b.json', { starvedTopics: ['스포츠', '사진'], topics: {}, report: [] });
        const merged = mergeCandidateFiles([a, b]);
        expect([...merged.starvedTopics].sort()).toEqual(['게임', '사진', '스포츠']);
    });

    /*
     * 샤드는 서로 다른 주제를 맡으므로 보통 겹치지 않는다. 그래도 겹쳤을 때
     * 한쪽을 버리면 **조용히** 후보가 준다. 합치고 키워드로 중복만 없앤다.
     */
    it('같은 주제가 두 샤드에 있으면 행을 합치고 같은 키워드만 하나로 줄인다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            topics: { 영화: [{ keyword: '가' }, { keyword: '나' }] }, report: [], starvedTopics: [],
        });
        const b = writeShard(dir, 'b.json', {
            topics: { 영화: [{ keyword: '나' }, { keyword: '다' }] }, report: [], starvedTopics: [],
        });
        const merged = mergeCandidateFiles([a, b]);
        expect(merged.topics['영화'].map((r: { keyword: string }) => r.keyword)).toEqual(['가', '나', '다']);
    });

    /*
     * 이게 이 파일에서 제일 중요한 테스트다. 샤드 하나가 러너 플레이크로 죽어도
     * 나머지 3개가 판 것을 발행해야 한다 — 부분 보드가 빈손보다 낫다는 방침 그대로다.
     */
    it('없는 샤드 파일은 건너뛰고 나머지로 합친다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            topics: { 영화: [{ keyword: '가' }] }, report: [], starvedTopics: [],
        });
        const merged = mergeCandidateFiles([a, path.join(dir, '없는파일.json')]);
        expect(merged.topics['영화']).toHaveLength(1);
        expect(merged.missingShards).toBe(1);
    });

    it('깨진 JSON 샤드도 회차를 죽이지 않는다', () => {
        const dir = tempDir();
        const broken = path.join(dir, 'broken.json');
        fs.writeFileSync(broken, '{ 이건 JSON 이 아니다', 'utf8');
        const ok = writeShard(dir, 'ok.json', {
            topics: { 영화: [{ keyword: '가' }] }, report: [], starvedTopics: [],
        });
        const merged = mergeCandidateFiles([broken, ok]);
        expect(merged.topics['영화']).toHaveLength(1);
        expect(merged.missingShards).toBe(1);
    });

    /*
     * 전멸은 다르다. 빈 candidates.json 을 넘기면 뒤 단계가 정상으로 알고
     * 0행 보드를 발행해 버린다. 여기서 던져야 회차가 빨간불로 남는다.
     */
    it('쓸 수 있는 샤드가 하나도 없으면 던진다', () => {
        const dir = tempDir();
        expect(() => mergeCandidateFiles([path.join(dir, 'x.json'), path.join(dir, 'y.json')])).toThrow();
    });

    /*
     * 샤드가 죽으면 아티팩트 자체가 안 생긴다. 그러면 워크플로의 glob
     * (shards/candidates-shard-*.json) 이 그 파일을 애초에 안 넘겨서, 파일 목록만
     * 세면 "다 왔다" 로 보인다 — 주제 8개가 통째로 빠졌는데 경고도 안 뜬다.
     * 그래서 몇 개를 기대하는지 밖에서 알려 준다.
     */
    it('기대한 샤드 수보다 적게 오면 누락으로 센다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            topics: { 영화: [{ keyword: '가' }] }, report: [], starvedTopics: [],
        });
        const merged = mergeCandidateFiles([a], { expect: 4 });
        expect(merged.missingShards).toBe(3);
        expect(merged.shardsMerged).toBe(1);
    });

    it('기대 수를 안 주면 넘긴 파일 수만 기준으로 센다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            topics: { 영화: [{ keyword: '가' }] }, report: [], starvedTopics: [],
        });
        expect(mergeCandidateFiles([a]).missingShards).toBe(0);
    });

    it('filters 는 살아남은 첫 샤드 것을 쓴다 — 뒤 단계가 하한을 읽는다', () => {
        const dir = tempDir();
        const a = writeShard(dir, 'a.json', {
            filters: { minWords: 3, minVolume: 500 }, topics: { 가: [{ keyword: 'k' }] }, report: [], starvedTopics: [],
        });
        const merged = mergeCandidateFiles([a]);
        expect(merged.filters).toEqual({ minWords: 3, minVolume: 500 });
    });
});
