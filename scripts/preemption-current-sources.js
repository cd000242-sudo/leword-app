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
  'IT·컴퓨터': 'IT·컴퓨터', 'AI': 'IT·컴퓨터', '건강': '건강·의학',
  '스포츠': '스포츠', '연예': '스타·연예인', '국내여행': '국내여행',
};
const moneyKeyword = /지원금|장려금|보조금|정책자금|소상공인|금리|대출|청약|연금|세금|세액|부가세|환급|고용|물가|경제|부동산|전세|월세/;
function collectCurrentSeeds({ briefs, signals, nowMs = Date.now() } = {}) {
  const rows = [];
  const seen = new Set();
  const groups = new Map();
  function add(keyword, topic, kind, sourceAt, sourceUrl, group = kind) {
    if (typeof keyword !== 'string') return;
    const text = keyword.replace(/\s+/g, ' ').trim();
    const key = compact(text);
    if (!topic || key.length < 2 || key.length > 15 || seen.has(key)) return;
    seen.add(key);
    rows.push({ keyword:text, topic, kind, sourceAt, sourceUrl });
    groups.set(key, group);
  }
  const briefRows = [];
  for (const brief of Array.isArray(briefs?.briefs) ? briefs.briefs : []) {
    const facts = (Array.isArray(brief.facts) ? brief.facts : [])
      .filter(f => fresh(f?.publishedAt, nowMs, 7) && /^https?:\/\//.test(String(f.link || '')))
      .sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    if (!facts.length) continue;
    const topic = fieldTopic[brief.field] || (moneyKeyword.test(brief.coreKeyword || '') ? '비즈니스·경제' : null);
    briefRows.push({ brief, topic, fact:facts[0] });
  }
  // Give different articles a first pass before filling slots with related terms.
  for (const related of [false, true]) {
    for (const {brief, topic, fact} of briefRows) {
      for (const word of related ? (Array.isArray(brief.keywords) ? brief.keywords : []) : [brief.coreKeyword]) {
        add(word, topic, 'current-brief', fact.publishedAt, fact.link, brief.field);
      }
    }
  }
  if (fresh(signals?.collectedAt, nowMs, 1)) {
    for (const lane of Array.isArray(signals?.lanes) ? signals.lanes : []) {
      for (const item of Array.isArray(lane?.items) ? lane.items : []) {
        const keyword = item?.keyword;
        const topic = fieldTopic[item?.topic] || (moneyKeyword.test(keyword || '') ? '비즈니스·경제' : null);
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

// Replace slots inside the existing budget; do not enlarge source/API fan-out.
function reserveCurrentSeeds(existing, current, maxCurrent = 12) {
  const seen = new Set();
  return [...current.slice(0, maxCurrent), ...existing].filter(word => {
    const key=compact(word); if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, existing.length);
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
module.exports = { collectCurrentSeeds, reserveCurrentSeeds, prioritizeCurrentSample, exactMeasuredVolume };
