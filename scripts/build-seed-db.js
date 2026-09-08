#!/usr/bin/env node
/**
 * 씨앗 창고 만들기 — 검색광고 키워드도구가 **공식으로** 내주는 씨앗을 긁어 파일로 둔다.
 *
 * 왜(사장님 2026-09-07 "씨앗은 방대할수록 좋지 않니? 씨앗으로 사용할 수 있는
 * 데이터베이스가 더 있을 텐데"): 그때까지 씨앗은 손으로 적은 상시 어휘 80여 개와
 * 계절 표 200개뿐이었다. 그런데 같은 API 가 씨앗 없이도 대량으로 준다(실측):
 *   month=1~12    월당 1,200개 · 12개월 14,400개  (11월=수능·등급컷, 1월=새해인사말)
 *   event=코드    24개 코드 생존 · 18~1,200개씩   (장마·핫팩·모기·추석·스승의날)
 *   biztpId=업종  1~60 중 57개 생존 · 68,400개    (대출·요양원·결혼·운전면허)
 * 3,000↑ 만 세도 업종에서만 14,592개다.
 *
 * **회차마다 새로 긁지는 않되, 회차마다 확인은 한다.** 한 번 긁는 데 100회 넘는
 * 호출이 들어 발굴 도중에 매번 태우면 CI 시간이 병목이 된다. 그래서 창고를
 * data/seed-db.json 에 두고 발굴은 그 파일만 읽는다.
 * 갱신 주기는 **월·금**(사장님 지시 2026-09-07) — 발굴 회차와 같은 날이다.
 * 창고가 3일보다 오래됐으면 다시 긁는다(--maxAgeDays, 기본 3). 월요일에 긁으면
 * 금요일에 4일째라 다시 긁히고, 금요일에 긁으면 월요일에 3일째라 또 긁힌다.
 * 신선하면 그냥 끝내므로 같은 날 두 번 돌려도 호출을 낭비하지 않는다.
 *
 * 검색량이 이미 붙어 온다 — 발굴 쪽에서 검색량 조회를 한 번 아낄 수 있다.
 *
 * 쓰기:
 *   node scripts/build-seed-db.js                    # 3일 안쪽이면 건너뛴다(월·금 갱신)
 *   node scripts/build-seed-db.js --force            # 무조건 다시 긁는다
 *   node scripts/build-seed-db.js --maxAgeDays=7     # 문턱 조정
 *   node scripts/build-seed-db.js --maxBiztp=60      # 업종 탐색 상한
 *   node scripts/build-seed-db.js --out=경로          # 다른 파일에 쓴다(가짜 fetch 하네스용)
 *
 * 힌트 창구(2026-09-08): 업종 창구는 광고주용이라 영화·드라마·방송·연예 주제가
 * 아예 없다(열 주제가 창고 0개, 실측). hintKeywords=주제 머리말 로 연관어를 받아
 * `hint:주제` 출처로 담는다 — 머리말 표는 src/utils/seed-hints.ts.
 */

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');
const { createHmac } = require('crypto');
const {
  SEED_HINTS, HINT_ROWS_CAP, TITLE_HEAD_QUERIES, TITLE_HEADS_PER_TOPIC,
  hintSourceTag, routeHintRow, titleHeadFitsTopic, preferSource, warehouseNeedsRebuild,
} = require('../src/utils/seed-hints');
const { extractTitleHeads } = require('../src/utils/news-title-heads');
const { BLOG_SECTION_DIRECTORY, blogSectionUrl, parseBlogSectionTitles, extractSectionHeads, sectionSourceTag } = require('../src/utils/blog-section-seeds');

const arg = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : '';
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

// --out 은 하네스용이다 — 가짜 fetch 로 끝까지 돌려 볼 때 진짜 창고를 덮어쓰지 않는다.
const DEST = arg('out') ? path.resolve(arg('out')) : path.join(__dirname, '..', 'data', 'seed-db.json');
const HOST = 'https://api.searchad.naver.com';
const URI = '/keywordstool';

