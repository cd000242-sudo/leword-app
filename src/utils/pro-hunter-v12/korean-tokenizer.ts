// PRO Hunter v12 — 한국어 토크나이저 + 불용어 필터 (P0 #3)
// 작성: 2026-04-15
// 조사/어미/불용어를 걸러 TF-IDF 품질을 극적으로 향상

// 한국어 불용어 (상위 300+ 고빈도)
const STOPWORDS = new Set<string>([
  // 어미/조사/의존명사
  '있다', '없다', '하다', '되다', '같다', '이다', '아니다', '이런', '저런', '그런',
  '그리고', '하지만', '그러나', '그래서', '따라서', '또한', '이렇게', '저렇게', '그렇게',
  '많이', '조금', '정말', '진짜', '너무', '아주', '매우', '굉장히', '조금씩', '점점',
  '오늘', '어제', '내일', '지금', '나중', '먼저', '바로', '계속', '항상', '가끔',
  '이것', '저것', '그것', '여기', '저기', '거기', '뭐', '어떤', '어떻게', '왜', '어디',
  '저는', '제가', '저희', '우리', '당신', '여러분', '그대', '모두', '누구',
  '입니다', '습니다', '합니다', '됩니다', '이에요', '예요', '에요', '에서', '에게',
  '해서', '하면', '하고', '하는', '하지', '한번', '하나', '두번', '세번', '첫째',
  '대한', '대해', '위해', '통해', '대로', '만큼', '뿐만', '동안', '만약', '혹은',
  '경우', '때문', '부분', '시간', '이번', '다음', '이전', '이후', '순간', '사실',
  // 고빈도 동사 활용
  '있는', '있을', '있어', '있었', '있다고', '있습니다', '없는', '없이', '없다', '없어',
  '하는', '했던', '하던', '할', '한다', '한다고', '했다', '했어요', '하셨',
  '되는', '되어', '됐', '되고', '됐어요', '됐습니다',
  '같은', '같이', '같아', '같습니다',
  // 고빈도 형용사
  '좋은', '좋고', '좋다', '좋아', '좋습니다', '좋았', '좋아요',
  '나쁜', '나쁘', '나쁜데',
  '큰', '작은', '많은', '적은', '높은', '낮은',
  // 조사만
  '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '로', '으로', '만',
  '부터', '까지', '보다', '마다', '조차', '뿐', '밖에', '야', '라', '라고',
  // 접속/부사
  '더', '덜', '좀', '꼭', '또', '또한', '역시', '그저', '단지', '그냥', '그저', '이미', '아직',
  '혹시', '아마', '어쩌면', '물론', '분명', '확실', '정확', '대략', '대체', '과연',
  // 크롤링 노이즈
  'naver', 'com', 'kr', 'blog', 'post', 'https', 'http', 'www',
  'href', 'class', 'div', 'span', 'img',
  // 일반어
  '오늘', '내일', '어제', '오전', '오후', '아침', '저녁', '밤', '새벽',
  '이번', '지난', '다음', '이전',
  '모든', '모두', '전부', '일부', '일단', '우선',
  '포함', '포함된', '관련', '관련된', '관계', '따라', '때문에',
  '결과', '결국', '마지막', '처음', '끝',
  '가능', '불가능', '필요', '불필요',
  '이용', '이용해', '사용', '사용해', '활용',
  // 대명사/지시
  '이것', '그것', '저것', '이곳', '그곳', '저곳',
  '여기', '거기', '저기', '어디',
  '이때', '그때', '지금', '현재',
  '자신', '자기', '본인',
  // 조사 결합 형태
  '하나의', '하나로', '하나만', '둘의', '셋의',
  '경우에', '경우는', '때에', '때는', '번의', '번을',
  '것이', '것을', '것은', '것만', '것도', '것에',
]);

// 의미 없는 형태소 (너무 짧거나 조사 결합)
const MEANINGLESS_PATTERNS = [
  /^[가-힣]{1}$/,           // 1글자 한글
  /^[ㄱ-ㅎㅏ-ㅣ]+$/,          // 자음/모음만
  /^[0-9]+$/,               // 숫자만
  /^[a-z]{1,2}$/i,          // 2글자 영어만
  /^(가|나|다|라|마|바|사|아|자|차|카|타|파|하)$/, // 단일 자음어
];

// 한국어 조사 (suffix로 제거)
const KOREAN_PARTICLES = [
  '입니다', '습니다', '하다', '하는', '하고', '하지', '해서',
  '이에요', '예요', '에요', '이다', '다',
  '으로', '로', '에서', '에게', '한테', '까지', '부터', '처럼', '보다',
  '이나', '나', '이랑', '랑',
  '은', '는', '이', '가', '을', '를', '의', '도', '만', '조차', '밖에',
  '에', '과', '와', '랑',
  '야', '여', '이여',
];

/**
 * 조사 제거 (단순 suffix strip)
 */
function stripParticle(token: string): string {
  if (token.length < 3) return token;
  // 긴 조사부터 시도
  const sorted = [...KOREAN_PARTICLES].sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (token.endsWith(p) && token.length > p.length + 1) {
      return token.slice(0, -p.length);
    }
  }
  return token;
}

/**
 * 고품질 한국어 토큰화 (형태소 분석기 없이 최대한)
 * - 공백/특수문자 분리
 * - 2~15자 필터
 * - 불용어 제거
 * - 조사 suffix 제거 후 재평가
 * - 의미 없는 패턴 필터
 */
export function tokenizeKoreanAdvanced(text: string): string[] {
  if (!text) return [];

  const raw = text
    .toLowerCase()
    .replace(/[^\uac00-\ud7a3a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const result: string[] = [];
  for (const raw_t of raw) {
    // 1차 길이 필터
    if (raw_t.length < 2 || raw_t.length > 15) continue;

    // 의미 없는 패턴 필터
    if (MEANINGLESS_PATTERNS.some((p) => p.test(raw_t))) continue;

    // 조사 제거 후 재평가
    const stripped = stripParticle(raw_t);

    // 제거 후 너무 짧으면 원본 사용 (조사 오검출 방지)
    const candidate = stripped.length >= 2 ? stripped : raw_t;

    // 불용어 체크
    if (STOPWORDS.has(candidate) || STOPWORDS.has(raw_t)) continue;

    // 숫자만
    if (/^\d+$/.test(candidate)) continue;

    result.push(candidate);
  }
  return result;
}

/**
 * 동일 어간 중복 제거 (예: "운동을"/"운동은"/"운동" → "운동" 하나로)
 * 2글자 이상 prefix가 일치하면 더 짧은 것을 대표어로
 */
export function deduplicateStems(tokens: string[]): string[] {
  const sorted = [...new Set(tokens)].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  const stemSet = new Set<string>();

  for (const t of sorted) {
    // 이미 더 짧은 버전이 있으면 스킵
    let isRedundant = false;
    for (const kept_t of kept) {
      if (t.startsWith(kept_t) && kept_t.length >= 2) {
        isRedundant = true;
        break;
      }
    }
    if (!isRedundant) {
      kept.push(t);
      stemSet.add(t);
    }
  }
  return kept;
}

/**
 * 최종 의미 키워드만 남기기 (pipeline)
 */
export function extractMeaningfulKeywords(text: string): string[] {
  const tokens = tokenizeKoreanAdvanced(text);
  return deduplicateStems(tokens);
}
