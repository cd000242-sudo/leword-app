/**
 * content-brief-enricher.test.ts
 *
 * C4 slice3 실측 콘텐츠 브리핑 enricher(../pro-hunter-v12/content-brief-enricher)의 오케스트레이션
 * (topN 제한·dedup·본문0/실패 스킵·graceful)을 mock fetcher/analyzer 로 고정. 네트워크/puppeteer 없이.
 */
import {
  enrichKeywordsWithContentBrief,
  isContentBriefReliable,
  CONTENT_BRIEF_MAX_TOP_N,
} from '../pro-hunter-v12/content-brief-enricher';
import type { FetchedPost } from '../pro-hunter-v12/serp-content-fetcher';
import type { SerpAnalysis } from '../pro-hunter-v12/serp-content-analyzer';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) passed++;
  else { failed++; failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`); }
}
const eq = (name: string, got: unknown, want: unknown) =>
  assert(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

function post(rank: number): FetchedPost {
  return {
    rank, title: `t${rank}`, url: `u${rank}`, bloggerName: 'b', postDate: '', bodyText: 'x',
    h2Count: 2, h3Count: 1, imageCount: 5, videoCount: 0, externalLinkCount: 1,
    wordCount: 1500, charCount: 4000, ageDays: 30,
  };
}
function brief(postCount: number): SerpAnalysis {
  return {
    postCount, avgWordCount: 1500, recommendedWordCount: 1800, avgImageCount: 5, avgH2Count: 2,
    avgH3Count: 1, avgVideoCount: 0, avgExternalLinks: 1, avgAgeDays: 30, oldPostRatio: 0.1,
    videoUsageRatio: 0, topKeywords: [], mustIncludeTerms: ['a', 'b'], competitorTitles: ['t1'], postOutlines: [],
  };
}

async function run() {
  // ── topN 제한: 10 입력, topN 3 → 3만 fetch ──
  const kws = Array.from({ length: 10 }, (_, i) => `kw${i}`);
  let fetches = 0;
  const m3 = await enrichKeywordsWithContentBrief(kws, {
    topN: 3,
    fetcher: async () => { fetches++; return [post(1), post(2)]; },
    analyzer: () => brief(2),
  });
  eq('topN=3 → 3개 브리핑', m3.size, 3);
  eq('fetcher 3회', fetches, 3);
  eq('kw0 recommendedWordCount', m3.get('kw0')?.recommendedWordCount, 1800);
  eq('kw3 미측정', m3.get('kw3'), undefined);

  // ── 상한 클램프 ──
  const mCap = await enrichKeywordsWithContentBrief(Array.from({ length: 50 }, (_, i) => `k${i}`), {
    topN: 999, fetcher: async () => [post(1)], analyzer: () => brief(1),
  });
  eq('topN 상한 클램프', mCap.size, CONTENT_BRIEF_MAX_TOP_N);

  // ── dedup ──
  let dfetch = 0;
  const mDup = await enrichKeywordsWithContentBrief(['a', 'a', '  ', 'b'], {
    topN: 10, fetcher: async () => { dfetch++; return [post(1)]; }, analyzer: () => brief(1),
  });
  eq('dedup 후 2개', mDup.size, 2);
  eq('dedup fetch 2회', dfetch, 2);

  // ── 본문 0개 → map 에 안 넣음(미측정) ──
  const mEmpty = await enrichKeywordsWithContentBrief(['x'], {
    topN: 10, fetcher: async () => [], analyzer: () => brief(0),
  });
  eq('본문 0개 → 미측정', mEmpty.get('x'), undefined);

  // ── fetcher throw → 스킵(발굴 안 막음) ──
  const mFail = await enrichKeywordsWithContentBrief(['x', 'y'], {
    topN: 10, fetcher: async (kw) => { if (kw === 'x') throw new Error('crawl'); return [post(1)]; }, analyzer: () => brief(1),
  });
  eq('실패 키워드 미측정', mFail.get('x'), undefined);
  eq('성공 키워드 측정', isContentBriefReliable(mFail.get('y')), true);

  // ── isContentBriefReliable ──
  eq('reliable: postCount>0', isContentBriefReliable(brief(3)), true);
  eq('reliable: postCount 0 false', isContentBriefReliable(brief(0)), false);
  eq('reliable: undefined false', isContentBriefReliable(undefined), false);

  console.log(`\n[content-brief-enricher.test] passed: ${passed} / failed: ${failed}`);
  if (failed > 0) {
    failures.forEach((f) => console.error('  ' + f));
    process.exit(1);
  }
  process.exit(0);
}

run();