/**
 * 한 요청. 실패는 빈 배열이다 — 한 칸이 비어도 나머지는 긁는다.
 * 429(호출 제한)는 잠깐 쉬고 두 번까지 다시 부른다 — 세 번째 감사에서 머리말 78개를
 * 120ms 간격으로 두드리다 '텃밭' 하나가 429 로 비었다(실측). 머리말이 200개 넘게 늘어
 * 그냥 두면 구멍이 는다.
 */
async function tool(creds, query, attempt = 0) {
  const timestamp = String(Date.now());
  const signature = createHmac('sha256', creds.secretKey)
    .update(`${timestamp}.GET.${URI}`)
    .digest('base64');
  try {
    const response = await fetch(`${HOST}${URI}?${query}`, {
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': creds.accessLicense,
        'X-Signature': signature,
        'X-Customer': String(creds.customerId || ''),
      },
    });
    if (response.status === 429 && attempt < 2) {
      await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
      return tool(creds, query, attempt + 1);
    }
    if (!response.ok) return { ok: false, rows: [], status: response.status };
    const parsed = await response.json().catch(() => null);
    return { ok: true, rows: (parsed && parsed.keywordList) || [], status: 200 };
  } catch (error) {
    return { ok: false, rows: [], status: 0, message: String(error.message || error).slice(0, 80) };
  }
}

const volumeOf = (row) => (Number(row.monthlyPcQcCnt) || 0) + (Number(row.monthlyMobileQcCnt) || 0);

/**
 * 씨앗으로 쓸 수 있는 말인가.
 *
 * 검색광고 연관어는 공백 없는 한 덩어리로 온다("주민세납부기간"). 그대로 씨앗에
 * 넣어도 되지만 두 가지는 거른다:
 *   · 15자 초과 — hintKeywords 가 잘라서 **다른 키워드의** 연관어를 준다(조용히 틀린다)
 *   · 한글·영숫자가 아닌 것 — 특수문자가 섞이면 자동완성이 빈손으로 온다
 */
function usableSeed(keyword) {
  const compact = String(keyword || '').replace(/\s+/g, '');
  if (compact.length < 2 || compact.length > 15) return false;
  return /^[가-힣A-Za-z0-9]+$/.test(compact);
}

