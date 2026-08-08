/**
 * 실시간 이슈 → 블로그 주제 · 제목 추천
 *
 * 왜 필요한가:
 *   초보자는 키워드를 받아도 "어느 주제로 올려야 하는지", "제목을 어떻게 달아야
 *   검색에 걸리는지" 를 모른다. 주제를 엉뚱하게 고르면 홈판 노출 경로 자체가
 *   막히고, 제목이 뭉뚱그려지면 검색에 안 걸린다.
 *
 * 지키는 선:
 *   1. 언론사 제목을 그대로 쓰지 않는다. 중복 콘텐츠로 SEO 에 해롭고
 *      남의 제목을 베끼는 것이다. 기사 제목은 "참고"로만 따로 넘긴다.
 *   2. 제목에 넣는 수치·상황어는 전부 기사에서 뽑은 것이다. 없는 숫자를
 *      만들지 않는다.
 *   3. 주제 분류가 애매하면 찍지 않고 null 을 돌려준다. 없는 주제를 권하면
 *      사용자가 고를 수 없고, 틀린 주제는 노출을 막는다.
 */
import { NAVER_BLOG_TOPICS, type NaverBlogTopic } from './naver-blog-topics';

export interface TitleSuggestion {
  /** 검색 유입용 — 키워드를 앞에 두고 구체 정보를 붙인다. */
  seoTitle: string;
  /** 홈판 노출용 — 클릭을 부르는 각도. */
  homeTitle: string;
  /** 네이버 블로그 주제. 확신이 없으면 null. */
  topic: NaverBlogTopic | null;
  /** 언론사가 실제로 쓴 제목. 베끼지 말고 각도만 참고하라는 용도. */
  referenceHeadlines: string[];
}

/** 주제 판별 신호. 네이버 32종 중 실시간 이슈에서 실제로 나오는 것만 둔다. */
const TOPIC_SIGNALS: Array<{ topic: string; re: RegExp }> = [
  { topic: '스포츠', re: /(야구|축구|골프|배구|농구|올림픽|월드컵|리그|경기|선수|감독|타율|적시타|홈런|안타|우승|KLPGA|MLB|KBO|프로야구)/ },
  { topic: '스타·연예인', re: /(배우|가수|아이돌|연예인|열애|결혼설|소속사|팬미팅|컴백|드라마 출연|예능)/ },
  { topic: '방송', re: /(방송|예능|시청률|출연진|편성|생중계|재방송)/ },
  { topic: '드라마', re: /(드라마|회차|시즌\s*\d|종영|첫 방송)/ },
  { topic: '영화', re: /(영화|개봉|박스오피스|감독판|관객수)/ },
  { topic: '음악', re: /(앨범|신곡|음원|콘서트|차트인|걸그룹|보이그룹|멤버 탈퇴|활동 중단)/ },
  { topic: '공연·전시', re: /(발레|무용|오페라|뮤지컬|전시회|미술관|국립극장|공연장)/ },
  { topic: '사회·정치', re: /(대통령|국회|의원|정당|장관|총리|검찰|경찰|법원|재판|구형|선고|수사|압수수색|스토킹|고소|기소|정책|여당|야당)/ },
  { topic: '비즈니스·경제', re: /(주가|증시|코스피|코스닥|환율|금리|유가|기름값|물가|분양|부동산|매출|영업이익|상장|투자|보조금|지원금)/ },
  { topic: '건강·의학', re: /(질병|증상|백신|감염|확진|병원|의료|건강검진|열사병|온열질환|식중독)/ },
  { topic: 'IT·컴퓨터', re: /(스마트폰|아이폰|갤럭시|반도체|인공지능|AI\b|앱\b|소프트웨어|해킹|출시)/ },
  { topic: '자동차', re: /(전기차|자동차|리콜|신차|주행|현대차|기아)/ },
  { topic: '교육·학문', re: /(수능|입시|대학|학교|교사|학생|박람회|모의고사|등록금)/ },
  { topic: '맛집', re: /(맛집|식당|메뉴 출시|카페 오픈)/ },
  { topic: '국내여행', re: /(축제|여행지|관광|피서|해수욕장|캠핑장)/ },
  { topic: '게임', re: /(게임|출시일|업데이트 패치|e스포츠|리그오브레전드)/ },
];

