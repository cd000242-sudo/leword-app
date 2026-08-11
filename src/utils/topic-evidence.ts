/**
 * "이 키워드가 정말 그 주제의 말인가" — 화면에서 읽은 글자로 되짚는다.
 *
 * ## 무엇이 잘못됐나 (실측, 2026-08-11)
 *
 * 선점 보드에 '노트북받침대 비교' 가 **문학·책** 으로 실렸다. 경로는 이렇다:
 *
 *   씨앗 '독서대 추천'(문학·책)
 *     → 검색광고 연관어가 '노트북받침대' 를 물어옴        ← **여기서 샜다**
 *     → 자동완성이 '노트북받침대 비교' 를 물어옴
 *     → 이탈 검사(seed-drift)는 '노트북받침대' 기준이라 통과
 *
 * 이탈 검사는 3단계(자동완성)에만 걸려 있고, 1단계(연관어 → 확장 씨앗)에는
 * 아무것도 없다. 그래서 씨앗이 이미 남의 주제로 건너간 뒤에는 아래 단계가
 * 아무리 엄격해도 되돌릴 수가 없다.
 *
 * ## 왜 씨앗 단계에서 글자로 막지 않나
 *
 * seed-drift.ts 에 적힌 결론이 그대로 적용된다 — 한국어 복합어의 꼬리는
 * 구조가 같아서('강아지사료'의 '사료' vs '마키나락스'의 '락스') 글자로는
 * 같은 말과 남남을 못 가른다. 연관어에 같은 검사를 걸면 '독후감 쓰는법'
 * → '독서감상문' 같은 **정상 확장까지 죽는다**.
 *
 * ## 그래서 화면을 본다
 *
 * 씨앗 단계에서 못 가르는 이유는 재료가 **압축된 키워드 한 줄**뿐이기 때문이다.
 * SERP 를 태우고 나면 재료가 달라진다 — 사람이 **띄어 써서** 지은 제목과
 * 상품명이 생긴다. '노트북 받침대 추천' 의 낱말은 노트북 / 받침대 / 추천 이고,
 * 여기에는 '노트' 라는 낱말이 없다. 씨앗 단계에서 불가능하던 낱말 경계가
 * 여기서는 존재한다. 이 모듈은 그 차이만 이용한다.
 *
 * 재료는 전부 serp-meaning 이 화면에서 읽어 온 것이다 — 우리가 지어내지 않는다.
 *
 * ## 판정은 셋뿐이다. 새 분류기를 만들지 않는다.
 *
 *   supported    주장한 주제의 고유 낱말이 화면에 있다        → 그대로 둔다
 *   reassigned   주장한 주제는 흔적이 없고, 다른 주제 하나만  → 그 주제로 옮긴다
 *                고유 낱말 2개 이상으로 뚜렷하다
 *   unlabeled    어느 쪽도 아니다                            → '주제 선택 안 함'
 *   insufficient 화면을 못 읽었다(차단·빈 응답)              → 건드리지 않는다
 *
 * 애매하면 찍지 않고 '주제 선택 안 함' 으로 내린다. 주제를 잘못 고른 글은
 * 애초에 다른 독자 앞에 서므로(naver-blog-topics.ts), 틀린 라벨은 빈 라벨보다 나쁘다.
 */
import { BLOG_TOPIC_COVERAGE } from './blog-topic-coverage';
import { NAVER_BLOG_TOPIC_NONE } from './naver-blog-topics';
import type { SerpMeaning } from './serp-meaning';

/** 낱말 그대로 맞출 때의 최소 길이. 한 글자는 무엇에나 걸린다. */
const MIN_EXACT_LENGTH = 2;

/**
 * 낱말 **머리**로 맞출 때의 최소 길이.
 *
 * 자동완성·연관어는 공백을 지운 채 온다('강아지사료', '공기청정기필터').
 * 그것들까지 살리려면 머리 일치가 필요한데, 두 글자로 열면 '노트북받침대' 가
 * '노트'(문학·책)에 걸려 이 모듈이 고치려던 오염을 스스로 만든다.
 * 세 글자부터만 머리 일치를 허용한다 — '독서대추천' 은 살고 '노트북' 은 안 걸린다.
 */
