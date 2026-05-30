/**
 * 플랫폼 적합도 (Platform Fitness) — Phase 1
 *
 * "이 키워드가 어느 플랫폼(네이버블로그/구글·티스토리/유튜브/SNS)에 트래픽이 잘 나오는가"를
 * 이미 수집된 **실측 신호만으로** 결정론적으로 판정한다. (추정 트래픽 숫자 노출 금지 — 메모리 규칙)
 *
 * 근거 (심층 리서치, 2026-05-31):
 *  - 네이버 C-Rank/D.I.A.+ : 출처 주제전문성 + 검색의도 충족 + 의미적 가격/가성비 매칭
 *  - 구글 Helpful Content/E-E-A-T : 정보충족성 + 상업의도(CPC 프록시). 단어수 우대 아님
 *  - 유튜브 (Covington RecSys 2016) : how-to/튜토리얼 등 고의도 검색질의 + watch-time
 *  - 틱톡/인스타 (공식 뉴스룸) : 발견형 — 트렌드/급상승 출처, 검색피처 약함 [추측]
 *  - 검색의도 분류 (Broder SIGIR 2002) : informational 80%+, commercial=고CPC
 *
 * 입력은 전부 실측: searchVolume, documentCount, goldenRatio, cpc(profit-engine 단일소스),
 *   sources(발견 출처), classifyForFeed(토큰 분류), mobileRatio.
 * Math.random 미사용. 점수는 0~100 결정론적.
 */

export type PlatformKey = 'naver' | 'google' | 'youtube' | 'sns';

export interface PlatformFitInput {
  keyword: string;
  searchVolume?: number;        // 실측 (PC+모바일)
  documentCount?: number;       // 실측 (네이버 블로그 문서수)
  goldenRatio?: number;         // 실측 파생 (sv/dc)
  cpc?: number | null;          // 실측/단일소스 추정 (profit-engine)
  sources?: string[];           // 실측 발견 출처 (youtube, tiktok, wikipedia, ...)
  classifyForFeed?: string;     // 토큰 분류 (shopping/info/question/local/trend/...)
  mobileRatio?: number;         // 실측 (모바일 검색 비중 0~100)
}

export interface PlatformFitResult {
  scores: Record<PlatformKey, number>;     // 0~100
  top: PlatformKey;                          // 최고 적합 플랫폼
  topLabel: string;                          // UI 배지 라벨
  badges: Array<{ key: PlatformKey; label: string; score: number }>; // 60점 이상 강세 배지
  reason: string;                            // 근거 요약 (실측 수치 기반)
}

// 의도 토큰 — classifyForFeed 보조용 (키워드 직접 매칭). 근거: SEO 표준 4분류 + 플랫폼 매핑.
const HOWTO_TOKENS = ['방법', '하는법', '설정', '오류', '해결', '설치', '사용법', '강좌', '튜토리얼', '독학', '배우기'];
const INFO_TOKENS = ['정보', '정리', '총정리', '가이드', '설명', '뜻', '의미', '차이', '비교', '원리', '후기', '리뷰'];
const COMMERCIAL_TOKENS = ['추천', '최저가', '가격', '구매', '할인', '비용', '견적', '신청', '조건', '브랜드'];
const LOCAL_TOKENS = ['맛집', '카페', '근처', '주변', '여행', '숙소', '데이트', '주차', '예약'];
const VISUAL_TOKENS = ['코디', '패션', '뷰티', '메이크업', '인테리어', '핫플', '팝업', '챌린지', '브이로그', '쇼츠'];