/** 날씨·재난처럼 전용 주제가 없는 것은 생활 쪽으로 본다. */
const DAILY_LIFE_RE = /(날씨|폭염|한파|장마|태풍|호우|가뭄|무더위|지진|산불|미세먼지|정전)/;

const TOPIC_BY_LABEL = new Map(NAVER_BLOG_TOPICS.map((t) => [t.label, t]));

/**
 * 주제를 고른다. 신호가 하나도 안 걸리면 null — 찍지 않는다.
 */
export function suggestTopic(keyword: string, facts: string[]): NaverBlogTopic | null {
  const key = String(keyword || '');

  // 1순위: 키워드 자체에 걸린 신호. 가장 신뢰할 수 있다.
  for (const signal of TOPIC_SIGNALS) {
    if (signal.re.test(key)) return TOPIC_BY_LABEL.get(signal.topic) || null;
  }
  if (DAILY_LIFE_RE.test(key)) return TOPIC_BY_LABEL.get('일상·생각') || null;

  // 2순위: 기사 본문. 곁가지 주제가 섞이므로 한 번 걸린 것으로는 판단하지 않는다.
  // (아이돌 기사에 '활동/무대' 가 있다고 스포츠로, 발레 기사에 '투자' 가 있다고
  //  비즈니스로 보내면 홈판 노출이 엉뚱한 데로 간다 — 실제로 그렇게 틀렸다.)
  const corpus = facts.join(' ');
  const hits = TOPIC_SIGNALS
    .map((signal) => ({
      topic: signal.topic,
      count: (corpus.match(new RegExp(signal.re.source, 'g')) || []).length,
    }))
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.count - a.count);
  if (hits.length > 0) {
    const top = hits[0] as { topic: string; count: number };
    const runnerUp = hits[1];
    // 1·2위가 비등하면 어느 쪽인지 모른다 — 찍지 않는다.
    if (!runnerUp || top.count > runnerUp.count) return TOPIC_BY_LABEL.get(top.topic) || null;
    return null;
  }
  if ((corpus.match(new RegExp(DAILY_LIFE_RE.source, 'g')) || []).length >= 2) {
    return TOPIC_BY_LABEL.get('일상·생각') || null;
  }
  return null;
}

/**
 * 사실 문장에서 제목에 쓸 짧은 구체 어구를 뽑는다.
 * 숫자가 붙은 표현이 검색에도 걸리고 클릭도 부른다.
 */
/**
 * 조사·어미로 끝나는 꼬리를 잘라 명사구로 만든다.
 *
 * 문장 중간을 그냥 자르면 "5인 체제로 활동하게", "33도 안팎을 기록하며" 처럼
 * 조사와 연결어미가 매달린 채로 제목에 들어가 비문이 된다. 실제로 그렇게 나왔다.
 */
const DANGLING_TAIL_RE = /(을|를|이|가|은|는|에|에서|으로|로|와|과|의|도|만|께|한테|보다)$/;
const DANGLING_VERB_RE = /(하며|하고|하게|해서|하여|되며|되고|된|한|할|하는|있는|없는|이며|이고)$/;

function toNounPhrase(raw: string): string {
  let tokens = raw.trim().split(/\s+/);
  // 끝에서부터 연결어미·조사로 끝나는 토큰을 걷어낸다.
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1] as string;
    if (DANGLING_VERB_RE.test(last)) { tokens = tokens.slice(0, -1); continue; }
    const trimmed = last.replace(DANGLING_TAIL_RE, '');
    if (trimmed.length === 0) { tokens = tokens.slice(0, -1); continue; }
    if (trimmed !== last) tokens = [...tokens.slice(0, -1), trimmed];
    break;
  }
  return tokens.join(' ').trim();
}

/**
 * 제목에 붙일 수 있는 어구는 화이트리스트로만 받는다.
 *
 * 문장에서 뽑은 조각을 넓게 허용하면 "12주째 하락세를 이어갔다", "14m짜리 버디를
 * 성공시키며" 처럼 서술어가 딸려 와 비문이 된다. 꼬리를 자르는 방식으로는
 * 고칠 때마다 새 예외가 나온다("이어갔다", "시키며", "되면서"…).
 * 그래서 반대로, 수치+단위 명사구라는 확실한 모양만 통과시킨다.
 * 못 뽑으면 억지로 붙이지 않고 기본형 제목으로 간다 — 밋밋한 게 비문보다 낫다.
 */
