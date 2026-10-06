'use strict';
/**
 * 홈판 흐름 요약(2026-10-06) — 사장님 "벤치마킹해서 사람들한테 홈판에 뜬 것들과 고수 블로거들을 어떻게 썼고
 * 우리는 어떻게 써야 하는지 정리해서 보여주자나? 오늘의 자주 뜨는 홈판 주제는 없네? 앱에도 당연히 있어야 되는데".
 *
 * 수집기가 매시 판을 만들 때 같이 계산해 공개 판(trends)에 싣는다 — 사이트와 앱은 그대로 그린다(규칙이 한 곳).
 * 전부 센 값이다. "이렇게 쓰자"도 센 비율을 문장으로 옮길 뿐, 노출 확률 · 효과를 지어내지 않는다.
 *
 * 재료: 벤치마크 출처(네이버 블로그 179 · 인스타 · 유튜브 · 언론 랭킹)의 최근 글 제목과, 묶인 소재(candidates).
 */
const HOUR = 3600000;
const WINDOW_HOURS = 24;

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

/** 제목 겉모양 — 홈판 제목 교리(2026-09-30 실측 1,295건)와 같은 잣대. */
const SHAPES = {
  quoteStart: /^\s*["“'‘]/,
  ellipsis: /(\.\.|…)/,
  question: /\?/,
  exclaim: /!/,
  number: /\d/,
  // 구어 어미 — 끝 문장부호를 떼고 본다.
  colloquial: /(요|죠|네|더라|거든|잖아|ㅋ+|ㅠ+|ㄷㄷ)$/,
};

function titleStats(titles) {
  const list = titles.map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 4);
  const lengths = list.map((t) => t.length).sort((a, b) => a - b);
  const has = (re) => list.filter((t) => re.test(t)).length;
  const colloquial = list.filter((t) => SHAPES.colloquial.test(t.replace(/["“”'‘’!?.…~\s]+$/g, ''))).length;
  return {
    count: list.length,
    length: { median: quantile(lengths, 0.5), p25: quantile(lengths, 0.25), p75: quantile(lengths, 0.75) },
    quoteStart: pct(has(SHAPES.quoteStart), list.length),
    ellipsis: pct(has(SHAPES.ellipsis), list.length),
    question: pct(has(SHAPES.question), list.length),
    exclaim: pct(has(SHAPES.exclaim), list.length),
    number: pct(has(SHAPES.number), list.length),
    colloquial: pct(colloquial, list.length),
  };
}

/** 센 비율 → "우리는 이렇게" 문장. 비율이 낮은 틀은 "드물다"고 적는다(쓰지 말라는 뜻이 아니라 사실). */
function writingGuide(stats) {
  if (!stats.count) return [];
  const lines = [`길이는 ${stats.length.p25}~${stats.length.p75}자 안에서 — 고수 제목의 가운데 절반이 이 길이다(중앙값 ${stats.length.median}자).`];
  lines.push(stats.quoteStart >= 25
    ? `반응 한 마디를 따옴표로 앞에 세운 제목이 ${stats.quoteStart}% — "…" 로 시작해 사람 목소리부터 들려준다.`
    : `따옴표로 시작한 제목은 ${stats.quoteStart}%로 드물다 — 기준어(무슨 이야기인지)를 앞에 둔다.`);
  if (stats.ellipsis >= 15) lines.push(`말줄임(… · ..)으로 답을 숨긴 제목이 ${stats.ellipsis}% — 결론은 본문으로 미룬다.`);
  if (stats.question >= 10) lines.push(`물음표로 묻는 제목이 ${stats.question}% — 독자가 스스로 답을 궁금해하게.`);
  lines.push(stats.number >= 25
    ? `숫자가 든 제목이 ${stats.number}% — 금액 · 기간 · 순위처럼 구체적인 숫자를 넣는다.`
    : `숫자가 든 제목은 ${stats.number}% — 숫자보다 상황 · 반응으로 끈다.`);
  lines.push(stats.colloquial >= 15
    ? `말하듯 끝낸 제목(~요 · ~네 · ~죠)이 ${stats.colloquial}% — 구어체 호흡.`
    : `말하듯 끝낸 제목(~요 · ~네 · ~죠)은 ${stats.colloquial}%뿐 — 대부분 명사나 사건으로 끝낸다.`);
  return lines;
}

/**
 * posts: 이번 수집의 글(최근 것) · candidates: 묶인 소재 · category: 수집기의 분야 함수(제목, 출처 주제들).
 * 최근 24시간(발행 시각 기준, 모르면 수집 시각) 글로 분야 · 소재 · 제목 모양을 센다.
 */
function buildTrends(posts, candidates, now, category) {
  const nowMs = Date.parse(now);
  const recent = (posts || []).filter((p) => {
    const at = Date.parse(p.publishedAt || p.capturedAt || '');
    return Number.isFinite(at) && nowMs - at <= WINDOW_HOURS * HOUR && at <= nowMs + 5 * 60000;
  });
  const byCategory = new Map();
  for (const post of recent) {
    const name = category(post.title, [post.topic]);
    const row = byCategory.get(name) || { category: name, posts: 0, channels: new Set(), titles: [] };
    row.posts += 1;
    row.channels.add(post.sourceId);
    if (post.platform === 'naver-blog' && row.titles.length < 40) row.titles.push({ title: post.title, name: post.name, url: post.url, sourceId: post.sourceId });
    byCategory.set(name, row);
  }
  const storiesByCategory = new Map();
  const topStories = (candidates || [])
    .map((c) => ({ keyword: c.keyword, title: c.title, category: c.category, channels: new Set((c.sources || []).map((s) => s.id)).size, homeTitle: (c.homeTitles || [])[0] || '' }))
    .filter((s) => s.channels >= 2)
    .sort((a, b) => b.channels - a.channels || a.keyword.localeCompare(b.keyword));
  for (const story of topStories) {
    const list = storiesByCategory.get(story.category) || [];
    if (list.length < 3) list.push(story);
    storiesByCategory.set(story.category, list);
  }
  const categories = [...byCategory.values()]
    .sort((a, b) => b.channels.size - a.channels.size || b.posts - a.posts)
    .map((row) => {
      // 예시는 서로 다른 블로그에서 3개 — 한 블로그가 도배하지 않게.
      const seen = new Set();
      const examples = [];
      for (const t of row.titles) { if (seen.has(t.sourceId)) continue; seen.add(t.sourceId); examples.push({ title: t.title, name: t.name, url: t.url }); if (examples.length >= 3) break; }
      return { category: row.category, posts: row.posts, channels: row.channels.size, stories: storiesByCategory.get(row.category) || [], examples };
    });
  const blogTitles = recent.filter((p) => p.platform === 'naver-blog').map((p) => p.title);
  const stats = titleStats(blogTitles);
  return {
    windowHours: WINDOW_HOURS,
    from: new Date(nowMs - WINDOW_HOURS * HOUR).toISOString(),
    to: now,
    posts: recent.length,
    channels: new Set(recent.map((p) => p.sourceId)).size,
    categories,
    topStories: topStories.slice(0, 10),
    writing: { basis: 'naver-blog', stats, guide: writingGuide(stats) },
  };
}

module.exports = { buildTrends, titleStats, writingGuide, WINDOW_HOURS };