function hasAny(k: string, tokens: string[]): boolean {
  return tokens.some(t => k.includes(t));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * 결정론적 플랫폼 적합도 계산. 모든 입력은 실측 신호.
 */
export function computePlatformFit(input: PlatformFitInput): PlatformFitResult {
  const k = String(input.keyword || '').replace(/\s+/g, '');
  const sv = Number(input.searchVolume) || 0;
  const dc = Number(input.documentCount) || 0;
  const ratio = Number(input.goldenRatio) || (dc > 0 ? sv / dc : 0);
  const cpc = Number(input.cpc) || 0;
  const sources = (input.sources || []).map(s => String(s).toLowerCase());
  const feed = String(input.classifyForFeed || '');
  const moRatio = Number(input.mobileRatio) || 0;

  const isHowto = hasAny(k, HOWTO_TOKENS) || feed === 'question';
  const isInfo = hasAny(k, INFO_TOKENS) || feed === 'info';
  const isCommercial = hasAny(k, COMMERCIAL_TOKENS) || feed === 'shopping';
  const isLocal = hasAny(k, LOCAL_TOKENS) || feed === 'local';
  const isVisual = hasAny(k, VISUAL_TOKENS);
  const isTrend = feed === 'trend' || sources.some(s => /tiktok|rising|trend|wiki|theqoo|realtime/.test(s));
  const hasYoutubeSource = sources.some(s => s.includes('youtube'));
  const hasSnsSource = sources.some(s => /tiktok|threads|insta/.test(s));

  // ── 네이버 블로그 적합도 ─────────────────────────────
  // C-Rank/DIA+: 경쟁여유(문서수 대비 검색량) + 생활/지역/정보 의도가 강점.
  let naver = 30;
  if (sv >= 1000) naver += 15; else if (sv >= 300) naver += 8;
  if (ratio >= 5) naver += 25; else if (ratio >= 2) naver += 15; else if (ratio >= 1) naver += 6; // 경쟁여유
  if (isLocal) naver += 18;        // 지역/생활정보 = 네이버 코어
  if (isInfo) naver += 10;
  if (isCommercial) naver += 6;    // 쇼핑/플레이스 일부
  if (dc > 0 && dc <= 5000) naver += 6; // 진입 가능 경쟁

  // ── 구글 / 티스토리 적합도 ───────────────────────────
  // Helpful Content: 정보충족 + 상업의도(CPC). 고CPC일수록 애드센스 수익 배율↑.
  let google = 25;
  if (isInfo || isHowto) google += 22;          // 정보성/심층 = 구글 SEO 강점
  if (cpc >= 3000) google += 25; else if (cpc >= 1500) google += 16; else if (cpc >= 800) google += 8; // 애드센스 수익
  if (isCommercial) google += 12;               // commercial investigation
  if (sv >= 500) google += 6;
  if (/영어|english|error|코드|스펙|버전/.test(k)) google += 8; // 글로벌/기술 트래픽

  // ── 유튜브 적합도 ────────────────────────────────────
  // Covington: how-to/튜토리얼/실습형 검색의도 + 시각이해 필요 주제.
  let youtube = 20;
  if (isHowto) youtube += 30;                   // how-to = 유튜브 검색 코어
  if (hasYoutubeSource) youtube += 20;          // 실제 유튜브에서 발견됨 (실측)
  if (/게임|공략|요리|레시피|운동|홈트|메이크업|조립|설치|청소/.test(k)) youtube += 16; // 시각형
  if (isInfo) youtube += 6;

  // ── SNS (틱톡/인스타/스레드) 적합도 ──────────────────
  // 발견형: 트렌드/시각/급상승. 검색피처 약함 → 출처·트렌드 신호 위주 [추측 비중 높음].
  let sns = 15;
  if (hasSnsSource) sns += 28;                  // 실제 SNS에서 발견됨 (실측)
  if (isVisual) sns += 22;
  if (isTrend) sns += 18;
  if (moRatio >= 80) sns += 8;                  // 모바일 편중 (약한 신호)

  const scores: Record<PlatformKey, number> = {
    naver: clamp(naver),
    google: clamp(google),
    youtube: clamp(youtube),
    sns: clamp(sns),
  };

  const LABELS: Record<PlatformKey, string> = {
    naver: '네이버 강세',
    google: '구글·티스토리 유리',
    youtube: '유튜브 적합',
    sns: 'SNS 발견형',
  };

  const ordered = (Object.keys(scores) as PlatformKey[]).sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0];
  // 강세 배지: 60점 이상 + 최고점과 12점 이내 (복수 강세 허용), 최대 2개
  const badges = ordered
    .filter(key => scores[key] >= 60 && scores[key] >= scores[top] - 12)
    .slice(0, 2)
    .map(key => ({ key, label: LABELS[key], score: scores[key] }));

  // 근거 요약 (실측 수치만)
  const reasonParts: string[] = [];
  if (top === 'naver') reasonParts.push(`검색량 ${sv.toLocaleString()} 대비 경쟁 여유(비율 ${ratio.toFixed(1)})`);
  if (top === 'google') reasonParts.push(cpc > 0 ? `CPC ${Math.round(cpc).toLocaleString()}원(애드센스 유리) + 정보성` : '정보성 심층 검색 적합');
  if (top === 'youtube') reasonParts.push(isHowto ? 'how-to/실습형 검색 의도' : '영상 이해형 주제');
  if (top === 'sns') reasonParts.push(hasSnsSource ? 'SNS 실측 발견 + 발견형' : '트렌드/시각형');

  return {
    scores,
    top,
    topLabel: LABELS[top],
    badges,
    reason: reasonParts.join(' · ') || '플랫폼 신호 약함',
  };
}
