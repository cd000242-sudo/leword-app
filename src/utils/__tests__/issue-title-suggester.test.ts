import { suggestTitles, suggestTopic } from '../issue-title-suggester';

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

// ── 제목이 비문이면 안 된다 ──────────────────────────────────────────
// 실주행에서 "12주째 하락세를 이어갔다 총정리", "14m짜리 버디를 성공시키며",
// "5인 체제로 활동하게 정리" 같은 비문이 나왔다. 조사·어미가 매달린 조각을
// 제목에 넣으면 그대로 사용자 블로그 제목이 된다.
const DANGLING = /(을|를|이|가|은|는|에|에서|으로|로|와|과|의|하며|하고|하게|했다|였다|이며|시키며|이어갔다)\s+(총정리|무슨)/;

{
  const s = suggestTitles('기름값 12주 하락', [
    '이번 주 전국 주유소 기름값이 12주 연속 하락한 가운데, 휘발유와 경유 모두 1천8백원 대를 유지했습니다.',
    '같은 기간 대구지역 기름값은 12주째 하락세를 이어갔다.',
  ]);
  assert('서술어가 제목에 안 붙는다', !DANGLING.test(s.seoTitle), s.seoTitle);
  assert('홈판도 마찬가지', !DANGLING.test(s.homeTitle), s.homeTitle);
  // 키워드에 이미 있는 정보를 또 붙이지 않는다.
  assert('키워드 중복을 피한다', !/12주.*12주/.test(s.seoTitle), s.seoTitle);
}

{
  const s = suggestTitles('한아름 첫 홀 버디 성공', [
    '한아름은 14m짜리 버디를 성공시키며 단독 선두로 나섰다.',
  ]);
  assert('연결어미가 안 붙는다', !DANGLING.test(s.seoTitle), s.seoTitle);
}

{
  // 날짜는 제목에 넣지 않는다 — "18일 윤혜진" 같은 게 나왔다.
  const s = suggestTitles('윤혜진 발레 복귀', [
    '윤혜진은 18일 윤혜진 발레단 공연에서 무대에 오른다.',
  ]);
  assert('날짜 조각을 제목에 안 넣는다', !/18일/.test(s.seoTitle), s.seoTitle);
}

{
  // 뽑을 게 없으면 억지로 만들지 않고 기본형으로.
  const s = suggestTitles('유아인 남사친 볼뽀뽀', ['특별한 수치가 없는 문장입니다.']);
  assert('구체 정보 없으면 기본형', s.seoTitle === '유아인 남사친 볼뽀뽀 총정리', s.seoTitle);
  assert('홈판 기본형', s.homeTitle === '유아인 남사친 볼뽀뽀, 지금 무슨 일인가', s.homeTitle);
}

{
  // 쓸 만한 수치는 살린다.
  const s = suggestTitles('전국 무더위 지속', [
    '다음 주도 대부분 지역 낮 최고 기온이 33도 안팎을 기록하며 무더위가 이어지겠다.',
  ]);
  assert('수치+명사는 붙인다', s.seoTitle.includes('33도'), s.seoTitle);
  assert('붙여도 비문이 아니다', !DANGLING.test(s.seoTitle), s.seoTitle);
}

// ── 언론사 제목을 베끼지 않는다 ──────────────────────────────────────
{
  const headline = "'6G 연속 안타→월간 타율 0.360' 이정후, 결승 2타점 적시타 폭발!";
  const s = suggestTitles('이정후 적시타', ['이정후가 2타점 적시타를 쳤다.'], [headline]);
  assert('기사 제목을 그대로 쓰지 않는다', s.seoTitle !== headline && s.homeTitle !== headline);
  assert('기사 제목은 참고로만 넘긴다', s.referenceHeadlines.includes(headline));
}

// ── 주제 분류 ────────────────────────────────────────────────────────
assert('야구 → 스포츠', suggestTopic('이정후 적시타', [])?.label === '스포츠');
assert('유가 → 비즈니스·경제', suggestTopic('기름값 12주 하락', [])?.label === '비즈니스·경제');
assert('재판 → 사회·정치', suggestTopic('황정민 스토킹 구형', [])?.label === '사회·정치');
assert('발레 → 공연·전시', suggestTopic('윤혜진 발레 복귀', [])?.label === '공연·전시');
assert('무더위 → 일상·생각', suggestTopic('전국 무더위 지속', [])?.label === '일상·생각');

// 틀린 주제는 노출을 막는다. 확신 없으면 찍지 말고 null.
assert('모르면 null', suggestTopic('조중연', []) === null,
  String(suggestTopic('조중연', [])?.label));
{
  // 기사에 곁가지 주제가 한 번 스쳐도 그걸로 결정하면 안 된다.
  // (아이돌 기사에 '경기' 가 한 번 나왔다고 스포츠로 보내면 홈판이 엉뚱해진다)
  const topic = suggestTopic('캣츠아이 소피아 활동 중단', [
    '소피아는 당분간 활동을 중단한다. 팀은 5인 체제로 무대에 오른다.',
    '이날 경기 중계 시간과 겹쳐 팬들의 관심이 분산됐다.',
  ]);
  assert('한 번 스친 곁가지로 주제를 정하지 않는다', topic?.label !== '스포츠',
    String(topic?.label));
}

// 32종에 없는 주제를 만들어내면 안 된다 — 사용자가 고를 수 없다.
{
  const { NAVER_BLOG_TOPIC_LABELS } = require('../naver-blog-topics');
  const samples = ['이정후 적시타', '기름값 하락', '전국 폭염', '치지직', '조중연'];
  const bad = samples
    .map((k) => suggestTopic(k, []))
    .filter((t) => t && !NAVER_BLOG_TOPIC_LABELS.includes(t.label));
  assert('네이버 32종 밖의 주제를 만들지 않는다', bad.length === 0,
    bad.map((t) => t && t.label).join(','));
}

console.log(`\n[issue-title-suggester.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
