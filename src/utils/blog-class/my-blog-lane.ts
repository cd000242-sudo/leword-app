/**
 * 내 블로그에서 오늘 쓸 말을 찾는다 (2026-09-15).
 *
 * 사장님 "내 블로그 주소랑 지금 현재 내 블로그가 얼마나 최적화되어있는지를 알아야지
 * 오늘 것 고르기에서 너가 키워드를 찾아줄 수 있지 않니".
 *
 * 전에는 오늘 쓸 한 편이 여섯 판이 만든 후보를 내 크기로 **거르기만** 했다. 실측(사장님 블로그 9-13·9-14):
 *   주제 인테리어·DIY · 순위를 잰 검색어 62개 중 첫 페이지 2 · 11~30위 12
 *   여섯 판 후보 459개 중 인테리어·DIY 는 선점 보드 0 · 추천키워드 10(전부 검색량 수만~백만짜리 큰 말)
 *   → 세운 두 개가 'kaist 서울캠퍼스'·'kaist 입학처'였다.
 * 맞는 후보가 판에 없으면 아무리 걸러도 안 나온다. 그래서 **내 블로그가 붙어 본 말에서 출발해 새로 찾는다**:
 *   씨앗   = 내 글이 30위 안에 들었던 검색어(가까운 순)
 *   넓히기 = 검색광고 연관어(검색량이 같이 온다) + 자동완성(사람이 띄어 치는 모양 — 검색량은 따로 잰다)
 *   남기기 = 씨앗의 핵심 낱말이 들어 있고 · 검색량이 붙어 본 범위(100~최대) 안이고 · 이미 쓴 말이 아닌 것
 * 시험(2026-09-15, 씨앗 '타일 바닥 청소' 10위): 연관어 200 → 핵심 낱말 포함 142 → 범위 안 새 말 120.
 *
 * 여기 있는 것은 전부 순수 함수다 — 네트워크는 daily-pick 이 넣어 준다.
 */
import { BAND_FLOOR, NEAR_RANK, buildNearBand, isNear, isWon, type NearBand, type WonRow } from './envelope';
import { TITLE_EDGE_STOPS, titleWords } from './title-candidates';

/**
 * 핵심 낱말에서 뺄 말.
 * 꼬리말은 어느 주제에나 붙어서, 이게 겹친다고 같은 이야기가 아니다
 * ('타일 바닥 청소 방법'과 '다이어트 방법'이 '방법'으로 이어지면 안 된다).
 * 흔한 꾸밈말도 뺀다 — '비 오는 날'의 '오는'이 어휘가 되면 '다가오는 추석'까지 내 블로그 말이 된다.
 */
const NOT_CORE = new Set([
  '방법', '추천', '후기', '내돈내산', '효과', '가격', '비교', '사용법', '종류', '이유', '정리', '총정리',
  '꿀팁', '리뷰', '기준', '가이드', '순위', '뜻', '차이', '장단점', '브랜드', '제품', '구매',
  '오는', '가는', '좋은', '많은', '같은', '위한', '대한', '통한', '보는', '쓰는', '입은', '입는', '먹는',
  '사는', '아는', '모든', '다른', '요즘', '이번', '올해', '지금', '우리', '내가', '제일', '가장',
]);

const compact = (text: string): string => String(text || '').replace(/\s+/g, '').toLowerCase();
const KO = (value: number): string => value.toLocaleString('ko-KR');

