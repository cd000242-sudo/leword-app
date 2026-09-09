#!/usr/bin/env node
/**
 * 제휴 황금키워드 — 자리 실측 + 글감 브리프 덧붙이기 (사장님 2026-09-09: "작성하면 노출될 확률이 높아야").
 *
 * 수집기(affiliate-refresh.js, 다른 에이전트 소관)가 낸 사이트 스냅샷을 **읽어서 덧붙이기만** 한다. 수집기 파일은 안 건드린다.
 *   상품마다 후보 검색어(니즈 검색어 → 상품명 검색어)의 블로그탭을 내 크로미엄으로 실제로 받아 자리(빈자리·정면 글)를 재고,
 *   자리가 열린 상품에는 실측 수치 + 그 검색어 뉴스 카드 안에서만 쓴 글감 브리프를 붙인다.
 *   item.seat = { keyword, openSlot, facing, verdict, measuredAt } · item.brief = keyword-brief
 *
 *   node scripts/affiliate-enrich.js --in=<site>/spa/public/data/affiliate-campaigns.json [--out=같은 파일] [--maxSeat=120] [--maxAi=30] [--noBrief]
 * 수집기가 스냅샷을 새로 내면 이 필드는 사라진다 — 그때 다시 돌린다(멱등: 같은 상품·같은 검색어면 같은 자리).
 */
require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { measureSeat, seatBlogTabUrl } = require('../src/utils/seat-measure');
const { localSerpFetch, closeLocalSerpFetch } = require('../src/utils/local-serp-fetch');
const { toFactCards, kstToday } = require('../src/utils/topic-briefs');
const { buildKeywordBriefPrompt, validateKeywordBrief } = require('../src/utils/keyword-brief');
const { naverApiFetch } = require('../src/utils/naver-api-hub');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

const arg = (name, fallback = '') => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: 'opus' }) },
  { provider: 'codex', run: runCodex },
];

/** 자리 판정 순위 — 열림이 제일 좋다. */
const VERDICT_RANK = { '열림': 0, '반열림': 1, '자료없음': 2, '잠김': 3, '카드답': 4 };

