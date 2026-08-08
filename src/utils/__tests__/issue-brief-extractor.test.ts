import * as fs from 'fs';
import * as path from 'path';
import { extractIssueBrief } from '../issue-brief-extractor';

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

// 실제 Bright Data 로 받아온 네이버 뉴스탭 HTML(2026-08-08, '이정후 적시타').
// 네이버가 마크업을 바꾸면 이 테스트가 먼저 깨져서 조용한 실패를 막는다.
const html = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'naver-news-sample.html'),
  'utf8',
);

const brief = extractIssueBrief(html, '이정후 적시타');

// ── 기사 추출 ────────────────────────────────────────────────────────
assert('기사를 여러 건 뽑는다', brief.articles.length >= 5, String(brief.articles.length));
assert('모든 기사에 제목이 있다', brief.articles.every((a) => a.title.length >= 5));
assert('요약이 붙은 기사가 있다', brief.articles.some((a) => a.summary.length >= 40));
assert('언론사가 붙은 기사가 있다', brief.articles.some((a) => a.press.length >= 2),
  JSON.stringify(brief.articles.slice(0, 2)));
assert('기사 사진이 붙은 기사가 있다', brief.articles.some((a) => Boolean(a.imageUrl)));

// 이미지는 언론사 로고가 아니라 기사 사진이어야 한다.
// office_logo 를 사진으로 쓰면 전 기사가 똑같은 로고 그림이 된다.
assert('로고를 사진으로 쓰지 않는다',
  brief.articles.every((a) => !a.imageUrl || !/office_logo/.test(a.imageUrl)),
  brief.articles.map((a) => a.imageUrl).find((u) => u && /office_logo/.test(u)) || '');
assert('사진 URL 은 원본 절대주소',
  brief.articles.every((a) => !a.imageUrl || a.imageUrl.startsWith('https://')));

// ── 사실 문장 ────────────────────────────────────────────────────────
// 사장님 요구: "어떤 경기에서 몇 번 타석에서 어떻게 쳤는지" 가 나와야 한다.
// 조합해서 지어내면 안 되고, 기사 원문에서 그대로 가져와야 한다.
assert('사실 문장을 뽑는다', brief.facts.length >= 3, String(brief.facts.length));

// 원문 대조는 추출기와 같은 정규화를 거쳐야 한다(엔티티 디코드·공백 정리).
// 대조 없이 통과시키면 "지어낸 문장"을 걸러낼 수 없다 — 이 테스트의 핵심이다.
// 태그는 공백이 아니라 빈 문자열로 지운다 — 검색어가 <mark> 로 감싸여 오기 때문에
// 공백으로 치환하면 "이정후가" 가 "이정후 가" 로 갈라져 대조가 어긋난다.
const corpus = html
  .replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');
assert('사실은 전부 기사 원문에 실재한다',
  brief.facts.every((f) => corpus.includes(f.text.slice(0, 20))),
  brief.facts.map((f) => f.text.slice(0, 30)).find((t) => !corpus.includes(t.slice(0, 20))) || '');
assert('사실마다 출처 기사가 붙는다', brief.facts.every((f) => f.sourceIndex >= 0));

// 구체 정보(숫자·이닝·상황)가 담긴 문장이 잡혀야 한다.
const factCorpus = brief.facts.map((f) => f.text).join(' ');
assert('구체 정황이 잡힌다', /(회말|회초|타석|만루|타점|연속|타율)/.test(factCorpus),
  factCorpus.slice(0, 200));

// ── 공식 확인 링크 ───────────────────────────────────────────────────
assert('기사 링크를 뽑는다', brief.links.length >= 1, String(brief.links.length));
assert('링크는 네이버 뉴스 절대주소',
  brief.links.every((l) => /^https:\/\/n\.news\.naver\.com\/mnews\/article\//.test(l.url)));

// 언론사 오귀속 방지 — 같은 office 코드의 기사에 서로 다른 언론사명이 붙으면 안 된다.
// "공식 확인"으로 내보내면서 출처를 틀리면 사실 조작이다.
{
  const byOffice = new Map<string, Set<string>>();
  for (const link of brief.links) {
    const office = (link.url.match(/article\/(\d+)\//) || [])[1] || '';
    if (!office || !link.press) continue;
    if (!byOffice.has(office)) byOffice.set(office, new Set());
    (byOffice.get(office) as Set<string>).add(link.press);
  }
  const conflict = [...byOffice.entries()].find(([, names]) => names.size > 1);
  assert('같은 언론사 코드에 이름이 하나만 붙는다', !conflict,
    conflict ? `office ${conflict[0]} → ${[...conflict[1]].join(', ')}` : '');
}

// ── 안전장치 ─────────────────────────────────────────────────────────
{
  // 빈 입력·쓰레기 입력에서 조용히 가짜를 만들면 안 된다.
  const empty = extractIssueBrief('<html><body>차단됨</body></html>', '아무거나');
  assert('빈 입력이면 기사 0건', empty.articles.length === 0);
  assert('빈 입력이면 사실 0건', empty.facts.length === 0);
  assert('빈 입력이면 hasContent=false', empty.hasContent === false);
}
assert('정상 입력이면 hasContent=true', brief.hasContent === true);

console.log(`\n[issue-brief-extractor.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
