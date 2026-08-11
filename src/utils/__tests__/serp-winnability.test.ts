import {
  titleCoverage,
  parseDaysAgo,
  analyzeSerp,
  verdictFor,
  DEFAULT_SERP_THRESHOLDS,
} from '../serp-winnability';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

// ── 제목 커버리지 ────────────────────────────────────────────────────
assert('모든 어절이 들어있으면 1', titleCoverage('소상공인 지원금 신청 방법', '소상공인 지원금') === 1);
assert('일부만 들어있으면 0<x<1', titleCoverage('소상공인 대출 안내', '소상공인 지원금') === 0.5);
assert('하나도 없으면 0', titleCoverage('오늘 날씨', '소상공인 지원금') === 0);
// 조사·공백·기호가 붙어도 같은 어절로 봐야 한다. 안 그러면 한국어에서 거의 다 미스.
assert('조사가 붙어도 일치', titleCoverage('소상공인 지원금을 받는 법', '소상공인 지원금') === 1);
assert('기호가 껴도 일치', titleCoverage('[소상공인] 지원금-신청', '소상공인 지원금') === 1);
// 1글자 어절은 우연 일치가 잦아 분모에서 빠져야 한다.
// '소상공인 A' 의 유효 어절은 '소상공인' 하나뿐 → 그것만 있으면 1.
assert('1글자 어절은 분모에서 빠진다', titleCoverage('소상공인 이야기', '소상공인 A') === 1,
  String(titleCoverage('소상공인 이야기', '소상공인 A')));
assert('유효 어절이 없으면 0', titleCoverage('제목', 'A B') === 0);

/*
 * ── 붙여 쓴 검색어 (2026-08-11 실측 회귀) ─────────────────────────────
 *
 * 아래 제목은 지어낸 것이 아니라 네이버 블로그 검색에서 그대로 받아 온 것이다.
 * 예전 규칙(어절이 통째로 이어져 있어야 인정)은 이 넷을 전부 0.00 으로 냈고,
 * 그래서 보드가 "정면 0건 → 상위 1번째 자리가 비어 있음" 이라고 말했다.
 * 자동완성·연관어는 공백을 지운 형태를 많이 돌려주므로 그런 검색어가 보드를
 * 채웠다. **없는 자리를 있다고 말하는 것**이 이 게이트의 유일한 치명상이다.
 */
const covers = (title: string, keyword: string) => titleCoverage(title, keyword) >= DEFAULT_SERP_THRESHOLDS.exactCoverage;
assert('붙여 쓴 검색어 — 사이에 말이 껴도 정면',
  covers('에너지바우처 잔액조회 안됨 결과 없음과 전기요금 차감 확인 방법', '에너지바우처조회'),
  String(titleCoverage('에너지바우처 잔액조회 안됨 결과 없음과 전기요금 차감 확인 방법', '에너지바우처조회')));
assert('붙여 쓴 검색어 — 어순이 바뀌어도 정면',
  covers('상표등록 무료 조회 방법 총정리', '무료상표등록조회'),
  String(titleCoverage('상표등록 무료 조회 방법 총정리', '무료상표등록조회')));
assert('붙여 쓴 검색어 — 한글+영숫자 섞여도 정면',
  covers('포토몬 4x6 사진인화 350장 내돈내산 후기', '사진인화4X6'),
  String(titleCoverage('포토몬 4x6 사진인화 350장 내돈내산 후기', '사진인화4X6')));

// 반대쪽도 고정한다 — 덩어리 하나 걸렸다고 정면이라고 하면 안 된다.
// '서모 오퍼레이터' 는 웹소설 글이고 '오퍼레이터24' 와 남남이다.
assert('앞덩어리만 걸리면 정면이 아니다',
  !covers('쓰레기 이능력 온도를 바꾸는 자 서모 오퍼레이터 인 내가', '오퍼레이터24'),
  String(titleCoverage('쓰레기 이능력 온도를 바꾸는 자 서모 오퍼레이터 인 내가', '오퍼레이터24')));
assert('무관한 제목은 여전히 0',
  titleCoverage('경기도 김포시 공장등록현황 : 5001 - 6000', '오퍼레이터24') === 0);
// 한 글자짜리 덩어리는 우연 일치가 잦아 세지 않는다.
assert('한 글자 덩어리는 안 센다', titleCoverage('가나다라', '가마바사') === 0,
  String(titleCoverage('가나다라', '가마바사')));

// ── 날짜 파싱 ────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 7, 8);
assert('"3일 전"', parseDaysAgo('3일 전', NOW) === 3);
assert('"2주 전" = 14일', parseDaysAgo('2주 전', NOW) === 14);
assert('"1개월 전" = 30일', parseDaysAgo('1개월 전', NOW) === 30);
assert('"24시간 전" = 1일', parseDaysAgo('24시간 전', NOW) === 1);
assert('절대날짜', parseDaysAgo('2026.08.01', NOW) === 7);
assert('못 읽으면 null', parseDaysAgo('어제', NOW) === null);

// ── SERP 분석 ────────────────────────────────────────────────────────
/*
 * 실제 마크업을 그대로 쓴다. 예전 픽스처는 weight 클래스를 뺀 채였는데,
 * 실측에서 작성자 이름도 headline 계열을 쓴다는 걸 알고 선택자를 좁혔다
 * (headline3+weight-lg = 작성자, headline1+weight-sm = 글 제목).
 * 픽스처가 실제와 다르면 시험이 통과해도 현장에서 틀린다.
 */