async function main() {
  const inPath = path.resolve(arg('in'));
  if (!arg('in') || !fs.existsSync(inPath)) { console.error('--in=<affiliate-campaigns.json> 이 필요합니다.'); process.exit(2); }
  const outPath = path.resolve(arg('out', inPath));
  const maxSeat = Number(arg('maxSeat')) || 120;
  const maxAi = Number(arg('maxAi')) || 30;
  const wantBrief = !has('noBrief');
  const today = kstToday();

  const snapshot = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const sites = snapshot.sites || {};
  const items = Object.values(sites).flatMap((s) => (s && Array.isArray(s.items) ? s.items : []));

  const manager = typeof EnvironmentManager.getInstance === 'function' ? EnvironmentManager.getInstance() : new EnvironmentManager();
  const cfg = manager.getConfig();
  const openApi = { clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '', clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '' };

  /*
   * 0) 검색어가 없는 상품에 검색어를 붙인다(--deriveMissing, 사장님 2026-09-09 "초보자들이 뭘 적어야 될지 모르는데").
   * 수집기는 상품당 24개까지만 검색어를 뽑아 토스 126 중 111 이 빈 채였다. 상품명에서 씨앗(수량·단위·브랜드 꼬리를 뺀
   * 앞 두세 어절, 검색광고 힌트 한도 15자)을 만들고, 검색광고 연관어 중 같은 주제·검색량 100+ 를 니즈 검색어로 삼아
   * 검색량·블로그 문서수를 실측한다. 전부 실측이고 추정은 없다.
   */
  const adConfig = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
  const seedOf = (name) => {
    const cleaned = String(name || '')
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|리터|개|개입|팩|봉|박스|세트|매|장|정|캡슐|포|병|캔|입|p|ea|호|인용|인분|과|미|마리|롤|통|스틱)\b/gi, ' ')
      .replace(/\b\d+(?:\.\d+)?(?:kg|g|ml|l)\b/gi, ' ')
      .replace(/[,·+/×x]|\d+\s*[x×]\s*\d+/g, ' ')
      .replace(/\s+/g, ' ').trim();
    /*
     * 상품명에 흔한 수식어·색·치수는 품목이 아니다 — 3차 실주행에서 '가정용'(문서 795만)·'내외'·'무라벨'·'퓨어'·'컴팩트'가
     * 씨앗이 됐다. 목록은 실측한 상품명에서 모은 것이고, 여기 없는 말은 남긴다(품목일 수 있다).
     */
    const STOP = new Set(['가정용', '업소용', '내외', '무라벨', '퓨어', '컴팩트', '프리미엄', '대용량', '소용량', '세트', '기획', '실속', '벌크', '정품', '신형', '구형',
      '국내산', '국산', '수입', '미니', '라이트', '플러스', '오리지널', '스탠다드', '클래식', '베이직', '기본', '특대', '대', '중', '소', '사이즈', '전연령', '혼합', '모음',
      '블랙', '화이트', '그레이', '라이트그레이', '네이비', '베이지', '와인', '핑크', '브라운', '레드', '블루', '그린', '옐로우', '아이보리', '차콜', '카키',
      'free', 'xl', 'xxl', '2x', '3x', '원데이', '더', '신', '왕', '순', '생', '냉동', '냉장', '추가', '증정', '택1', '선택', '랜덤', '개입',
      '퍼플', '오렌지', '민트', '레몬', '맛혼합', '혼합맛', '다크그레이', '스카이', '실버', '골드', '로즈']);
    // '5가지맛'·'3종세트' 같은 구성 표기도 품목이 아니다(5차 실주행 '5가지맛' 문서 1,648만).
    const tokens = cleaned.split(' ').filter((t) => t && !/^\d+$/.test(t) && !/^[A-Za-z0-9-]{4,}$/.test(t) && !STOP.has(t.toLowerCase()) && !/^\d+[a-zA-Z가-힣]{0,2}$/.test(t) && !/^\d+(?:가지|종|가지맛|종세트|팩입|개세트)/.test(t)); // 모델명(영숫자 4+)·수식어·색·치수·구성 표기 제외
    // 자르지 않고 전부 돌려준다 — 후보(뒤 두 어절·뒤 한 어절·앞 두 어절·앞 한 어절)를 만들 때 15자를 본다.
    // 4차 실주행: 앞에서 3어절로 자르니 '코코에르 뽀송 에어'가 남고 품목 '바디 드라이어'가 잘려 나갔다.
    return tokens.join(' ');
  };
  const tokensOf = (s) => String(s || '').toLowerCase().split(/[\s·,/()\-]+/).map((t) => t.replace(/[^0-9a-z가-힣]/g, '')).filter((t) => t.length >= 2);
  if (has('deriveMissing') && adConfig.accessLicense && adConfig.secretKey) {
    const { getNaverSearchAdKeywordSuggestions, getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
    const { getNaverBlogDocumentCount } = require('../src/utils/naver-blog-api');
    const missing = items.filter((it) => !it.needKeyword && !it.keyword);
    console.log(`검색어 붙이기 — 대상 ${missing.length}`);
    let derived = 0;
    for (const item of missing) {
      const fullSeed = seedOf(item.name);
      if (fullSeed.length < 2) continue;
      /*
       * 씨앗 후보 순서 — **품목 명사구가 먼저, 브랜드는 나중**(첫 실주행: 앞 어절부터 줄이니 '더'·'미생물'·'하림펫푸드'
       * 같은 브랜드·조사가 씨앗이 되고 니즈가 0건이었다). "굿프렌드 굿핏 공기압 프리미엄 다리 마사지기" 라면
       * '다리 마사지기' → '마사지기' → '굿프렌드 굿핏' → '굿프렌드' 순. 연관어가 잡히는 첫 씨앗에서 멈춘다.
       * 연관어는 띄어쓰기 없이 오기도 해서 토큰 일치가 아니라 **포함**으로 본다.
       */
      // 짧은 라틴 토큰(CAT·No·DOG)은 후보에서 뺀다 — 'CAT' 이 씨앗이 되어 'CATERPILLAR' 가 니즈로 붙었다(4차 실주행).
      const words = fullSeed.split(' ').filter((w) => w.length >= 2 && !/^[A-Za-z]{1,3}$/.test(w));
      const seedCandidates = [...new Set([
        words.slice(-2).join(' '), words.slice(-1).join(' '), words.slice(0, 2).join(' '), words[0] || '',
      ].filter((s) => s && s.replace(/\s+/g, '').length >= 2 && s.replace(/\s+/g, '').length <= 15))];
      const norm = (k) => String(k || '').replace(/\s+/g, '').toLowerCase();
      const volumeOf = async (kw) => {
        try {
          const v = await getNaverSearchAdKeywordVolume(adConfig, [kw]);
          const row = (v || []).find((x) => norm(x.keyword) === norm(kw));
          return row && typeof row.totalSearchVolume === 'number' ? row.totalSearchVolume : null;
        } catch { return null; }
      };
      /*
       * 후보마다: 연관어(머리 명사 포함, 2차 실주행 교훈 — '공기압'만 맞으면 '타이어공기압', '라이트'면 'UV라이트'가 붙는다)
       * → 없으면 후보 자신의 검색량이 100+ 면 후보가 니즈. 검색광고는 몰아 부르면 429 라 호출마다 1.2초 쉰다.
       */
      let seed = seedCandidates[0] || fullSeed;
      let seedVolume = null;
      let pool = [];
      for (const cand of seedCandidates) {
        seed = cand;
        const head = norm(cand.split(' ').slice(-1)[0]); // 머리 명사(마지막 어절)
        const headIsKorean = /[가-힣]/.test(head);
        let suggestions = [];
        for (let attempt = 0; attempt < 2 && suggestions.length === 0; attempt += 1) {
          try { suggestions = await getNaverSearchAdKeywordSuggestions(adConfig, cand, 80); } catch { suggestions = []; }
          await sleep(attempt === 0 ? 1500 : 3000); // 몰아 부르면 429 — 비면 한 번 더
        }
        pool = suggestions
          .filter((s) => typeof s.totalSearchVolume === 'number' && s.totalSearchVolume >= 100 && norm(s.keyword).length <= 20 && head.length >= 2
            // 한글 머리는 포함으로, 라틴 머리는 통째 일치로(부분 일치는 딴 말을 부른다)
            && (headIsKorean ? norm(s.keyword).includes(head) : norm(s.keyword) === head))
          .sort((a, b) => b.totalSearchVolume - a.totalSearchVolume);
        seedVolume = await volumeOf(cand);
        await sleep(1500);
        if (pool.length > 0 || (typeof seedVolume === 'number' && seedVolume >= 100)) break;
      }
      // 연관어에 없으면 씨앗 자신이 니즈다('깻잎무침'·'배수구 냄새 제거제' — 연관어는 딴 말만 주는데 씨앗엔 검색량이 있다).
      const need = pool[0] || (typeof seedVolume === 'number' && seedVolume >= 100 ? { keyword: seed, totalSearchVolume: seedVolume } : null);
      item.keyword = seed;
      item.searchVolume = seedVolume;
      if (need) {
        item.needKeyword = need.keyword;
        item.needVolume = need.totalSearchVolume;
        try { item.needDocs = await getNaverBlogDocumentCount(need.keyword, { config: openApi }); } catch { item.needDocs = null; }
        item.needRatio = typeof item.needDocs === 'number' && item.needDocs > 0 ? Number((need.totalSearchVolume / item.needDocs).toFixed(3)) : null;
      }
      try { item.documentCount = await getNaverBlogDocumentCount(seed, { config: openApi }); } catch { item.documentCount = null; }
      item.derivedAt = new Date().toISOString();
      derived += 1;
      console.log(`  + ${item.name.slice(0, 28)} → 씨앗 "${seed}"(${seedVolume ?? '<10'}) · 니즈 "${need ? need.keyword : '없음'}"${need ? `(${need.totalSearchVolume}, 문서 ${item.needDocs ?? '?'})` : ''}`);
      await sleep(350);
      fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
    }
    console.log(`  검색어 붙임 ${derived}/${missing.length}`);
  }

  // 1) 자리 실측 — 후보 검색어(니즈 → 상품명)마다 블로그탭을 받아 잰다. 같은 검색어는 한 번만.
  const candidatesOf = (item) => [...new Set([item.needKeyword, item.keyword].map((k) => String(k || '').trim()).filter((k) => k.length >= 2))];
  const targets = items.filter((item) => candidatesOf(item).length > 0);
  console.log(`제휴 자리 실측 — 상품 ${items.length} · 검색어 있는 상품 ${targets.length} · 상한 ${maxSeat}`);
  const seatCache = new Map();
  let fetched = 0;
  const measureKeyword = async (keyword) => {
    if (seatCache.has(keyword)) return seatCache.get(keyword);
    if (fetched >= maxSeat) return null;
    fetched += 1;
    const res = await localSerpFetch(seatBlogTabUrl(keyword));
    if (!res.ok) { seatCache.set(keyword, null); return null; }
    const seat = measureSeat({ keyword, blogTabHtml: res.body, allTabHtml: null });
    const out = seat.sampled >= 3 ? { keyword, openSlot: seat.vacancy, facing: seat.facing, verdict: seat.verdict, sampled: seat.sampled, measuredAt: new Date().toISOString() } : null;
    seatCache.set(keyword, out);
    return out;
  };
  let seated = 0;
  for (const item of targets) {
    const measured = [];
    for (const k of candidatesOf(item)) { const s = await measureKeyword(k); if (s) measured.push(s); }
    if (measured.length === 0) continue;
    measured.sort((a, b) => (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9) || (a.facing ?? 99) - (b.facing ?? 99));
    item.seat = measured[0];
    seated += 1;
  }
  await closeLocalSerpFetch();
  const byVerdict = targets.reduce((m, it) => { if (it.seat) m[it.seat.verdict] = (m[it.seat.verdict] || 0) + 1; return m; }, {});
  console.log(`  자리 실측 ${seated}/${targets.length} (블로그탭 ${fetched}회) · ${Object.entries(byVerdict).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

  // 2) 글감 브리프 — 자리가 열린(열림·반열림) 상품만, 실측 수치 + 뉴스 카드 안에서
  if (!wantBrief) { console.log('끝 — 브리프 생략(--noBrief)'); process.exit(0); }
  const newsFacts = async (keyword) => {
    if (!openApi.clientId) return [];
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=20&sort=date`;
    try {
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret } });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return toFactCards((data && data.items) || [], '제휴').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 10);
    } catch { return []; }
  };
  // --briefAll: 자리가 잠긴 상품에도 붙인다(사장님 2026-09-09 "초보자들이 뭘 적어야 될지 모르는데") — 브리프의 '차별화'가 우회 각도를 준다.
  const briefTargets = targets.filter((it) => it.seat && (has('briefAll') || it.seat.verdict === '열림' || it.seat.verdict === '반열림') && !(it.brief && it.brief.builtAt && Date.now() - new Date(it.brief.builtAt).getTime() < 7 * 24 * 3600 * 1000))
    .sort((a, b) => ({ '열림': 0, '반열림': 1 }[a.seat.verdict] ?? 2) - ({ '열림': 0, '반열림': 1 }[b.seat.verdict] ?? 2))
    .slice(0, maxAi);
  console.log(`  브리프 대상 ${briefTargets.length} (${has('briefAll') ? '자리 잰 상품 전부' : '자리 열림·반열림'}, 상한 ${maxAi})`);
  snapshot.enrichedAt = new Date().toISOString();
  let done = 0; let failed = 0;
  for (const item of briefTargets) {
    const kw = item.seat.keyword;
    const isNeed = kw === item.needKeyword;
    const row = {
      keyword: kw,
      topic: '제휴',
      searchVolume: isNeed ? item.needVolume : item.searchVolume,
      documentCount: isNeed ? item.needDocs : item.documentCount,
      openSlot: item.seat.openSlot,
      serp: { exactTitleHits: item.seat.facing },
      evidence: [
        { code: 'product', text: `제휴 상품: ${item.name}${item.brand ? ` (${item.brand})` : ''}${item.price ? ` · 가격 ${item.price}` : ''}` },
        ...(item.reward ? [{ code: 'reward', text: `제휴 보상: ${item.reward}` }] : []),
        ...(typeof item.perSaleWon === 'number' && item.perSaleWon > 0 ? [{ code: 'per-sale', text: `건당 수익 약 ${item.perSaleWon.toLocaleString('ko-KR')}원(가격×수수료율 단순 산술)` }] : []),
      ],
    };
    const facts = await newsFacts(kw);
    const prompt = buildKeywordBriefPrompt(row, facts, today)
      + '\n\n이 글감은 제휴 상품 글이다: 글 안에서 위 제휴 상품을 자연스럽게 다루되, 검색하는 사람의 질문(비교·선택 기준·사용법)에 먼저 답하는 구조여야 한다. angle 에 그 연결을 한 문장으로 적어라.'
      + (item.seat.verdict === '잠김' ? '\n자리가 잠긴 검색어다(상위 10 이 정면 글로 찼다). differentiation 과 angle 은 정면 승부가 아니라 초보 블로그가 비집을 좁은 각도(대상·상황·조건을 붙인 제목)를 구체적으로 제시하라.' : '');
    let reply = '';
    try { reply = (await runWithAnyAgent(prompt, AGENT_CHAIN, { timeoutMs: 150_000 })).reply; } catch (error) { failed += 1; console.log(`  ✗ ${kw} — 에이전트 ${String((error && error.message) || error).slice(0, 60)}`); continue; }
    const { ok, reason } = validateKeywordBrief(tryExtractJson(reply), row, facts, today);
    if (!ok) { failed += 1; console.log(`  ✗ ${kw} — ${reason}`); continue; }
    item.brief = ok;
    done += 1;
    console.log(`  ✓ ${kw} [${ok.timing}] ${item.name.slice(0, 24)} — ${ok.angle.slice(0, 50)}`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  }
  console.log(`끝 — 자리 ${seated} · 브리프 ${done} · 실패 ${failed} → ${outPath}`);
  process.exit(0);
}

main().catch((error) => { console.error(`제휴 보강 실패: ${error && error.stack ? error.stack : error}`); process.exit(1); });