/** 수치 단위. '일' 은 뺐다 — 거의 전부 날짜라 제목에 넣으면 "18일 윤혜진" 이 된다. */
const SAFE_UNIT = '회|주|년|개월|명|인|점|타점|도|억|억원|만원|원|%|m|㎞|km|위|승|패|골|세|번|차|호|라운드';
/** 수치 뒤에 붙여도 되는 명사. 화이트리스트가 아니면 서술어가 새어 들어온다("4.6원 하락했다"). */
const SAFE_SUFFIX = '연속|체제|안팎|이하|이상|버디|기록|우승|준우승|차이|간격|규모|수준';
const SAFE_DETAIL_RE = new RegExp(`^\\d+(?:[.,]\\d+)?\\s*(?:${SAFE_UNIT})(?:\\s*(?:${SAFE_SUFFIX}))?$`);

/** 제목에서 빼는 게 나은 것들 — 시각·날짜는 검색 의도와 무관하다. */
const NOISE_DETAIL_RE = /(시\s*\d+분|오전|오후|^\d+일|^\d{4}$)/;

function pickDetailPhrase(facts: string[]): string {
  const phrases: Array<{ text: string; score: number }> = [];
  for (const fact of facts) {
    // "2타점 적시타", "12주 연속", "33도 안팎", "5인 체제" 같은 수치+명사 덩어리
    for (const m of fact.matchAll(/\d+(?:[.,]\d+)?\s*[가-힣A-Za-z%㎞]{1,6}(?:\s+[가-힣]{2,6})?/g)) {
      const text = toNounPhrase(m[0]);
      if (text.length < 3 || text.length > 16) continue;
      if (NOISE_DETAIL_RE.test(text)) continue;
      if (!SAFE_DETAIL_RE.test(text)) continue;
      phrases.push({
        text,
        score: text.length + (/(연속|타점|만루|우승|하락|상승|기록|억|만원|%|체제)/.test(text) ? 6 : 0),
      });
    }
  }
  phrases.sort((a, b) => b.score - a.score);
  return phrases.length > 0 ? (phrases[0] as { text: string }).text : '';
}

/** 사실에서 "무엇을 했는가" 서술어를 뽑는다. */
function pickAction(facts: string[]): string {
  const actions = ['결승타', '역전', '우승', '신기록', '하락', '상승', '구형', '선고', '압수수색', '점검', '단비', '폭염'];
  const joined = facts.join(' ');
  return actions.find((a) => joined.includes(a)) || '';
}

function trimTitle(value: string, max: number): string {
  const clean = value.replace(/\s{2,}/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

/**
 * 제목 두 종을 만든다.
 * 언론사 제목은 재료로 쓰지 않는다 — 그대로 베끼면 중복 콘텐츠가 된다.
 */
export function suggestTitles(
  keyword: string,
  facts: string[],
  headlines: string[] = [],
): TitleSuggestion {
  const key = String(keyword || '').trim();
  const rawDetail = pickDetailPhrase(facts);
  // 키워드에 이미 들어있는 정보를 또 붙이지 않는다.
  // ("기름값 12주 하락" + "12주 연속" → "기름값 12주 하락 12주 연속 하락 총정리")
  const keyCompact = key.replace(/\s+/g, '');
  const detail = rawDetail && !keyCompact.includes(rawDetail.split(/\s+/)[0] as string)
    ? rawDetail
    : '';
  const rawAction = pickAction(facts);
  const action = rawAction && !key.includes(rawAction) ? rawAction : '';

  // SEO — 키워드를 앞에 두고 구체 정보를 붙인다. 검색어와 제목이 앞에서 겹쳐야 걸린다.
  // 붙일 구체 정보가 없으면 억지로 만들지 않고 키워드 + 총정리로 끝낸다.
  const seoDetail = [detail, action && !detail.includes(action) ? action : '']
    .filter(Boolean)
    .join(' ');
  const seoTitle = trimTitle(seoDetail ? `${key} ${seoDetail} 총정리` : `${key} 총정리`, 40);

  // 홈판 — 검색어보다 "왜 봐야 하는가" 가 앞선다.
  const homeTitle = trimTitle(
    detail ? `${key}, ${detail} 무슨 일인가` : `${key}, 지금 무슨 일인가`,
    40,
  );

  return {
    seoTitle,
    homeTitle,
    topic: suggestTopic(key, facts),
    referenceHeadlines: headlines.slice(0, 3),
  };
}