/** 검색어 하나의 핵심 낱말 — 두 글자 이상이고, 꼬리말·꾸밈말·군더더기·숫자만이 아닌 것. */
export function coreWords(keyword: string): string[] {
  const out: string[] = [];
  for (const word of titleWords(keyword)) {
    const w = word.toLowerCase();
    if (w.length < 2 || /^\d+$/.test(w) || NOT_CORE.has(w) || TITLE_EDGE_STOPS.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

/** 30위 안에 붙어 본 행 — 가까운 순, 같은 순위면 검색량 큰 순. */
export function nearRows(rows: readonly WonRow[]): WonRow[] {
  return rows
    .filter(isNear)
    .slice()
    .sort((a, b) => ((a.blogRank as number) - (b.blogRank as number)) || ((b.searchVolume || 0) - (a.searchVolume || 0)));
}

/**
 * 긴 씨앗은 연관어가 거의 안 온다(시험: '베란다 청소 방법' → 1개). 핵심 낱말 둘로 줄여 한 번 더 묻는다.
 * 줄일 것이 없으면(이미 핵심 낱말 두 개 그대로면) null.
 */
export function shortenSeed(keyword: string): string | null {
  const words = coreWords(keyword);
  if (words.length < 2) return null;
  const short = words.slice(0, 2).join(' ');
  return compact(short) === compact(keyword) ? null : short;
}

export interface MyBlogProfile {
  /** 30위 안에 붙어 본 검색량 범위. 그런 기록이 없으면 null. */
  band: NearBand | null;
  /** 내 블로그 어휘 — 순위를 잰 검색어(= 내 글 제목에서 사람들이 실제로 치는 말)의 핵심 낱말. */
  vocabulary: string[];
  /** 이미 쓴 말 — 순위를 잰 검색어 전부(공백 뺀 소문자). 오늘 쓸 것에서 뺀다. */
  ownKeywords: Set<string>;
  /** 블로그 설정의 대표 주제(32주제). 모르면 null. */
  declaredTopic: string | null;
}

export interface ProfileSource {
  wonRows?: WonRow[] | null;
  snapshot?: { declaredTopic?: string | null } | null;
  /**
   * 글 전체에서 센 낱말(topic-profile). 없으면 예전과 똑같이 순위를 잰 검색어에서만 어휘를 만든다.
   * 순위는 최근 50편만 재므로, 이것이 없으면 452편이 다룬 이야기 대부분이 어휘에 없었다 — 그러면
   * 그 분야 후보가 관문(sharesVocabulary)에서 '내 이야기가 아니다'로 걸러졌다(2026-09-16).
   */
  topicProfile?: { words?: Array<{ word: string }>; recentWords?: Array<{ word: string }> } | null;
}

/** 내 크기 재기 기록에서 오늘 쓸 한 편이 쓸 것만 뽑는다. 순위를 잰 기록이 없으면 null. */
export function buildProfile(record: ProfileSource | null): MyBlogProfile | null {
  const rows = record && Array.isArray(record.wonRows) ? record.wonRows : [];
  if (rows.length === 0) return null;
  const vocabulary: string[] = [];
  // ① 순위를 잰 검색어의 낱말이 먼저다 — 실제로 붙어 본 말이라 근거가 가장 가깝다.
  for (const row of rows) {
    for (const word of coreWords(row.keyword)) {
      if (!vocabulary.includes(word)) vocabulary.push(word);
    }
  }
  // ② 그 뒤에 글 전체가 다룬 낱말(최근 것 먼저). 같은 말은 한 번만 — 앞자리를 흔들지 않는다.
  const topicWords = record && record.topicProfile
    ? [...(record.topicProfile.recentWords || []), ...(record.topicProfile.words || [])]
    : [];
  for (const entry of topicWords) {
    const word = String(entry && entry.word ? entry.word : '').trim();
    if (word.length >= 2 && !vocabulary.includes(word)) vocabulary.push(word);
  }
  const topic = record && record.snapshot && record.snapshot.declaredTopic ? String(record.snapshot.declaredTopic) : null;
  return {
    band: buildNearBand(rows),
    vocabulary,
    ownKeywords: new Set(rows.map((row) => compact(row.keyword)).filter(Boolean)),
    declaredTopic: topic,
  };
}

/** 후보가 내 블로그 어휘와 낱말을 나누나 — 붙여 쓴 말('화장실바닥청소')도 잡도록 공백을 뺀 채 본다. */
export function sharesVocabulary(keyword: string, vocabulary: readonly string[]): boolean {
  const text = compact(keyword);
  return vocabulary.some((word) => word.length >= 2 && text.includes(word));
}

export interface Expansion {
  keyword: string;
  searchVolume: number;
  /** 어느 씨앗에서 나왔나 — 카드가 왜 나왔는지 말할 수 있게. */
  seed: string;
  seedRank: number;
  via: '연관어' | '자동완성';
}

/**
 * 한 씨앗에서 받은 말 중 남길 것만. 순서는 검색량 큰 순(같으면 받은 순).
 * seen 은 여러 씨앗이 같이 쓰는 '이미 본 말' — 여기서 남긴 것을 더해 둔다.
 */
export function pickExpansions(
  seed: WonRow,
  items: ReadonlyArray<{ keyword: string; searchVolume: number | null }>,
  band: NearBand,
  seen: Set<string>,
  limit: number,
  via: Expansion['via'] = '연관어',
): Expansion[] {
  const words = coreWords(seed.keyword);
  const ordered = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => typeof item.searchVolume === 'number' && isFinite(item.searchVolume))
    .sort((a, b) => ((b.item.searchVolume as number) - (a.item.searchVolume as number)) || (a.i - b.i));
  const picked: Expansion[] = [];
  for (const { item } of ordered) {
    if (picked.length >= limit) break;
    const key = compact(item.keyword);
    if (!key || seen.has(key)) continue;
    const volume = item.searchVolume as number;
    if (volume < BAND_FLOOR || volume > band.volumeMax) continue;
    if (!words.some((word) => key.includes(word))) continue;
    seen.add(key);
    picked.push({
      keyword: String(item.keyword).trim(),
      searchVolume: volume,
      seed: seed.keyword,
      seedRank: seed.blogRank as number,
      via,
    });
  }
  return picked;
}

/** 씨앗마다 돌아가며 하나씩 — 연관어가 많은 씨앗 하나가 앞자리를 다 먹지 않게. */
export function interleave<T>(lists: ReadonlyArray<readonly T[]>): T[] {
  const out: T[] = [];
  const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

export interface BlogStateLine {
  text: string;
  /** 언제·어디서 잰 값인지 — 화면이 마우스를 올리면 보여 준다. */
  evidence: string;
}

export interface BlogStateSource {
  measuredAt?: string | null;
  card?: { headline?: string | null; lines?: Array<{ text: string; evidence?: string }> } | null;
  wonRows?: WonRow[] | null;
}

/**
 * '지금 내 블로그' — 잰 사실만 문장으로(사장님 2026-09-15 "잰 사실만 문장으로").
 *
 * 점수·지수를 만들지 않는다(예전에 정하신 '지어낸 지수 금지'). 사실 카드의 문장
 * (시작 시점·발행 리듬·방문자·이웃·주제·검색 허용)을 그대로 쓰고, 순위 실측 결과와
 * 오늘 찾을 검색량 범위만 덧붙인다.
 */
export function describeBlogState(record: BlogStateSource | null, band: NearBand | null): BlogStateLine[] {
  if (!record) return [];
  const when = record.measuredAt ? `${String(record.measuredAt).slice(0, 10)} 에 잰 값` : '잰 값';
  const lines: BlogStateLine[] = [];
  if (record.card && record.card.headline) lines.push({ text: String(record.card.headline), evidence: when });
  for (const line of (record.card && record.card.lines) || []) {
    lines.push({ text: String(line.text), evidence: String(line.evidence || when) });
  }
  const rows = Array.isArray(record.wonRows) ? record.wonRows : [];
  if (rows.length > 0) {
    const won = rows.filter(isWon).length;
    const near = rows.filter(isNear).length - won;
    lines.push({
      text: `검색어 ${KO(rows.length)}개로 내 순위를 재 봤고, 첫 페이지(10위 안) ${KO(won)}개 · 11~${NEAR_RANK}위 ${KO(near)}개였어요.`,
      evidence: when,
    });
  }
  lines.push(band
    ? { text: `오늘 쓸 것은 ${NEAR_RANK}위 안에 붙어 본 말들의 검색량(${KO(BAND_FLOOR)}~${KO(band.volumeMax)}) 안에서 찾아요.`, evidence: when }
    : { text: `아직 ${NEAR_RANK}위 안에 든 검색어가 없어 검색량으로는 못 거르고, 자리만 재서 골라요.`, evidence: when });
  return lines;
}