const MIN_PREFIX_LENGTH = 3;

/** 다른 주제로 옮기려면 요구하는 고유 낱말 수. 하나로는 우연히 걸린다. */
const REASSIGN_MIN_HITS = 2;

export type TopicVerdictKind = 'supported' | 'reassigned' | 'unlabeled' | 'insufficient';

export interface TopicVerdict {
  kind: TopicVerdictKind;
  /** 화면에 쓸 최종 주제. unlabeled 면 '주제 선택 안 함'. */
  topic: string;
  /** 사람이 읽을 근거. 전부 실측 사실이다. */
  reason: string;
  /** 주장한 주제의 고유 낱말 중 화면에서 본 것. */
  claimedHits: string[];
  /** 옮겨간 주제의 고유 낱말 중 화면에서 본 것. */
  reassignedHits: string[];
}

function normalize(text: string): string {
  return String(text || '').toLowerCase();
}

/** 공백·문장부호로 자른다. 사람이 쓴 제목에는 낱말 경계가 있다. */
export function evidenceTokens(text: string): string[] {
  return normalize(text)
    .split(/[^0-9a-z가-힣]+/)
    .filter((token) => token.length >= MIN_EXACT_LENGTH);
}

/**
 * 주제 고유 낱말표.
 *
 * 재료는 커버리지 표의 씨앗어·의도어뿐이다 — 여기서 새 어휘를 지어내지 않는다.
 * **두 주제 이상이 쓰는 낱말은 버린다.** '추천'·'비교'·'후기' 같은 것들이 그렇고,
 * 그런 낱말은 어느 주제의 증거도 되지 못한다(오히려 전부를 통과시킨다).
 */
function buildVocabulary(): Map<string, string> {
  const owners = new Map<string, Set<string>>();
  for (const entry of BLOG_TOPIC_COVERAGE) {
    for (const term of [...entry.seedTerms, ...entry.seedIntents]) {
      for (const token of evidenceTokens(term)) {
        if (!owners.has(token)) owners.set(token, new Set());
        owners.get(token)!.add(entry.topic);
      }
    }
  }
  const vocabulary = new Map<string, string>();
  for (const [token, topics] of owners) {
    if (topics.size === 1) vocabulary.set(token, [...topics][0]);
  }
  return vocabulary;
}

let cachedVocabulary: Map<string, string> | null = null;

/** 낱말 → 그 낱말을 혼자 쓰는 주제. 커버리지 표에서 파생되므로 표가 바뀌면 따라간다. */
export function distinctiveVocabulary(): Map<string, string> {
  if (!cachedVocabulary) cachedVocabulary = buildVocabulary();
  return cachedVocabulary;
}

export interface TopicEvidenceInput {
  keyword: string;
  /** 후보를 만들 때 붙었던 주제. 이게 맞는지가 판정 대상이다. */
  claimedTopic: string;
  /** serp-meaning 이 화면에서 읽어 온 재료. 없으면 판정하지 않는다. */
  meaning?: Partial<SerpMeaning> | null;
  /** 상위 글 제목. meaning.topTitles 와 겹쳐도 무방하다(중복은 낱말 단위로 접힌다). */
  topTitles?: string[] | null;
}

/** 화면에서 읽은 글자를 한 덩어리로 모은다. */
function gatherEvidence(input: TopicEvidenceInput): string[] {
  const meaning = input.meaning || {};
  return [
    ...(meaning.citedTitles || []),
    ...(meaning.questions || []),
    ...(meaning.topTitles || []),
    ...(meaning.productNames || []),
    ...(input.topTitles || []),
  ].filter((line) => Boolean(line && String(line).trim()));
}

