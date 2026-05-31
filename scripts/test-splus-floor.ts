/**
 * 🏆 S+ 모드 최소 10개 보장 검증 (프론트 strict-mode 파이프라인 충실 재현)
 *
 * 가치등급 "S+ (끝판왕)" 선택(minQuality=90, strictSPlusMode) 시 최종 ≥10개 노출 검증.
 * 라이브 Electron IPC는 직접 못 돌리므로, huntNaverHomeKeywords의 결정론적 필터 로직을
 * 동일하게 재현 + 현실적(일부 kill 포함) 실측 데이터로 stress.
 */

import { verifyKeywordValue, VERIFIED_BUILTIN_HOME_SEEDS } from '../src/utils/pro-hunter-v12/keyword-value-verifier';
import { calculateHomeScore } from '../src/utils/pro-hunter-v12/naver-home-score-engine';

function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
}

// 트렌딩/짧은 노이즈 시드 (실측 시 대부분 kill — 풀 오염 시뮬)
const NOISE_SEEDS = [
    '날씨', '환율', '주가', '로또', '코스피', '비트코인', '강남 맛집', '서울 날씨',
    '오늘 운세', '주식 시세', '연예 뉴스', '실시간 검색어', '핫이슈', '속보', '단독',
    '게임 순위', '영화 순위', '드라마 추천', '웹툰 추천', '노래 추천', '유튜브 추천',
    '인스타 감성', '챌린지', '밈', '짤', '레전드', '클립', '쇼츠', '브이로그', '먹방',
    '카페', '맛집', '여행', '운동', '다이어트', '레시피', '인테리어', '청소', '정리', '수납',
];

// 결정론적 현실 실측 데이터: 일부는 sv<100(kill) / 일부는 ratio fail(kill)
function simMeasured(kw: string, adversarial: boolean): { sv: number; dc: number; vacancy: number } {
    const h = hash(kw);
    // 노이즈/짧은 키워드는 sv 낮거나 dc 폭증(ratio fail) 경향
    const isShort = kw.split(/\s+/).length <= 2;
    // 현실적 홈판(인기 대중) 키워드: sv 측정됨, dc는 매우 큼(5k~200k) → ratio 대부분 미달
    let sv = 150 + (h % 2350);                    // 150~2499
    if (adversarial && (h % 3 === 0)) sv = 30 + (h % 90); // ~33% sv<100 → kill (실측 실패/롱테일)
    let dc = 5000 + (h % 195000);                 // 5k~200k (인기 키워드 = 고경쟁 = ratio 미달)
    if (isShort) dc = 100000 + (h % 100000);       // 짧은 키워드는 더 과열
    // 빅도메인 독점: adversarial 시 ~30% vacancy<3 (valuableOnly에서 컷, 단 strict topup은 우회)
    let vacancy = 3 + (h % 6);                    // 3~8
    if (adversarial && (h % 10 < 3)) vacancy = h % 3; // 0~2
    return { sv, dc, vacancy };
}

