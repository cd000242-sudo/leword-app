'use strict';

/**
 * 선점 후보 발굴을 여러 러너로 쪼개고 다시 합친다.
 *
 * 왜 쪼개나 — 2026-09-07 첫 32주제 회차(34095577375) 실측:
 *
 *   npm ci            4분 53초
 *   후보 발굴       2시간 56분   ← 자동완성 10,608회가 그중 2시간 49분
 *   자리 판정(BD)     37분 23초
 *   에이전트 보강     32분 03초
 *   ─────────────────────────
 *   회차 전체       4시간 11분   (잡 제한 300분 — 남은 여유 49분)
 *
 * 공급을 늘리려면 표본(sampleCap)을 늘려야 한다. 같은 회차 실측에서 자동완성이
 * 만든 문장은 197,889개인데 검색량을 재 본 것은 19,200개(9.7%)뿐이었다.
 * 나머지 90%는 **이미 만들어 놓고 쳐다보지도 않고 버린 것**이다.
 *
 * 그런데 한 잡에서 표본을 늘리면 300분 제한에 걸려 회차 전체가 0행으로 죽는다.
 * 러너를 나누면 러너당 IP 요청 속도는 그대로(politeness 유지) 벽시계만 1/N 이
 * 된다. 네이버에 더 세게 두드리지 않으면서 시간만 버는 방법이다.
 *
 * 이 모듈은 두 조각만 갖는다. 둘 다 순수 함수라 테스트로 잠근다
 * (src/utils/__tests__/preemption-candidate-shards.test.ts).
 */

const fs = require('fs');
const path = require('path');

/**
 * 주제 목록을 라운드로빈으로 N등분한다.
 *
 * 라운드로빈인 이유: 주제별 소요가 17배까지 벌어진다(실측 문학·책 2,657초 ·
 * 게임 150초). 앞에서부터 뭉텅이로 자르면 무거운 주제가 한 샤드에 몰려
 * 그 샤드만 제한에 걸리고, 그 샤드가 맡은 주제는 통째로 0행이 된다.
 *
 * @param {string[]} topics 전체 주제
 * @param {number} shard 0부터 shards-1
 * @param {number} shards 총 샤드 수
 * @returns {string[]} 이 샤드가 맡을 주제
 */
function shardTopics(topics, shard, shards) {
    const total = Number(shards);
    const index = Number(shard);
    if (!Number.isInteger(total) || total < 1) {
        throw new Error(`샤드 수가 잘못됐다: ${shards}`);
    }
    if (!Number.isInteger(index) || index < 0 || index >= total) {
        throw new Error(`샤드 번호가 범위를 벗어났다: ${shard} (0~${total - 1})`);
    }
    return (Array.isArray(topics) ? topics : []).filter((_, i) => i % total === index);
}