async function main() {
  const { EnvironmentManager } = require('../src/utils/environment-manager');
  const manager = typeof EnvironmentManager.getInstance === 'function'
    ? EnvironmentManager.getInstance()
    : new EnvironmentManager();
  const config = manager.getConfig();
  const creds = {
    accessLicense: config.naverSearchAdAccessLicense,
    secretKey: config.naverSearchAdSecretKey,
    customerId: config.naverSearchAdCustomerId,
  };
  if (!creds.accessLicense || !creds.secretKey) {
    console.error('네이버 검색광고 자격증명이 필요합니다.');
    process.exit(2);
  }

  /*
   * 신선하면 그냥 끝낸다. 기본 3일 — 월·금 갱신에 맞춘 값이다(사장님 지시).
   * 월→금은 4일, 금→월은 3일이라 둘 다 이 문턱을 넘는다. 같은 날 회차가 두 번
   * 돌아도 두 번째는 건너뛴다.
   */
  const maxAgeDays = Number(arg('maxAgeDays')) || 3;
  if (!hasFlag('force') && fs.existsSync(DEST)) {
    try {
      const previous = JSON.parse(fs.readFileSync(DEST, 'utf8'));
      // 날짜만 보지 않는다 — 힌트 창구가 없는 옛 꼴이면 신선해도 다시 긁는다(seed-hints.ts).
      if (!warehouseNeedsRebuild(previous, { maxAgeDays })) {
        const ageDays = (Date.now() - Date.parse(previous.builtAt)) / 86400000;
        console.log(`창고가 ${ageDays.toFixed(1)}일 전 것이라 그대로 씁니다(${previous.totalSeeds?.toLocaleString('ko-KR')}개). 다시 긁으려면 --force.`);
        process.exit(0);
      }
    } catch {
      // 못 읽으면 새로 긁는다
    }
  }

  const gapMs = Number(arg('gapMs')) || 120;
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  /** 창구별로 {키워드 → 검색량}. 같은 말이 여러 창구에서 와도 한 번만 센다. */
  const seeds = new Map();
  const sources = { month: {}, event: {}, biztp: {}, hint: {}, title: {}, section: {} };
  let calls = 0;
  let failed = 0;

  /*
   * 출처를 함께 남긴다(2026-09-07). 업종 씨앗은 그 업종이 곧 주제라서, 발굴이
   * "자동차 주제에는 자동차 업종 씨앗"을 고를 수 있다. 출처 없이 섞어 두면
   * 자동차 주제에 '페키니즈분양'이 실린다(실측).
   *   biztp:17 · month:11 · event:23 · hint:영화  꼴로 적는다.
   *
   * 같은 말이 여러 창구에서 오면 **주제를 아는 출처**를 남긴다(2026-09-08).
   * 전엔 먼저 만난 출처를 남겼는데, 월·시즌을 먼저 긁는 순서라 업종 창구 행
   * 84,882개 중 21,899개가 출처를 잃었다 — 월·시즌 출처는 주제가 없어 라우팅이
   * 안 되므로, 그 말이 업종에서도 왔다는 사실이 통째로 버려진 것이다.
   * 우선순위(힌트 > 업종 > 월·시즌)는 seed-hints.preferSource 가 정한다.
   */
  /*
   * 광고 실측도 같이 남긴다(2026-09-08, 사장님 "광고 클릭률을 보는 게 중요하다").
   * 같은 응답 행에 오는 값이라 호출이 늘지 않는다. 파일이 월·금마다 커밋되므로 짧게:
   * comp 는 H/M/L 한 글자, depth 는 반올림 정수. 못 받으면 안 적는다.
   */
  const COMP_CODE = { 높음: 'H', 중간: 'M', 낮음: 'L' };
  const adFacts = (row) => {
    const comp = COMP_CODE[String(row.compIdx || '').trim()];
    const depthRaw = Number(row.plAvgDepth);
    const depth = Number.isFinite(depthRaw) && depthRaw >= 0 ? Math.round(depthRaw) : undefined;
    return { ...(comp ? { comp } : {}), ...(depth !== undefined ? { depth } : {}) };
  };

  const collect = (rows, bucket, label, sourceTag, extra = {}) => {
    let added = 0;
    for (const row of rows) {
      const keyword = String(row.relKeyword || '').trim();
      if (!usableSeed(keyword)) continue;
      const volume = volumeOf(row);
      const previous = seeds.get(keyword);
      if (!previous) added += 1;
      seeds.set(keyword, {
        ...(previous || {}),
        ...adFacts(row),
        // 같은 말이 두 창구에서 오면 큰 값을 남긴다 — 어느 쪽도 지어낸 값이 아니다.
        searchVolume: Math.max(previous ? previous.searchVolume : 0, volume),
        source: previous ? preferSource(previous.source, sourceTag) : sourceTag,
      });
    }
    bucket[label] = { rows: rows.length, newSeeds: added, ...extra };
    return added;
  };

  console.log('■ 월별(month=1~12) — 그 달에 검색이 몰리는 말');
  for (let month = 1; month <= 12; month += 1) {
    const { rows, ok, status } = await tool(creds, `month=${month}&showDetail=1`);
    calls += 1;
    if (!ok) failed += 1;
    const added = collect(rows, sources.month, String(month), `month:${month}`);
    console.log(`  ${String(month).padStart(2)}월 ${String(rows.length).padStart(5)}개${ok ? '' : ` (HTTP ${status})`} · 새 씨앗 ${added}`);
    await sleep(gapMs);
  }

  /*
   * 시즌 테마(event=N). 코드 표가 공개돼 있지 않아 1~60 을 훑어 응답이 있는 것만 쓴다.
   * 실측(2026-09-07): 1~40 중 24개가 살아 있었고 41~60 에서도 계속 나왔다.
   * 빈 코드는 조용히 지나간다 — 없는 것과 실패한 것을 구분해 로그에만 남긴다.
   */
  console.log('■ 시즌 테마(event=1~60) — 살아 있는 코드만');
  const maxEvent = Number(arg('maxEvent')) || 60;
  for (let id = 1; id <= maxEvent; id += 1) {
    const { rows, ok } = await tool(creds, `event=${id}&showDetail=1`);
    calls += 1;
    if (!ok) failed += 1;
    if (rows.length === 0) { await sleep(gapMs); continue; }
    const added = collect(rows, sources.event, String(id), `event:${id}`);
    const top = rows.slice(0, 3).map((r) => r.relKeyword).join('·');
    console.log(`  event=${String(id).padStart(2)} ${String(rows.length).padStart(5)}개 · 새 ${String(added).padStart(4)} · ${top}`);
    await sleep(gapMs);
  }

  console.log('■ 업종(biztpId=1~N) — 그 분야 사람들이 치는 말');
  const maxBiztp = Number(arg('maxBiztp')) || 80;
  let emptyRun = 0;
  for (let id = 1; id <= maxBiztp; id += 1) {
    const { rows, ok } = await tool(creds, `biztpId=${id}&showDetail=1`);
    calls += 1;
    if (!ok) failed += 1;
    if (rows.length === 0) {
      emptyRun += 1;
      // 빈 코드가 연달아 열 번이면 표의 끝으로 본다 — 남은 번호에 호출을 쓰지 않는다.
      if (emptyRun >= 10 && id > 60) { console.log(`  ${id} 부터 연속 빈 코드 — 여기서 멈춥니다.`); break; }
      await sleep(gapMs);
      continue;
    }
    emptyRun = 0;
    const added = collect(rows, sources.biztp, String(id), `biztp:${id}`);
    const top = rows.slice(0, 3).map((r) => r.relKeyword).join('·');
    console.log(`  biztp=${String(id).padStart(2)} ${String(rows.length).padStart(5)}개 · 새 ${String(added).padStart(4)} · ${top}`);
    await sleep(gapMs);
  }

  /*
   * 힌트 창구(2026-09-08) — 창고에서 0개 받던 주제의 공급원.
   *
   * 업종 창구는 광고주용이라 영화·드라마·방송·연예·음악·만화·미술·사진·좋은글·
   * 원예 열 주제가 아예 없다(실측: 창고 44,344개 중 0개). 주제별 머리말을
   * hintKeywords 로 넣어 연관어를 받는다. 출처는 `hint:주제` — 말이 아니라 출처로
   * 라우팅하므로 부분일치 오탐이 없다.
   *
   * 머리말당 상위 HINT_ROWS_CAP 만 쓰고, 그 안에서도 **그 주제의 말(닻)이 있는 행만**
   * 담는다(keepHintRow). 첫 감사 실행에서 연관어가 2위부터 광고주 말(촬영장소대여·
   * 지역케이블·레고테크닉·맥도날드)이라 상한만으론 못 막는 것을 봤다. 걸러진 행은
   * 창고에 안 들어가므로 제 주제 머리말이 뒤에 오면 그때 담긴다.
   * 순위 구간 표본(닻 통과분)을 로그에 남기므로 회차 로그가 곧 감사다.
   */
  /*
   * 머리말 하나를 긁어 담는다 — 정적 머리말과 제목 머리말이 같은 길을 쓴다.
   *
   * 되보내기(2026-09-08, 사장님 "광고주 그래프도 중요하지 않니"): 닻에 안 맞는 행을
   * 버리지 않고 말이 가리키는 주제로 보낸다 — 영화 머리말이 끌고 온 '중드추천'은
   * 드라마로, '넷플릭스요금제'는 IT·컴퓨터로. 어디에도 안 맞는 것만 버린다.
   * 제목 머리말(titleHead)이면 그 제목을 품은 행은 닻이 없어도 머리말 주제다.
   */
  const ingestHint = async (topic, head, bucket, labelPrefix, titleHead, tagFor = hintSourceTag) => {
    const { rows: allRows, ok, status } = await tool(creds, `hintKeywords=${encodeURIComponent(head)}&showDetail=1`);
    calls += 1;
    if (!ok) failed += 1;
    const capped = allRows.slice(0, HINT_ROWS_CAP);
    const byTarget = new Map();
    let dropped = 0;
    for (const row of capped) {
      const target = routeHintRow(topic, String(row.relKeyword || ''), titleHead);
      if (!target) { dropped += 1; continue; }
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target).push(row);
    }
    const kept = byTarget.get(topic) || [];
    const added = collect(kept, bucket, `${labelPrefix}${head}`, tagFor(topic), {
      topic, rawRows: allRows.length, capped: capped.length, dropped,
    });
    const rerouted = [];
    let moved = 0;
    for (const [target, rows] of byTarget) {
      if (target === topic) continue;
      const fresh = collect(rows, bucket, `${labelPrefix}${head}→${target}`, tagFor(target), { topic: target, from: head });
      rerouted.push(`${target} ${rows.length}(새 ${fresh})`);
      moved += rows.length;
    }
    await sleep(gapMs);
    return { allRows, capped, kept, added, dropped, moved, rerouted, ok, status };
  };

  console.log('■ 힌트(hintKeywords=주제 머리말) — 업종 창구에 없는 연예·문화 주제');
  for (const [topic, heads] of Object.entries(SEED_HINTS)) {
    for (const head of heads) {
      const r = await ingestHint(topic, head, sources.hint, '', undefined);
      console.log(`  ${topic} / ${head.padEnd(9)} ${String(r.allRows.length).padStart(5)}개 → 상위 ${String(r.capped.length).padStart(3)} → 제 주제 ${String(r.kept.length).padStart(3)} · 새 ${String(r.added).padStart(4)} · 딴 주제 ${r.rerouted.length ? r.rerouted.join(' · ') : '0'} · 버림 ${r.dropped}${r.ok ? '' : ` (HTTP ${r.status})`}`);
      for (const at of [0, 50, 150]) {
        if (at >= r.kept.length) continue;
        console.log(`      ${String(at + 1).padStart(3)}위~ ${r.kept.slice(at, at + 6).map((x) => x.relKeyword).join(' · ')}`);
      }
    }
  }

  /*
   * 제목 머리말(2026-09-08, 사장님 "정직하게 남는 것들을 최대한 극한으로 늘려봐").
   *
   * 방송·스타·연예인·드라마는 정적 머리말로 15·19·35개뿐이었다 — 광고 그래프에 콘텐츠
   * 이웃이 없어서다. 뉴스 제목에서 **지금 방영 중인 작품·프로그램·인물 이름**을 뽑아
   * 머리말로 넣는다(news-title-heads.ts). 연관어는 '폭싹속았수다 출연진·몇부작·결말'
   * 꼴로 오고, 제목을 품은 행은 닻이 없어도 그 주제다. 창고가 월·금마다 다시 긁히므로
   * 이름도 같이 갱신된다. 오픈 API 키가 없으면 이 구간만 건너뛴다.
   */
  const openApi = { clientId: config.naverClientId, clientSecret: config.naverClientSecret };
  if (!openApi.clientId || !openApi.clientSecret) {
    console.log('■ 제목 머리말 — 오픈 API 키 없음, 건너뜀(정적 머리말만으로 만든다)');
  } else {
    console.log('■ 제목 머리말(뉴스 제목 → 작품·인물 이름 → hintKeywords)');
    const { naverApiFetch } = require('../src/utils/naver-api-hub');
    const staticHeads = new Set(Object.values(SEED_HINTS).flat());
    const newsTitles = async (query) => {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=100&sort=date`;
      try {
        const res = await naverApiFetch(url, {
          headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret },
        });
        if (!res.ok) return { titles: [], status: res.status };
        const data = await res.json().catch(() => null);
        return { titles: ((data && data.items) || []).map((item) => String(item.title || '')), status: 200 };
      } catch (error) {
        return { titles: [], status: 0, message: String((error && error.message) || error).slice(0, 80) };
      }
    };
    for (const [topic, queries] of Object.entries(TITLE_HEAD_QUERIES)) {
      const titles = [];
      const newsErrors = [];
      for (const query of queries) {
        const r = await newsTitles(query);
        titles.push(...r.titles);
        if (r.status !== 200) newsErrors.push(`${query} ${r.status}${r.message ? ` ${r.message}` : ''}`);
        await sleep(gapMs);
      }
      // 말 규칙이 딴 주제라고 하는 말(인턴·병명)은 상한을 자르기 전에 뺀다 — 자리를 안 잡아먹게.
      const heads = extractTitleHeads(titles, {
        minCount: 2,
        limit: TITLE_HEADS_PER_TOPIC,
        accept: (head) => !staticHeads.has(head) && titleHeadFitsTopic(topic, head),
      });
      console.log(`  ${topic}: 뉴스 제목 ${titles.length}건 → 머리말 ${heads.length}개${newsErrors.length ? ` (뉴스 실패 ${newsErrors.join(' · ')})` : ''}`);
      if (heads.length > 0) console.log(`      ${heads.slice(0, 15).join(' · ')}${heads.length > 15 ? ' …' : ''}`);
      let keptTotal = 0; let addedTotal = 0; let movedTotal = 0; let droppedTotal = 0;
      for (const head of heads) {
        // 머리말 집합을 통째로 준다 — 형제 제목(유부녀킬러 → 욕망의덫)도 그 주제다.
        const r = await ingestHint(topic, head, sources.title, `${topic}:`, heads);
        keptTotal += r.kept.length; addedTotal += r.added; movedTotal += r.moved; droppedTotal += r.dropped;
        if (!r.ok) console.log(`      !! ${head} HTTP ${r.status}`);
      }
      console.log(`  ${topic}: 제목 머리말 ${heads.length}개 → 제 주제 ${keptTotal}(새 ${addedTotal}) · 딴 주제 ${movedTotal} · 버림 ${droppedTotal}`);
    }
  }

  /*
   * 블로그 섹션 창구(2026-09-09, 사장님 "독보적인 씨앗을 가져올 수 있는 곳" 승인).
   * section.blog.naver.com 이 네이버의 32주제 분류 그대로 지금 올라오는 글 제목을 공개 API 로 준다(키 불필요).
   * 검색광고(광고주 어휘)·뉴스(연예)에 없는 생활·취미·예술 주제의 진짜 어휘가 여기 있다 — 실측에서
   * 미술·사진·취미·원예는 창고에 황금이 0이었다. 제목 → 구절 머리말 → hintKeywords 실측 → section:주제.
   * 제목은 씨앗이 아니다. 검색량이 실측된 말만 씨앗이다. --sectionPages 로 주제당 페이지 수(기본 20 = 200제목).
   */
  const sectionPages = Number(arg('sectionPages')) || 20;
  const sectionHeadsPerTopic = Number(arg('sectionHeads')) || 40;
  if (sectionPages > 0) {
    console.log(`■ 블로그 섹션(주제별 글 제목 → 구절 머리말 → hintKeywords) — 주제당 ${sectionPages}쪽·머리말 ${sectionHeadsPerTopic}개`);
    const sectionFetch = async (url) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Referer: 'https://section.blog.naver.com/ThemePost.naver' } });
        return { status: res.status, text: res.ok ? await res.text() : '' };
      } catch (error) {
        return { status: 0, text: '', message: String(error && error.message || error).slice(0, 60) };
      }
    };
    for (const [topic, seq] of Object.entries(BLOG_SECTION_DIRECTORY)) {
      const titles = [];
      let failedPages = 0;
      for (let page = 1; page <= sectionPages; page += 1) {
        const r = await sectionFetch(blogSectionUrl(seq, page));
        const got = parseBlogSectionTitles(r.text);
        if (got.length === 0) { failedPages += 1; if (failedPages >= 3) break; }
        titles.push(...got);
        await sleep(150);
      }
      const heads = extractSectionHeads(titles, {
        minCount: 2,
        limit: sectionHeadsPerTopic,
        accept: (head) => titleHeadFitsTopic(topic, head),
      });
      console.log(`  ${topic}: 글 제목 ${titles.length}건 → 머리말 ${heads.length}개${failedPages ? ` (빈 쪽 ${failedPages})` : ''}`);
      if (heads.length > 0) console.log(`      ${heads.slice(0, 15).join(' · ')}${heads.length > 15 ? ' …' : ''}`);
      let keptTotal = 0; let addedTotal = 0; let movedTotal = 0; let droppedTotal = 0;
      for (const head of heads) {
        const r = await ingestHint(topic, head.replace(/\s+/g, ''), sources.section, `${topic}:`, heads, sectionSourceTag);
        keptTotal += r.kept.length; addedTotal += r.added; movedTotal += r.moved; droppedTotal += r.dropped;
        if (!r.ok) console.log(`      !! ${head} HTTP ${r.status}`);
      }
      console.log(`  ${topic}: 섹션 머리말 ${heads.length}개 → 제 주제 ${keptTotal}(새 ${addedTotal}) · 딴 주제 ${movedTotal} · 버림 ${droppedTotal}`);
    }
  }

  /*
   * 저볼륨은 버린다(2026-09-07). 발굴은 minSearchVolume(500) 위만 씨앗으로 쓰므로
   * 그 아래를 실어 봐야 파일만 커진다 — 월·금마다 커밋하는 파일이라 크기가 곧
   * 레포 무게다. 전부 담으면 7.5MB, 하한을 걸면 그 절반 아래로 떨어진다.
   * --keepBelow 로 하한을 낮출 수 있다(조사·비교용).
   */
  const keepFrom = Number(arg('keepBelow')) || 500;
  const all = [...seeds.entries()]
    .map(([keyword, entry]) => ({
      keyword,
      searchVolume: entry.searchVolume,
      source: entry.source,
      ...(entry.comp ? { comp: entry.comp } : {}),
      ...(entry.depth !== undefined ? { depth: entry.depth } : {}),
    }))
    .filter((entry) => entry.searchVolume >= keepFrom)
    .sort((a, b) => b.searchVolume - a.searchVolume);
  const dropped = seeds.size - all.length;

  const payload = {
    builtAt: new Date().toISOString(),
    generator: 'build-seed-db',
    /** 이 값들은 전부 검색광고 실측이다 — 여기서 계산한 수치는 없다. */
    source: 'searchad keywordstool (month · event · biztpId · hintKeywords)',
    calls,
    failed,
    totalSeeds: all.length,
    byVolume: {
      '10000+': all.filter((s) => s.searchVolume >= 10000).length,
      '3000+': all.filter((s) => s.searchVolume >= 3000).length,
      '1000+': all.filter((s) => s.searchVolume >= 1000).length,
    },
    sources,
    seeds: all,
  };
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  // 들여쓰기 없이 쓴다 — 사람이 읽는 파일이 아니고, 월·금마다 커밋되는 파일이다.
  fs.writeFileSync(DEST, JSON.stringify(payload), 'utf8');

  console.log('');
  console.log(`창고: ${DEST}`);
  console.log(`  호출 ${calls}회(실패 ${failed}) · 씨앗 ${all.length.toLocaleString('ko-KR')}개 (검색량 ${keepFrom} 미만 ${dropped.toLocaleString('ko-KR')}개 제외)`);
  console.log(`  검색량 10,000↑ ${payload.byVolume['10000+'].toLocaleString('ko-KR')} · 3,000↑ ${payload.byVolume['3000+'].toLocaleString('ko-KR')} · 1,000↑ ${payload.byVolume['1000+'].toLocaleString('ko-KR')}`);
  console.log('  이 파일은 커밋해야 CI 가 씁니다.');
  process.exit(0);
}

main().catch((error) => {
  console.error(`씨앗 창고 실패: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