// ── 프론트 huntNaverHomeKeywords strict 필터 로직 재현 ──
function runStrictPipeline(pool: string[], opts: {
    minQuality: number; minScore: number; minResults: number;
    blockInfluencer: boolean; requireVacancy: boolean; adversarial: boolean;
}) {
    const strictSPlusMode = opts.minQuality >= 90;

    const enriched = pool.map(kw => {
        const { sv, dc, vacancy } = simMeasured(kw, opts.adversarial);
        const vg = verifyKeywordValue({ keyword: kw, searchVolume: sv, documentCount: dc, mode: 'lenient' });
        const hs = calculateHomeScore({
            keyword: kw, searchVolume: sv, documentCount: dc,
            titleCtrScore: 55 + (hash(kw) % 35), keywordCategory: 'general',
            influencerCount: hash(kw) % 3, vacancySlots: vacancy,
            daysSinceFirstAppear: hash(kw) % 30, surgeRatio: 1 + (hash(kw) % 30) / 10,
            blogPublishCount24h: hash(kw) % 50,
        });
        return {
            keyword: kw, searchVolume: sv, documentCount: dc,
            vacancy: { vacancySlots: vacancy, influencerCount: hash(kw) % 3 },
            bestTitle: { ctrScore: 55 + (hash(kw) % 35) },
            valueGate: vg, homeScore: { homeScore: hs.homeScore, grade: hs.grade },
        };
    });

    const allSorted = enriched.filter(x => x.homeScore)
        .sort((a, b) => (b.homeScore.homeScore || 0) - (a.homeScore.homeScore || 0));

    const valuableOnly = allSorted.filter(x => {
        if (!x.valueGate) return false;
        if (x.valueGate.isKilled) return false;
        if ((x.valueGate.qualityScore || 0) < opts.minQuality) return false;
        if (x.vacancy && typeof x.vacancy.vacancySlots === 'number' && x.vacancy.vacancySlots < 3) return false;
        if (!x.homeScore || (x.homeScore.homeScore || 0) < 25) return false;
        return true;
    });

    let passed = valuableOnly.filter(x => (x.homeScore.homeScore || 0) >= opts.minScore);
    if (opts.blockInfluencer) passed = passed.filter(x => !x.vacancy || x.vacancy.influencerCount <= 1);
    if (opts.requireVacancy) passed = passed.filter(x => x.vacancy && x.vacancy.vacancySlots >= 5);

    let filtered = [...passed];
    const passedSet = new Set(passed.map(p => p.keyword));
    if (filtered.length < opts.minResults) {
        const need = opts.minResults - filtered.length;
        const candidates = valuableOnly.filter(x => !passedSet.has(x.keyword));
        filtered = [...filtered, ...candidates.slice(0, need)];
    }

    const candidateRankScore = (c: any) => {
        const hs = c.homeScore?.homeScore || 0;
        const quality = c.valueGate?.qualityScore || 0;
        const vacancy = c.vacancy?.vacancySlots ?? 0;
        const title = c.bestTitle?.ctrScore || 0;
        const hasVolume = (c.searchVolume || 0) > 0 ? 10 : 0;
        const killedPenalty = c.valueGate?.isKilled ? 180 : 0;
        return hs * 4 + quality * 1.2 + vacancy * 18 + title * 0.6 + hasVolume - killedPenalty;
    };
    // strict topup (qualityScore >= minQuality)
    if (strictSPlusMode && filtered.length < opts.minResults) {
        const have = new Set(filtered.map(x => x.keyword));
        const need = opts.minResults - filtered.length;
        const sPlusPool = enriched
            .filter(x => x.keyword && !have.has(x.keyword))
            .filter(x => x.valueGate && !x.valueGate.isKilled && (x.valueGate.qualityScore || 0) >= opts.minQuality)
            .sort((a, b) => candidateRankScore(b) - candidateRankScore(a));
        filtered.push(...sPlusPool.slice(0, need));
    }

    const sPlusGrade = filtered.filter(x => x.valueGate?.valueGrade === 'S+').length;
    return { total: enriched.length, sPlusAvailable: enriched.filter(x => !x.valueGate.isKilled && x.valueGate.qualityScore >= opts.minQuality).length, finalOutput: filtered.length, sPlusGrade, killed: enriched.filter(x => x.valueGate.isKilled).length };
}

function main() {
    const pool = Array.from(new Set([...VERIFIED_BUILTIN_HOME_SEEDS, ...NOISE_SEEDS]));
    console.log(`\n${'═'.repeat(72)}`);
    console.log(`🏆 S+ 모드 최소 10개 보장 검증 — 풀 ${pool.length}개 (검증시드 + 노이즈 ${NOISE_SEEDS.length})`);
    console.log(`${'═'.repeat(72)}`);

    for (const minQuality of [92, 90]) {
        console.log(`\n──── minQuality=${minQuality} ${minQuality === 92 ? '(기존: 11/11 완벽 요구)' : '(수정: 10/11 슬랙 허용)'} ────`);
        for (const adversarial of [false, true]) {
            const r = runStrictPipeline(pool, {
                minQuality, minScore: 50, minResults: 30,
                blockInfluencer: false, requireVacancy: false, adversarial,
            });
            const label = adversarial ? '🔴 ADVERSARIAL (20% sv부족 + 25% ratio위험)' : '🟢 정상 실측';
            console.log(`   ${label}: kill ${r.killed}/${r.total} · S+후보 ${r.sPlusAvailable} · 최종출력 ${r.finalOutput} · S+등급 ${r.sPlusGrade}  ${r.finalOutput >= 10 ? '✅≥10' : '🚨<10'}`);
        }
    }
    console.log(`\n${'═'.repeat(72)}\n`);
}

main();