/** 샤드 파일 하나를 읽는다. 못 읽으면 null — 회차를 죽이지 않는다. */
function readShard(file) {
    try {
        const raw = fs.readFileSync(path.resolve(file), 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (error) {
        console.log(`  샤드 건너뜀 ${file} — ${String((error && error.message) || error).slice(0, 100)}`);
        return null;
    }
}

/**
 * 샤드 결과를 하나의 candidates.json 모양으로 합친다.
 *
 * 샤드는 서로 다른 주제를 맡으므로 보통 겹치지 않는다. 그래도 겹쳤을 때
 * 한쪽을 버리면 조용히 후보가 주므로, 합치고 키워드로 중복만 없앤다.
 *
 * 샤드 하나가 러너 플레이크로 죽어도 나머지로 발행한다 — "부분 보드 > 빈손"
 * 방침 그대로다. 다만 **전멸**이면 던진다. 빈 파일을 넘기면 뒤 단계가 정상으로
 * 알고 0행 보드를 발행해 버려서, 회차가 초록불로 남고 아무도 모른다.
 *
 * @param {string[]} files 샤드 파일 경로
 * @param {{expect?: number}} [options] `expect` 는 원래 몇 개가 와야 하는지.
 *   샤드가 죽으면 아티팩트가 아예 안 생겨서, 워크플로의 glob 이 그 파일을
 *   애초에 안 넘긴다 — 파일 목록만 세면 "다 왔다" 로 보이고 주제 8개가
 *   조용히 빠진다. 그래서 기대 수를 밖에서 받아 누락을 드러낸다.
 */
function mergeCandidateFiles(files, options = {}) {
    const loaded = (Array.isArray(files) ? files : []).map((file) => ({ file, data: readShard(file) }));
    const alive = loaded.filter((entry) => entry.data !== null);
    const expected = Number(options.expect) > 0 ? Number(options.expect) : loaded.length;
    const missingShards = Math.max(expected, loaded.length) - alive.length;

    if (alive.length === 0) {
        throw new Error(`쓸 수 있는 샤드가 하나도 없다 (${loaded.length}개 시도). 회차를 빨간불로 남긴다.`);
    }

    const topics = {};
    for (const { data } of alive) {
        const shardTopicMap = (data.topics && typeof data.topics === 'object') ? data.topics : {};
        for (const [topic, rows] of Object.entries(shardTopicMap)) {
            const list = Array.isArray(rows) ? rows : [];
            const previous = topics[topic] || [];
            const seen = new Set(previous.map((row) => row && row.keyword));
            topics[topic] = [...previous, ...list.filter((row) => {
                const keyword = row && row.keyword;
                if (!keyword || seen.has(keyword)) return false;
                seen.add(keyword);
                return true;
            })];
        }
    }

    const starvedTopics = [...new Set(alive.flatMap(({ data }) => (
        Array.isArray(data.starvedTopics) ? data.starvedTopics : []
    )))];

    const report = alive.flatMap(({ data }) => (Array.isArray(data.report) ? data.report : []));
    const filters = alive.map(({ data }) => data.filters).find((value) => value && typeof value === 'object') || {};

    return {
        generatedAt: new Date().toISOString(),
        filters,
        starvedTopics,
        report,
        topics,
        shardsMerged: alive.length,
        missingShards,
    };
}

module.exports = { shardTopics, mergeCandidateFiles };

// ── CLI: node scripts/candidate-shards.js --out=candidates.json a.json b.json ──
if (require.main === module) {
    const args = process.argv.slice(2);
    const outArg = args.find((a) => a.startsWith('--out='));
    const outPath = outArg ? outArg.slice('--out='.length) : 'candidates.json';
    const expectArg = args.find((a) => a.startsWith('--expect='));
    const expect = expectArg ? Number(expectArg.slice('--expect='.length)) : 0;
    const inputs = args.filter((a) => !a.startsWith('--'));

    if (inputs.length === 0) {
        console.error('합칠 샤드 파일이 없습니다. 예: node scripts/candidate-shards.js --out=c.json shard-*.json');
        process.exit(2);
    }

    try {
        const merged = mergeCandidateFiles(inputs, { expect });
        fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
        fs.writeFileSync(path.resolve(outPath), JSON.stringify(merged, null, 1), 'utf8');

        const total = Object.values(merged.topics).reduce((sum, rows) => sum + rows.length, 0);
        console.log('='.repeat(76));
        console.log(`샤드 합침: ${merged.shardsMerged}개 성공 · ${merged.missingShards}개 누락`);
        console.log(`후보 ${total}건 / 주제 ${Object.keys(merged.topics).length}종 → ${outPath}`);
        if (merged.missingShards > 0) {
            console.log(`::warning::샤드 ${merged.missingShards}개가 비었다 — 그 주제는 이번 회차에 안 실린다.`);
        }
        const perTopic = Object.entries(merged.topics)
            .map(([topic, rows]) => `${topic} ${rows.length}`)
            .join(' · ');
        console.log(`주제별: ${perTopic}`);
        process.exit(0);
    } catch (error) {
        console.error(`샤드 합치기 실패 — ${String((error && error.message) || error)}`);
        process.exit(1);
    }
}
