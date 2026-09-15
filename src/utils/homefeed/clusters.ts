/**
 * 유사 제목 묶음(포화) · 각도(ANGLE GAP) · 정보층(REVEAL DEPTH).
 *
 * 모든 표본 제목에는 이슈 기준어가 들어 있어 그대로 비교하면 전부 닮아 보인다 — 기준어 토큰을 빼고 자카드로 묶는다(union-find).
 * 각도 · 정보층은 실제 표본 제목에 있는 말로만 만들고, 근거 제목 · 주소를 함께 싣는다.
 */
import type { HomefeedAngle, HomefeedEvidenceRef, HomefeedRevealLayer, HomefeedSample } from './types';
import { EVENT_FACT_RE } from './lexicon';
import { compactKey, jaccard, normalizeTitle, normalizeToken, numberTokens, quoteSpans, surfaceToken, titleTokens, withoutTokens } from './text';

export interface TitleCluster {
  /** 표본 번호(입력 순서). */
  members: number[];
  /** 묶음 과반 제목에 있는 토큰(기준어 제외). */
  tokens: string[];
}

export function evidenceOf(sample: Pick<HomefeedSample, 'title' | 'url' | 'press' | 'publishedAt'>): HomefeedEvidenceRef {
  return { title: sample.title, url: sample.url, press: sample.press, publishedAt: sample.publishedAt };
}

export function clusterSamples(samples: readonly HomefeedSample[], anchorTokens: ReadonlySet<string>, threshold: number): TitleCluster[] {
  const sets = samples.map((sample) => withoutTokens(titleTokens(sample.title), anchorTokens));
  const keys = samples.map((sample) => compactKey(normalizeTitle(sample.title)));
  const parent = samples.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    return root;
  };
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const similarity = jaccard(sets[i], sets[j]);
      const same = similarity === null ? keys[i] === keys[j] && keys[i] !== '' : similarity >= threshold;
      if (same) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, number[]>();
  samples.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  return [...groups.values()]
    .map((members) => {
      const counts = new Map<string, number>();
      for (const member of members) for (const token of sets[member]) counts.set(token, (counts.get(token) ?? 0) + 1);
      const need = Math.ceil(members.length / 2);
      return { members, tokens: [...counts.entries()].filter(([, count]) => count >= need).map(([token]) => token) };
    })
    .sort((a, b) => b.members.length - a.members.length || a.members[0] - b.members[0]);
}

export function saturationOf(clusters: readonly TitleCluster[], sampleN: number): { sampleN: number; cloneN: number | null; cloneRatio: number | null } {
  if (sampleN === 0) return { sampleN, cloneN: null, cloneRatio: null };
  const cloneN = clusters[0]?.members.length ?? 0;
  return { sampleN, cloneN, cloneRatio: Math.round((cloneN / sampleN) * 1000) / 1000 };
}

function isFactToken(token: string, quotes: readonly string[]): boolean {
  if (/\d/.test(token)) return true;
  if (new RegExp(EVENT_FACT_RE.source, 'u').test(token)) return true;
  return quotes.some((quote) => quote.toLowerCase().includes(token));
}

export function anglesOf(
  samples: readonly HomefeedSample[],
  clusters: readonly TitleCluster[],
  anchorTokens: ReadonlySet<string>,
): { dominant: HomefeedAngle | null; alternatives: HomefeedAngle[]; confidence: 'high' | 'medium' | 'low' } {
  if (clusters.length === 0 || samples.length === 0) return { dominant: null, alternatives: [], confidence: 'low' };
  const top = clusters[0];
  const dominantUnion = new Set<string>();
  for (const member of top.members) for (const token of withoutTokens(titleTokens(samples[member].title), anchorTokens)) dominantUnion.add(token);
  const topTitles = top.members.map((member) => samples[member].title);
  const dominantTokens = (top.tokens.length > 0 ? top.tokens : [...dominantUnion]).map((token) => surfaceToken(token, topTitles));
  const dominant: HomefeedAngle = {
    label: dominantTokens.slice(0, 4).join(' ') || normalizeTitle(samples[top.members[0]].title).slice(0, 30),
    tokens: dominantTokens.slice(0, 8),
    evidence: top.members.slice(0, 3).map((member) => evidenceOf(samples[member])),
  };

  const alternatives: HomefeedAngle[] = [];
  const seenLabels = new Set<string>();
  for (const cluster of clusters.slice(1)) {
    const quotes = cluster.members.flatMap((member) => quoteSpans(samples[member].title));
    const own = cluster.tokens.length > 0
      ? cluster.tokens
      : [...withoutTokens(titleTokens(samples[cluster.members[0]].title), anchorTokens)];
    const distinct = own.filter((token) => !dominantUnion.has(token));
    const facts = distinct.filter((token) => isFactToken(token, quotes));
    if (facts.length === 0 && distinct.length < 2) continue;
    const memberTitles = cluster.members.map((member) => samples[member].title);
    const tokens = (facts.length > 0 ? facts : distinct).slice(0, 3).map((token) => surfaceToken(token, memberTitles));
    const label = tokens.join(' ');
    const key = compactKey(label);
    if (!key || seenLabels.has(key)) continue;
    seenLabels.add(key);
    alternatives.push({ label, tokens, evidence: cluster.members.slice(0, 2).map((member) => evidenceOf(samples[member])) });
    if (alternatives.length >= 5) break;
  }

  const altPress = new Set(alternatives.flatMap((angle) => angle.evidence.map((ref) => ref.press).filter(Boolean)));
  const confidence = samples.length >= 10 && altPress.size >= 2 ? 'high' : samples.length >= 5 ? 'medium' : 'low';
  return { dominant, alternatives, confidence };
}

/** 정보층 — 숫자 · 인용 · 사건 사실 말. 같은 값의 재표현은 한 층으로 접는다. 기준어에 든 숫자는 층이 아니다. */
export function revealLayersOf(samples: readonly HomefeedSample[], anchor: string, max = 8): HomefeedRevealLayer[] {
  const anchorNumbers = new Set(numberTokens(anchor));
  const anchorTokens = titleTokens(anchor);
  const seen = new Set<string>();
  const layers: HomefeedRevealLayer[] = [];
  const push = (kind: HomefeedRevealLayer['kind'], value: string, sample: HomefeedSample) => {
    // 종류가 달라도 같은 값이면 한 층이다 — "300억"이 숫자로도 인용으로도 잡힌다.
    const key = compactKey(kind === 'event' ? normalizeToken(value) : value);
    if (!value || seen.has(key) || layers.length >= max) return;
    seen.add(key);
    layers.push({ kind, value, evidence: evidenceOf(sample) });
  };
  for (const sample of samples) {
    for (const token of numberTokens(sample.title)) {
      if (anchorNumbers.has(token) || /^\d{4}(?:년)?$/.test(token) || !/\D/.test(token.replace(/[.,]/g, ''))) continue;
      push('number', token, sample);
    }
    for (const quote of quoteSpans(sample.title)) push('quote', quote, sample);
    for (const match of normalizeTitle(sample.title).matchAll(new RegExp(EVENT_FACT_RE.source, 'gu'))) {
      if (!anchorTokens.has(normalizeToken(match[0]))) push('event', match[0], sample);
    }
  }
  return layers;
}
