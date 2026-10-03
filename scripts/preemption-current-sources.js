'use strict';

// Current sources nominate keywords, never search-volume numbers or golden grades.
const compact = (value) => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
const fresh = (value, nowMs, days) => {
  const at = Date.parse(String(value || ''));
  return Number.isFinite(at) && at <= nowMs && nowMs - at <= days * 86400000;
};
const fieldTopic = {
  '지원금·복지': '비즈니스·경제', '비즈니스·경제': '비즈니스·경제',
  '비즈니스·소상공인': '비즈니스·경제', '경제·금융': '비즈니스·경제',
  '생활경제·부동산': '비즈니스·경제',
  '비즈니스': '비즈니스·경제', '경제': '비즈니스·경제', '부동산·주거': '비즈니스·경제',
  '생활경제': '비즈니스·경제', '정책': '사회·정치', '사회·정치': '사회·정치',
  '생활경제·주거': '비즈니스·경제', '정책·사회·법률': '사회·정치',
  'AI·IT·전자기기·앱': 'IT·컴퓨터', '국내여행·로컬·시즌': '국내여행',
  '연예·OTT·영화·문화': '스타·연예인', '반려동물': '반려동물',
  'IT·컴퓨터': 'IT·컴퓨터', 'AI': 'IT·컴퓨터', '건강': '건강·의학',
  '스포츠': '스포츠', '연예': '스타·연예인', '국내여행': '국내여행',
};
const moneyKeyword = /지원금|장려금|보조금|정책자금|소상공인|금리|대출|청약|연금|세금|세액|부가세|환급|고용|물가|경제|부동산|전세|월세/;
const knownTopic = (field) => typeof field === 'string' && Object.prototype.hasOwnProperty.call(fieldTopic, field) ? fieldTopic[field] : null;
// Benchmark titles are discovery evidence, never verified policy claims. Extract
// only economic nouns actually present in each dated source; do not reuse the
// card's relatedKeywords (often sentence fragments from a different source).
function benchmarkTerms(title) {
  if (typeof title !== 'string') return [];
  const broad = new Set(['지원금', '장려금', '보조금', '정책자금', '연금', '세액공제', '소득공제', '부가세', '환급금', '배당금', '상품권', '지역화폐', '청약']);
  return [...new Set(title.match(/[가-힣A-Za-z0-9]{0,10}(?:지원금|장려금|보조금|정책자금|연금|세액공제|소득공제|부가세|환급금|배당금|상품권|지역화폐|청약|전세대출|주택대출|대출금리|예금금리|적금금리)/g) || [])]
    .filter(term => !broad.has(term));
}
function sourceForExpansion(source, keyword) {
  // Search-ad "related" is not proof that an article covers that other entity.
  return source && compact(source.keyword) && compact(keyword).includes(compact(source.keyword)) ? source : null;
}
function collectCurrentSeeds({ briefs, signals, benchmarks, nowMs = Date.now() } = {}) {
  const rows = [];
  const seen = new Set();
  const groups = new Map();
  function add(keyword, topic, kind, sourceAt, sourceUrl, group = kind, extra = {}) {
    if (typeof keyword !== 'string') return;
    const text = keyword.replace(/\s+/g, ' ').trim();
    const key = compact(text);
    if (!topic || key.length < 2 || key.length > 15 || seen.has(key)) return;
    seen.add(key);
    rows.push({ keyword:text, topic, kind, sourceAt, sourceUrl, ...extra });
    groups.set(key, group);
  }
  const briefRows = [];
  // Daily output contains only the newest round at the top level. Earlier rounds
  // still nominate candidates, but freshness always comes from the source date.
  const allBriefs = [
    ...(Array.isArray(briefs?.briefs) ? briefs.briefs : []),
    ...(Array.isArray(briefs?.rounds) ? briefs.rounds : []).flatMap(round => Array.isArray(round?.briefs) ? round.briefs : []),
  ];
  for (const brief of allBriefs) {
    if (!brief || typeof brief !== 'object') continue;
    const facts = (Array.isArray(brief.facts) ? brief.facts : [])
      .filter(f => fresh(f?.publishedAt, nowMs, 7) && /^https?:\/\//.test(String(f.link || '')))
      .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    if (!facts.length) continue;
    const topic = knownTopic(brief.field) || (moneyKeyword.test(brief.coreKeyword || '') ? '비즈니스·경제' : null);
    briefRows.push({ brief, topic, fact:facts[0] });
  }
  briefRows.sort((a, b) => Date.parse(b.fact.publishedAt) - Date.parse(a.fact.publishedAt));
  // Give different articles a first pass before filling slots with related terms.
  for (const related of [false, true]) {
    for (const {brief, topic, fact} of briefRows) {
      for (const word of related ? (Array.isArray(brief.keywords) ? brief.keywords : []) : [brief.coreKeyword]) {
        add(typeof word === 'string' ? word : word?.keyword, topic, 'current-brief', fact.publishedAt, fact.link, brief.field);
      }
    }
  }
  const benchmarkSources = (Array.isArray(benchmarks?.candidates) ? benchmarks.candidates : [])
    .filter(item => ['생활경제·주거', '비즈니스·경제', '지원금·복지', '생활경제·부동산'].includes(item?.category))
    .flatMap(item => Array.isArray(item.sources) ? item.sources : [])
    .filter(source => fresh(source?.publishedAt, nowMs, 7) && /^https?:\/\//.test(String(source.url || '')))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  for (const source of benchmarkSources) {
    for (const keyword of benchmarkTerms(source.title)) {
      add(keyword, '비즈니스·경제', 'current-benchmark', source.publishedAt, source.url, 'current-benchmark',
        { sourceTitle: source.title, discoveryOnly: true });
    }
  }
  if (fresh(signals?.collectedAt, nowMs, 1)) {
    for (const lane of Array.isArray(signals?.lanes) ? signals.lanes : []) {
      for (const item of Array.isArray(lane?.items) ? lane.items : []) {
        const keyword = item?.keyword;
        const topic = knownTopic(item?.topic) || (moneyKeyword.test(keyword || '') ? '비즈니스·경제' : null);
        add(keyword, topic, 'current-realtime', signals.collectedAt, 'https://signal.bz/');
      }
    }
  }
  // Realtime + support + business + economy each get turns within the same cap.
  const queues = new Map();
  for (const row of [...rows].sort((a,b) => Number(b.kind === 'current-realtime') - Number(a.kind === 'current-realtime'))) {
    const group = groups.get(compact(row.keyword));
    if (!queues.has(group)) queues.set(group, []);
    queues.get(group).push(row);
  }
  const ordered = [];
  for (let index=0; ordered.length < rows.length; index++) {
    for (const queue of queues.values()) if (queue[index]) ordered.push(queue[index]);
  }
  return ordered;
}

/*
 * 현재 이슈 씨앗은 기존 씨앗에 **더한다**, 대체하지 않는다(사장님 정정 2026-09-29).
 *
 * 09-28 판은 앞에 현재 씨앗을 넣고 existing.length 로 잘라, 뒤쪽 창고·계절 씨앗이
 * 그만큼 밀려났다 — "기존 발굴에서 비즈니스·경제 비중을 늘려달라"는 뜻은 창고
 * 몫을 지키면서 현재 이슈를 얹으라는 것이다. 늘어나는 호출은 주제당 최대 maxCurrent
 * 씨앗(연관어 1회 + 자동완성)뿐이고, 현재 씨앗이 없는 주제는 예전과 같다.
 */
function reserveCurrentSeeds(existing, current, maxCurrent = 12) {
  const seen = new Set();
  return [...current.slice(0, maxCurrent), ...existing].filter(word => {
    const key=compact(word); if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function prioritizeCurrentSample(sample, current, cap) {
  const seen = new Set();
  return [...current, ...sample].filter(row => {
    const key=compact(row.keyword); if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, Math.max(0, cap));
}
function exactMeasuredVolume(row) {
  if (row?.pcSearchVolumeLt10 === true || row?.mobileSearchVolumeLt10 === true) return null;
  const values = [row?.pcSearchVolume, row?.mobileSearchVolume];
  return values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    ? values[0] + values[1] : null;
}
module.exports = { collectCurrentSeeds, reserveCurrentSeeds, prioritizeCurrentSample, exactMeasuredVolume, sourceForExpansion };