function headline(text: string): string {
  return `<span class="sds-comps-text sds-comps-text-type-headline1 sds-comps-text-weight-sm">${text}</span>`;
}

/** 작성자·채널 이름. 제목으로 세면 안 된다. */
function author(text: string): string {
  return `<span class="sds-comps-text sds-comps-text-type-headline3 sds-comps-text-weight-lg q8NHdL14jowibv2C">${text}</span>`;
}

{
  // 상위 제목이 키워드를 정면으로 다루는 경우
  const html = [
    headline('소상공인 <mark>지원금</mark> 신청 방법 총정리'),
    headline('소상공인 지원금 대상 확인'),
    headline('소상공인 지원금 서류 준비'),
    headline('전혀 다른 이야기 오늘 점심'),
  ].join('');
  const serp = analyzeSerp(html, '소상공인 지원금', { nowMs: NOW });
  assert('제목 4건을 읽는다', serp.sampledTitles === 4, String(serp.sampledTitles));
  // <mark> 태그가 걷혀야 '지원금'이 어절로 인식된다.
  assert('mark 태그를 걷어낸다', serp.exactTitleHits === 3, JSON.stringify(serp));
  assert('무관한 제목은 정확일치가 아니다', serp.topTitles.length === 3);
  assert('정면 대응 많으면 LOCKED', verdictFor(serp).verdict === 'LOCKED', JSON.stringify(verdictFor(serp)));
}

{
  // 상위에 정면으로 답한 글이 없는 경우 = 선점 여지
  const html = [
    headline('여름 휴가 준비물 체크리스트'),
    headline('장마철 제습기 고르는 법'),
    headline('에어컨 전기요금 절약 팁'),
    headline('소상공인 대출 상담 후기'),
  ].join('');
  const serp = analyzeSerp(html, '소상공인 지원금', { nowMs: NOW });
  assert('정확 일치 0건', serp.exactTitleHits === 0, JSON.stringify(serp));
  assert('정면 대응 없으면 WINNABLE', verdictFor(serp).verdict === 'WINNABLE', JSON.stringify(verdictFor(serp)));
}

{
  // 파싱 실패를 '공백'으로 오판하면 안 된다 — 가장 위험한 오류다.
  const serp = analyzeSerp('<html><body>차단됨</body></html>', '소상공인 지원금', { nowMs: NOW });
  assert('제목을 못 읽으면 sampledTitles 0', serp.sampledTitles === 0);
  assert('못 읽으면 WINNABLE 이 아니라 NO_DATA', verdictFor(serp).verdict === 'NO_DATA',
    JSON.stringify(verdictFor(serp)));
}

{
  // 중간 지대. 어절 2개짜리 키워드는 커버리지가 0/0.5/1 뿐이라 '부분 일치'가
  // 원리적으로 안 나온다 — 부분 판정을 보려면 3어절 이상이어야 한다.
  const html = [
    headline('소상공인 지원금 신청 총정리'),
    headline('소상공인 지원금 안내'),
    headline('여름 휴가 준비물'),
    headline('제습기 추천'),
  ].join('');
  const serp = analyzeSerp(html, '소상공인 지원금 신청', { nowMs: NOW });
  assert('정확 1 / 부분 1', serp.exactTitleHits === 1 && serp.partialTitleHits === 1, JSON.stringify(serp));
  assert('중간 지대는 CONTESTED', verdictFor(serp).verdict === 'CONTESTED', JSON.stringify(verdictFor(serp)));
}

// ── 임계값 주입 ──────────────────────────────────────────────────────
// 임계값이 코드에 박혀 있으면 배치가 돌기 시작한 뒤 보정을 못 한다.
{
  const html = [headline('소상공인 지원금 신청'), headline('여름 휴가 준비물'), headline('제습기 추천')].join('');
  const serp = analyzeSerp(html, '소상공인 지원금', { nowMs: NOW });
  const strict = verdictFor(serp, { ...DEFAULT_SERP_THRESHOLDS, contestedMaxExact: 0 });
  assert('임계값을 조이면 판정이 바뀐다', strict.verdict === 'LOCKED', JSON.stringify(strict));
  const loose = verdictFor(serp, { ...DEFAULT_SERP_THRESHOLDS, minSampledTitles: 99 });
  assert('표본 하한을 올리면 판정 보류', loose.verdict === 'NO_DATA', JSON.stringify(loose));
}


/*
 * 실측 회귀: '멜라토닌 복용량' 에서 상위 열 개가 전부 작성자 이름이었고,
 * 그 탓에 "정면으로 다룬 글이 없다"는 판정이 나왔다 — 1위가 정면 대응 글이었는데도.
 */
{
  const html = `<html><body>${author('홀니스랩')}${headline('멜라토닌 복용량 정확히 어떻게 드시나요?')}${author('인천성모병원')}${headline('멜라토닌 효능 및 섭취 방법')}${'<div></div>'.repeat(600)}</body></html>`;
  const serp = analyzeSerp(html, '멜라토닌 복용량');
  assert('작성자 이름을 제목으로 세지 않는다', serp.sampledTitles === 2, serp.topTitles.join('|'));
  assert('정면 대응을 놓치지 않는다', serp.exactTitleHits >= 1, JSON.stringify(serp));
}

console.log(`
[serp-winnability.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