/** 증거 낱말 하나가 어느 주제를 가리키는지. 없으면 null. */
function topicForToken(token: string, vocabulary: Map<string, string>): string | null {
  const exact = vocabulary.get(token);
  if (exact) return exact;
  /*
   * 낱말 머리 일치. '강아지사료' 가 '강아지' 를, '공기청정기필터' 가 '공기청정기' 를
   * 물고 있는 경우다. 꼬리 일치는 쓰지 않는다 — 그게 '마키나락스/락스' 오염의 통로다.
   *
   * 여러 개가 걸리면 **가장 긴 것**을 택한다. Map 순서에 맡기면 커버리지 표에
   * 씨앗을 추가하는 것만으로 판정이 바뀐다.
   */
  let bestVocab = '';
  let bestTopic: string | null = null;
  for (const [vocab, topic] of vocabulary) {
    if (vocab.length < MIN_PREFIX_LENGTH || !token.startsWith(vocab)) continue;
    if (vocab.length > bestVocab.length) {
      bestVocab = vocab;
      bestTopic = topic;
    }
  }
  return bestTopic;
}

export function judgeTopicByEvidence(input: TopicEvidenceInput): TopicVerdict {
  const claimedTopic = String(input.claimedTopic || '').trim();
  const lines = gatherEvidence(input);

  /*
   * 못 본 것과 없는 것을 섞지 않는다.
   *
   * Bright Data 가 막히거나 빈 문서를 돌려주면 재료가 0줄이 된다. 그때 주제를
   * 내리면 "화면을 못 읽었다" 가 "주제가 틀렸다" 로 둔갑한다.
   * 키워드 한 줄만으로는 판정하지 않는다 — 그건 씨앗 단계에서 이미 실패한 방법이다.
   */
  if (lines.length === 0) {
    return {
      kind: 'insufficient',
      topic: claimedTopic,
      reason: '검색결과를 읽지 못해 주제를 되짚지 않았다',
      claimedHits: [],
      reassignedHits: [],
    };
  }

  const vocabulary = distinctiveVocabulary();
  const tokens = new Set<string>();
  // 키워드도 증거에 넣는다. 다만 **혼자서는** 판정하지 않는다(위 insufficient).
  for (const token of evidenceTokens(input.keyword)) tokens.add(token);
  for (const line of lines) {
    for (const token of evidenceTokens(line)) tokens.add(token);
  }

  const hitsByTopic = new Map<string, Set<string>>();
  for (const token of tokens) {
    const topic = topicForToken(token, vocabulary);
    if (!topic) continue;
    if (!hitsByTopic.has(topic)) hitsByTopic.set(topic, new Set());
    hitsByTopic.get(topic)!.add(token);
  }

  const claimedHits = [...(hitsByTopic.get(claimedTopic) || [])];
  if (claimedHits.length > 0) {
    return {
      kind: 'supported',
      topic: claimedTopic,
      reason: `검색결과에 ${claimedTopic}의 말이 있다: ${claimedHits.join(' · ')}`,
      claimedHits,
      reassignedHits: [],
    };
  }

  /*
   * 주장한 주제의 흔적이 없다. 여기서 다른 주제로 옮기는 건 **뚜렷할 때만** 한다.
   * 고유 낱말 하나는 우연히 걸린다 — 제목 한 줄이 곁가지로 언급했을 수 있다.
   */
  const others = [...hitsByTopic.entries()]
    .filter(([topic]) => topic !== claimedTopic)
    .map(([topic, hits]) => ({ topic, hits: [...hits] }))
    .sort((a, b) => b.hits.length - a.hits.length);

  const best = others[0];
  const contested = others.length > 1 && others[1].hits.length === best?.hits.length;
  if (best && best.hits.length >= REASSIGN_MIN_HITS && !contested) {
    return {
      kind: 'reassigned',
      topic: best.topic,
      reason: `${claimedTopic}의 말은 없고 ${best.topic}의 말만 있다: ${best.hits.join(' · ')}`,
      claimedHits: [],
      reassignedHits: best.hits,
    };
  }

  return {
    kind: 'unlabeled',
    topic: NAVER_BLOG_TOPIC_NONE,
    reason: `검색결과에서 ${claimedTopic}의 말을 찾지 못했다`,
    claimedHits: [],
    reassignedHits: [],
  };
}
