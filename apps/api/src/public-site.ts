import type {
  MobileLiveGoldenBoardItem,
  MobileLiveGoldenFreshness,
  MobileLiveGoldenRadarSnapshot,
  MobilePublishDecision,
  MobileSignalItem,
  MobileSourceSignalSnapshot,
} from '../../../src/mobile/contracts';
import { renderLewordProWeb } from './pro-web-site';

type PublicPreviewPolicy = 'lower-five' | 'building-board';

export interface PublicLiveGoldenPreviewItem {
  id: string;
  rank: number;
  keyword: string;
  grade: string;
  freshness: MobileLiveGoldenFreshness;
  isMeasured: boolean;
  publicSearchVolumeLabel: string;
  publicDocumentCountLabel: string;
  publicReason: string;
  discoveredAt: string;
  updatedAt: string;
  publishDecision?: MobilePublishDecision;
}

export interface PublicLiveGoldenPayload {
  ok: true;
  updatedAt: string;
  boardTarget: number;
  boardCount: number;
  lockedCount: number;
  publicPreviewCount: number;
  running: boolean;
  exactMetricsLocked: true;
  measurementSourceLabel: string;
  previewPolicy: PublicPreviewPolicy;
  previewPolicyLabel: string;
  statusMessage?: string;
  publicPreview: PublicLiveGoldenPreviewItem[];
}

function redactPublicPreviewItem(item: MobileLiveGoldenBoardItem): PublicLiveGoldenPreviewItem {
  return {
    id: item.id,
    rank: item.rank,
    keyword: item.keyword,
    grade: item.grade,
    freshness: item.freshness,
    isMeasured: item.isMeasured,
    publicSearchVolumeLabel: item.publicSearchVolumeLabel,
    publicDocumentCountLabel: item.publicDocumentCountLabel,
    publicReason: item.publicReason,
    discoveredAt: item.discoveredAt,
    updatedAt: item.updatedAt,
    publishDecision: item.publishDecision,
  };
}

export function buildPublicLiveGoldenPayload(snapshot: MobileLiveGoldenRadarSnapshot | null): PublicLiveGoldenPayload {
  const publicPreview = snapshot?.publicPreview || [];
  const boardTarget = snapshot?.boardTarget || 120;
  const boardCount = snapshot?.boardCount || 0;
  const previewPolicy: PublicPreviewPolicy = boardCount > publicPreview.length ? 'lower-five' : 'building-board';
  return {
    ok: true,
    updatedAt: snapshot?.boardUpdatedAt || snapshot?.lastFinishedAt || new Date().toISOString(),
    boardTarget,
    boardCount,
    lockedCount: Math.max(0, boardCount - publicPreview.length),
    publicPreviewCount: publicPreview.length,
    running: Boolean(snapshot?.running),
    exactMetricsLocked: true,
    measurementSourceLabel: 'Naver SearchAd + Naver Blog Search',
    previewPolicy,
    previewPolicyLabel: previewPolicy === 'lower-five'
      ? '하위 5개 공개'
      : '초기 보드 빌드업 중',
    statusMessage: snapshot?.lastError
      ? '최근 회차에서 일부 소스 연결이 지연되었습니다.'
      : snapshot?.lastMessage,
    publicPreview: publicPreview.map(redactPublicPreviewItem),
  };
}

function looksCorrupt(text: string): boolean {
  const markers = ['�', '占', '媛', '꾨', 'ㅼ', '댁', '좎', '쒕', '곗', '⑷', '留', '怨꾩', '臾몄', '濡깊'];
  return markers.some((marker) => text.includes(marker))
    || (text.match(/\?/g)?.length || 0) >= 3;
}

function cleanLane(items: MobileSignalItem[]): MobileSignalItem[] {
  return items.filter((item) => !looksCorrupt(`${item.keyword} ${item.title} ${item.description}`));
}

export function cleanPublicSourceSignals(snapshot: MobileSourceSignalSnapshot): MobileSourceSignalSnapshot {
  return {
    ...snapshot,
    realtime: cleanLane(snapshot.realtime),
    policy: cleanLane(snapshot.policy),
    issues: cleanLane(snapshot.issues),
  };
}

const PUBLIC_SOURCE_LANE_LIMIT = 10;

type PublicSourceLaneId = 'naver' | 'daum' | 'nate' | 'zum' | 'policy' | 'issue';

export interface PublicSourceSignalLane {
  id: PublicSourceLaneId;
  label: string;
  description: string;
  items: MobileSignalItem[];
}

export interface PublicSourceSignalPayload {
  ok: true;
  updatedAt: string;
  fallbackUsed: boolean;
  lanes: PublicSourceSignalLane[];
  snapshot: MobileSourceSignalSnapshot;
}

function signalText(item: MobileSignalItem): string {
  return `${item.source || ''} ${item.title || ''} ${item.keyword || ''}`.toLowerCase();
}

function signalMatches(item: MobileSignalItem, tokens: string[]): boolean {
  const text = signalText(item);
  return tokens.some((token) => text.includes(token));
}

function signalUniqueKey(item: MobileSignalItem): string {
  return `${item.source || ''}|${item.keyword || ''}|${item.title || ''}`.trim().toLowerCase();
}

function fillSignalLane(
  primary: MobileSignalItem[],
  fallbackItems: MobileSignalItem[] = [],
): MobileSignalItem[] {
  const result: MobileSignalItem[] = [];
  const seen = new Set<string>();
  const push = (item: MobileSignalItem | undefined) => {
    if (!item || result.length >= PUBLIC_SOURCE_LANE_LIMIT) return;
    const key = signalUniqueKey(item) || item.id;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };

  primary.forEach(push);
  fallbackItems.forEach(push);
  return result.slice(0, PUBLIC_SOURCE_LANE_LIMIT);
}

function pickRealtimeSignals(
  realtime: MobileSignalItem[],
  tokens: string[],
  fallback: MobileSignalItem | undefined,
  laneId: PublicSourceLaneId,
): MobileSignalItem[] {
  const matched = realtime.filter((item) => signalMatches(item, tokens));
  const fallbackItems = fallback && signalMatches(fallback, tokens) ? [fallback] : [];
  return fillSignalLane(matched, fallbackItems);
}

export function buildPublicSourceSignalPayload(snapshot: MobileSourceSignalSnapshot): PublicSourceSignalPayload {
  const clean = cleanPublicSourceSignals(snapshot);
  const realtime = clean.realtime || [];
  const lanes: PublicSourceSignalLane[] = [
    {
      id: 'naver',
      label: '네이버',
      description: '네이버 실시간, 뉴스, 검색 수요 신호',
      items: pickRealtimeSignals(realtime, ['naver', '네이버'], realtime[0], 'naver'),
    },
    {
      id: 'daum',
      label: '다음',
      description: '다음 랭킹과 생활/뉴스 신호',
      items: pickRealtimeSignals(realtime, ['daum', '다음'], realtime[1], 'daum'),
    },
    {
      id: 'nate',
      label: '네이트',
      description: '네이트 이슈/랭킹 신호',
      items: pickRealtimeSignals(realtime, ['nate', '네이트'], realtime[2], 'nate'),
    },
    {
      id: 'zum',
      label: '줌',
      description: '줌 실시간/이슈 신호',
      items: pickRealtimeSignals(realtime, ['zum', '줌', 'zuminternet'], realtime[3], 'zum'),
    },
    {
      id: 'policy',
      label: '정책',
      description: '정책브리핑, 지원금, 공공 알림 신호',
      items: fillSignalLane(clean.policy || []),
    },
    {
      id: 'issue',
      label: '이슈',
      description: '방송, 연예, 스포츠, 사회 이슈 신호',
      items: fillSignalLane(clean.issues || []),
    },
  ];
  return {
    ok: true,
    updatedAt: clean.updatedAt,
    fallbackUsed: clean.fallbackUsed,
    lanes: lanes.map((lane) => ({
      ...lane,
      items: lane.items.slice(0, PUBLIC_SOURCE_LANE_LIMIT),
    })),
    snapshot: clean,
  };
}

export function renderLewordLanding(): string {
  return renderLewordProWeb();
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LEWORD LIVE 황금키워드</title>
  <meta name="description" content="실시간 검색어, 정책브리핑, 스타·연예 이슈와 LIVE 황금키워드 맛보기를 확인하세요." />
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: #101b2d;
      --panel-soft: #16243a;
      --line: #2c3d59;
      --text: #f7fbff;
      --muted: #9fb1c8;
      --gold: #f8c21b;
      --lime: #9cff38;
      --green: #16c784;
      --orange: #ff7a2f;
      --red: #ff4d58;
      --blue: #35b7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 20% 0%, rgba(156,255,56,.12), transparent 28%),
        radial-gradient(circle at 82% 4%, rgba(248,194,27,.16), transparent 24%),
        var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 24px 18px 56px; }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0 22px;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 22px; }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--gold), var(--lime));
      color: #07111f;
      font-weight: 1000;
    }
    .nav { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; }
    .nav a,
    .nav button {
      border: 1px solid var(--line);
      background: rgba(255,255,255,.04);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
      gap: 18px;
      align-items: stretch;
      margin-top: 4px;
    }
    .hero-copy,
    .live-board,
    .lane,
    .pro-strip,
    .source-panel,
    .feature-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16,27,45,.88);
      box-shadow: 0 18px 50px rgba(0,0,0,.28);
    }
    .hero-copy {
      padding: 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 430px;
    }
    .eyebrow { color: var(--lime); font-size: 13px; font-weight: 900; text-transform: uppercase; }
    h1 {
      margin: 12px 0 12px;
      font-size: 48px;
      line-height: 1.08;
      letter-spacing: 0;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .lead {
      margin: 0;
      color: #c8d5e7;
      font-size: 18px;
      line-height: 1.65;
      max-width: 680px;
      word-break: keep-all;
    }
    .hero-actions,
    .source-links,
    .feature-grid,
    .keyword-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hero-actions { margin-top: 26px; }
    .primary,
    .secondary,
    .tiny-btn,
    .source-link,
    .feature-btn {
      border-radius: 8px;
      font-weight: 900;
      cursor: pointer;
    }
    .primary,
    .secondary {
      border: 0;
      padding: 14px 18px;
    }
    .primary { background: linear-gradient(135deg, var(--gold), var(--lime)); color: #07111f; }
    .secondary { background: #1a2a43; color: var(--text); border: 1px solid var(--line); }
    .metric-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 30px; }
    .metric { border-top: 1px solid var(--line); padding-top: 14px; }
    .metric strong { display: block; font-size: 24px; color: var(--gold); }
    .metric span { display: block; color: var(--muted); font-size: 13px; margin-top: 4px; }
    .live-board { padding: 20px; min-height: 430px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .section-title h2 { margin: 0; font-size: 20px; letter-spacing: 0; word-break: keep-all; }
    .pill {
      border: 1px solid rgba(156,255,56,.45);
      color: var(--lime);
      background: rgba(156,255,56,.08);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .progress { height: 10px; background: #0a1322; border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
    .progress > div { height: 100%; width: 0%; background: linear-gradient(90deg, var(--gold), var(--lime)); transition: width .35s ease; }
    .board-meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; margin: 10px 0 14px; gap: 12px; }
    .keyword-list { display: grid; gap: 9px; }
    .keyword-card {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid #273954;
      background: rgba(7,17,31,.72);
      border-radius: 8px;
      min-height: 78px;
    }
    .rank { color: var(--gold); font-size: 13px; font-weight: 1000; }
    .keyword-main { min-width: 0; }
    .keyword-main strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; }
    .keyword-main span { display: block; color: var(--muted); margin-top: 5px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grade {
      min-width: 50px;
      text-align: center;
      border-radius: 999px;
      padding: 7px 9px;
      background: var(--red);
      color: white;
      font-size: 12px;
      font-weight: 1000;
    }
    .grade.ss { background: var(--orange); }
    .grade.s { background: var(--gold); color: #07111f; }
    .keyword-actions {
      grid-column: 2 / 4;
      margin-top: -2px;
    }
    .tiny-btn {
      border: 1px solid var(--line);
      background: #1a2a43;
      color: var(--text);
      padding: 7px 10px;
      font-size: 12px;
    }
    .tiny-btn.pro { border-color: rgba(248,194,27,.55); color: var(--gold); }
    .locked {
      margin-top: 10px;
      border: 1px dashed rgba(248,194,27,.45);
      border-radius: 8px;
      padding: 14px;
      color: #dce7f6;
      background: rgba(248,194,27,.06);
      font-size: 14px;
      line-height: 1.55;
    }
    .pro-modal {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 6, 23, 0.78);
    }
    .pro-modal.open { display: flex; }
    .pro-dialog {
      width: min(420px, 100%);
      border: 1px solid rgba(53,183,255,.42);
      border-radius: 8px;
      background: #0f172a;
      box-shadow: 0 24px 80px rgba(0,0,0,.42);
      padding: 22px;
    }
    .pro-dialog h2 { margin: 0 0 8px; font-size: 22px; }
    .pro-dialog p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
    .pro-dialog label {
      display: block;
      margin: 12px 0 6px;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
    }
    .pro-dialog input {
      width: 100%;
      border: 1px solid rgba(148,163,184,.28);
      border-radius: 8px;
      background: #020617;
      color: var(--text);
      padding: 12px 13px;
      font-size: 14px;
    }
    .pro-dialog-actions { display: flex; gap: 10px; margin-top: 18px; }
    .pro-dialog-actions button { flex: 1; }
    .pro-message { min-height: 20px; margin-top: 12px; color: #93c5fd; font-size: 13px; line-height: 1.5; }
    .pro-license {
      margin-top: 12px;
      border: 1px solid rgba(53,183,255,.24);
      border-radius: 8px;
      background: rgba(2,6,23,.46);
      padding: 10px 12px;
    }
    .pro-license summary {
      cursor: pointer;
      color: var(--gold);
      font-weight: 900;
      font-size: 13px;
    }
    .pro-license p { margin: 8px 0 10px; font-size: 12px; }
    .lanes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; }
    .lane { padding: 18px; }
    .lane h3 { margin: 0 0 12px; font-size: 17px; }
    .signal { padding: 12px 0; border-top: 1px solid var(--line); }
    .signal:first-of-type { border-top: 0; }
    .signal strong { display: block; font-size: 15px; }
    .signal span { display: block; margin-top: 5px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .source-badge {
      display: inline-block;
      margin-top: 8px;
      border: 1px solid rgba(53,183,255,.45);
      border-radius: 999px;
      padding: 4px 8px;
      color: #bfe9ff;
      background: rgba(53,183,255,.08);
      font-size: 11px;
      font-weight: 900;
    }
    .source-panel,
    .feature-panel {
      margin-top: 18px;
      padding: 20px;
    }
    .source-panel h2,
    .feature-panel h2 { margin: 0 0 12px; font-size: 21px; }
    .source-link,
    .feature-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      border: 1px solid var(--line);
      background: #1a2a43;
      color: var(--text);
      padding: 10px 13px;
      font-size: 14px;
    }
    .source-link.hot { border-color: rgba(156,255,56,.45); color: var(--lime); }
    .feature-btn {
      border-color: rgba(248,194,27,.45);
      color: var(--gold);
      background: rgba(248,194,27,.06);
    }
    .pro-strip {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 20px;
      border-color: rgba(156,255,56,.32);
      background: linear-gradient(135deg, rgba(22,199,132,.18), rgba(16,27,45,.9));
    }
    .pro-strip h2 { margin: 0 0 6px; font-size: 22px; }
    .pro-strip p,
    .panel-copy { margin: 0 0 14px; color: #c7d5e5; line-height: 1.55; word-break: keep-all; }
    @media (max-width: 880px) {
      .hero,
      .lanes,
      .pro-strip { grid-template-columns: 1fr; }
      .hero-copy { min-height: auto; }
      h1 { font-size: 32px; }
      .metric-row { grid-template-columns: 1fr; }
      .nav { display: none; }
      .keyword-card { grid-template-columns: 40px minmax(0, 1fr) auto; }
      .keyword-actions { grid-column: 1 / 4; }
    }
    @media (max-width: 520px) {
      .shell { padding: 18px 12px 42px; }
      h1 { font-size: 29px; }
      .lead { font-size: 16px; }
      .section-title,
      .board-meta { align-items: flex-start; flex-direction: column; }
      .section-title h2 { font-size: 18px; }
      .keyword-card { grid-template-columns: 34px minmax(0, 1fr); }
      .grade { grid-column: 2; justify-self: start; }
      .keyword-actions { grid-column: 1 / 3; }
      .keyword-main strong,
      .keyword-main span { white-space: normal; }
      .source-link,
      .feature-btn,
      .primary,
      .secondary { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/leword"><span class="brand-mark">L</span><span>LEWORD</span></a>
      <nav class="nav">
        <a href="#signals">실시간 이슈</a>
        <a href="#golden">황금 맛보기</a>
        <a href="#sources">소스 바로가기</a>
        <button type="button" data-action="pro">Pro 로그인</button>
      </nav>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <div>
          <div class="eyebrow">24H LIVE KEYWORD RADAR</div>
          <h1>앱을 꺼도 서버가 계속 찾는 황금키워드 보드</h1>
          <p class="lead">실시간 검색어, 정책브리핑, 스타·연예·방송·스포츠 이슈를 먼저 감지하고, 검색량과 문서수를 실측한 후보만 120개 보드에 채웁니다. 공개 화면은 하위 5개 맛보기만 보여주고, 원본 순위와 정확 수치는 Pro에서 보호합니다.</p>
          <div class="hero-actions">
            <a class="primary" href="#golden">LIVE 보드 보기</a>
            <a class="secondary" href="#signals">오늘 이슈 보기</a>
          </div>
        </div>
        <div class="metric-row">
          <div class="metric"><strong id="metricBoard">0/120</strong><span>검증 보드</span></div>
          <div class="metric"><strong id="metricLocked">0</strong><span>Pro 잠금 키워드</span></div>
          <div class="metric"><strong id="metricState">대기</strong><span>서버 상태</span></div>
        </div>
      </div>

      <section id="golden" class="live-board">
        <div class="section-title">
          <h2>LIVE 황금키워드 맛보기</h2>
          <span class="pill" id="previewPolicy">하위 5개 공개</span>
        </div>
        <div class="progress"><div id="boardProgress"></div></div>
        <div class="board-meta">
          <span id="boardCount">보드 준비 중</span>
          <span id="boardUpdated">업데이트 대기</span>
        </div>
        <div id="keywordList" class="keyword-list"></div>
        <div id="lockedNotice" class="locked">정확 검색량·문서수·황금비율·CPC·전체 120개 원본 순위는 LEWORD Pro에서만 공개됩니다.</div>
      </section>
    </section>

    <section id="signals" class="lanes">
      <div class="lane"><h3>실시간 검색 흐름</h3><div id="laneRealtime">
        <div class="signal"><strong>여름 원피스 추천</strong><span>계절 수요가 높습니다. 추천, 코디, 사이즈, 브랜드 비교형으로 쪼개서 검증하세요.</span><span class="source-badge">네이버</span></div>
        <div class="signal"><strong>장마 준비물</strong><span>장마, 제습, 침수 예방처럼 구매와 생활 정보가 붙는 하위 키워드가 좋습니다.</span><span class="source-badge">다음</span></div>
        <div class="signal"><strong>오늘 방송 출연진</strong><span>방송 직후 회차, 재방송, 출연진, 결말 키워드로 빠르게 선점합니다.</span><span class="source-badge">네이트</span></div>
        <div class="signal"><strong>여름휴가 숙소</strong><span>지역, 일정, 가격 조건을 붙이면 작성 가능한 키워드로 바뀝니다.</span><span class="source-badge">Google</span></div>
      </div></div>
      <div class="lane"><h3>정책·지원금 브리핑</h3><div id="lanePolicy">
        <div class="signal"><strong>근로장려금 지급일</strong><span>신청기간, 지급일, 대상자 확인으로 글감을 나누면 검색 의도가 명확합니다.</span><span class="source-badge">정책브리핑</span></div>
        <div class="signal"><strong>청년 월세 지원 조건</strong><span>조건, 신청, 중도해지, 지역 비교형으로 확장하기 좋습니다.</span><span class="source-badge">정책브리핑</span></div>
      </div></div>
      <div class="lane"><h3>스타·연예·이슈</h3><div id="laneIssues">
        <div class="signal"><strong>신작 드라마 출연진</strong><span>몇부작, 원작, 인물관계도, 결말예상으로 바로 확장 가능합니다.</span><span class="source-badge">연예 이슈</span></div>
        <div class="signal"><strong>대표팀 경기 일정</strong><span>중계, 명단, 하이라이트, 결과 키워드로 빠르게 선점하세요.</span><span class="source-badge">스포츠 이슈</span></div>
      </div></div>
    </section>

    <section id="sources" class="source-panel">
      <h2>실시간 소스 바로가기</h2>
      <p class="panel-copy">네이버, 다음, 네이트, Google, ZUM, 정책브리핑 흐름을 한 화면에서 확인하고 Pro 분석으로 넘기는 입구입니다.</p>
      <div class="source-links">
        <a class="source-link hot" href="https://signal.bz/news" target="_blank" rel="noopener noreferrer">네이버 실시간</a>
        <a class="source-link" href="https://news.daum.net/ranking/popular" target="_blank" rel="noopener noreferrer">다음 랭킹</a>
        <a class="source-link" href="https://news.nate.com/rank/interest" target="_blank" rel="noopener noreferrer">네이트 랭킹</a>
        <a class="source-link" href="https://trends.google.com/trends/trendingsearches/daily?geo=KR" target="_blank" rel="noopener noreferrer">Google Trends</a>
        <a class="source-link" href="https://issue.zum.com/" target="_blank" rel="noopener noreferrer">ZUM 이슈</a>
        <a class="source-link" href="https://www.korea.kr/news/policyNewsList.do" target="_blank" rel="noopener noreferrer">정책브리핑</a>
      </div>
    </section>

    <section class="feature-panel">
      <h2>Pro 기능 입구</h2>
      <p class="panel-copy">PC 앱의 핵심 기능은 Pro 로그인 뒤 정확 수치와 함께 연결됩니다. 공개 페이지에서는 맛보기와 바로가기만 제공합니다.</p>
      <div class="feature-grid">
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="mindmap">마인드맵 확장</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="analysis">정밀 키워드 분석</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="traffic">트래픽 헌터 Pro</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="export">엑셀 다운로드</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="draft">블로그 초안 전송</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="image">이미지 생성 크레딧</button>
      </div>
    </section>

    <section class="pro-strip">
      <div>
        <h2>Pro에서는 바로 작업까지 이어집니다</h2>
        <p>120개 전체 보드, 원본 순위, 정확 검색량·문서수, 마인드맵 확장, 블로그스팟·워드프레스 초안 전송, 이미지 생성 크레딧까지 서버 계정으로 묶어갑니다.</p>
      </div>
      <a class="primary" href="/v1/public/live-golden">공개 API 보기</a>
    </section>
  </main>
  <div class="pro-modal" id="proLoginModal" aria-hidden="true">
    <form class="pro-dialog" id="proLoginForm">
      <h2>LEWORD Pro 로그인</h2>
      <p>기존 사용자는 아이디와 비밀번호만 입력하면 됩니다.</p>
      <label for="proUserId">아이디</label>
      <input id="proUserId" name="userId" autocomplete="username" required />
      <label for="proPassword">비밀번호</label>
      <input id="proPassword" name="password" type="password" autocomplete="current-password" required />
      <details class="pro-license">
        <summary>라이선스 키로 인증하기</summary>
        <p>구매 또는 등록 키가 있는 경우에만 입력하세요. 평소에는 아이디와 비밀번호만으로 로그인됩니다.</p>
        <label for="proLicenseCode">라이선스 키</label>
        <input id="proLicenseCode" name="licenseCode" autocomplete="off" placeholder="LEWORD-XXXX-XXXX" />
      </details>
      <div class="pro-dialog-actions">
        <button class="primary" type="submit">로그인</button>
        <button class="secondary" type="button" id="proLoginClose">닫기</button>
      </div>
      <div class="pro-message" id="proLoginMessage"></div>
    </form>
  </div>

  <script>
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const escapeAttr = (value) => escapeHtml(value).replace(/\\n/g, ' ');
    const fmtTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '대기';
    const gradeClass = (grade) => grade === 'SS' ? 'ss' : grade === 'S' ? 's' : '';
    let proSession = null;

    function restoreProSession() {
      try {
        const saved = JSON.parse(localStorage.getItem('leword.pro.session') || 'null');
        if (saved && saved.accessToken) proSession = saved;
      } catch {
        proSession = null;
      }
      renderProSessionState();
    }

    function renderProSessionState() {
      const button = document.querySelector('[data-action="pro"]');
      if (button) button.textContent = proSession ? 'Pro 접속중' : 'Pro 로그인';
      const notice = document.getElementById('lockedNotice');
      if (notice && proSession) notice.textContent = 'Pro 로그인 완료. 전체 보드와 정확 지표를 불러옵니다.';
    }

    function openProLogin() {
      document.getElementById('proLoginModal').classList.add('open');
      document.getElementById('proLoginModal').setAttribute('aria-hidden', 'false');
      setTimeout(() => document.getElementById('proUserId').focus(), 0);
    }

    function closeProLogin() {
      document.getElementById('proLoginModal').classList.remove('open');
      document.getElementById('proLoginModal').setAttribute('aria-hidden', 'true');
    }

    function renderKeywords(payload) {
      const list = document.getElementById('keywordList');
      const items = payload.publicPreview || [];
      if (!items.length) {
        list.innerHTML = '<div class="locked">서버가 첫 후보를 검증하는 중입니다. API 키가 연결되면 결과가 자동으로 채워집니다.</div>';
        return;
      }
      list.innerHTML = items.map((item) => '<article class="keyword-card">'
        + '<div class="rank">#' + escapeHtml(item.rank) + '</div>'
        + '<div class="keyword-main"><strong>' + escapeHtml(item.keyword) + '</strong><span>'
        + '검색량 ' + escapeHtml(item.publicSearchVolumeLabel) + ' · 문서수 ' + escapeHtml(item.publicDocumentCountLabel) + ' · ' + escapeHtml(item.publicReason)
        + '</span></div>'
        + '<div class="grade ' + gradeClass(item.grade) + '">' + escapeHtml(item.grade) + '</div>'
        + '<div class="keyword-actions">'
        + '<button class="tiny-btn" type="button" data-action="search" data-keyword="' + escapeAttr(item.keyword) + '">네이버 검색</button>'
        + '<button class="tiny-btn" type="button" data-action="google-search" data-keyword="' + escapeAttr(item.keyword) + '">Google</button>'
        + '<button class="tiny-btn pro" type="button" data-action="pro-keyword" data-keyword="' + escapeAttr(item.keyword) + '">Pro 분석</button>'
        + '</div>'
        + '</article>').join('');
    }

    function renderProKeywords(snapshot) {
      const list = document.getElementById('keywordList');
      const target = Math.max(60, Math.min(120, Number(snapshot.boardTarget || 120)));
      const items = (snapshot.board || []).slice(0, target);
      if (!items.length) {
        list.innerHTML = '<div class="locked">Pro 보드가 아직 준비 중입니다.</div>';
        return;
      }
      document.getElementById('metricBoard').textContent = snapshot.boardCount + '/' + snapshot.boardTarget;
      document.getElementById('metricLocked').textContent = '0';
      document.getElementById('metricState').textContent = snapshot.running ? '발굴중' : '접속중';
      document.getElementById('previewPolicy').textContent = 'Pro 전체 공개';
      document.getElementById('lockedNotice').textContent = 'Pro 로그인 상태입니다. 전체 순위와 정확 지표를 표시합니다.';
      list.innerHTML = items.map((item) => '<article class="keyword-card">'
        + '<div class="rank">#' + escapeHtml(item.rank) + '</div>'
        + '<div class="keyword-main"><strong>' + escapeHtml(item.keyword) + '</strong><span>'
        + '검색량 ' + escapeHtml(item.totalSearchVolume ?? '-') + ' · 문서수 ' + escapeHtml(item.documentCount ?? '-') + ' · 황금비율 ' + escapeHtml(item.goldenRatio ?? '-')
        + '</span></div>'
        + '<div class="grade ' + gradeClass(item.grade) + '">' + escapeHtml(item.grade) + '</div>'
        + '<div class="keyword-actions">'
        + '<button class="tiny-btn" type="button" data-action="search" data-keyword="' + escapeAttr(item.keyword) + '">네이버 검색</button>'
        + '<button class="tiny-btn pro" type="button" data-action="pro-keyword" data-keyword="' + escapeAttr(item.keyword) + '">Pro 분석</button>'
        + '</div>'
        + '</article>').join('');
    }

    async function loadProBoard() {
      if (!proSession?.accessToken) return false;
      try {
        const res = await fetch('/v1/live-golden/snapshot', {
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + proSession.accessToken },
        });
        if (!res.ok) return false;
        const payload = await res.json();
        if (payload?.snapshot) {
          renderProKeywords(payload.snapshot);
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }

    function renderSignals(targetId, items) {
      const target = document.getElementById(targetId);
      const rows = (items || []).slice(0, 4);
      if (!rows.length) {
        target.innerHTML = '<div class="signal"><span>소스 연결을 확인하는 중입니다.</span></div>';
        return;
      }
      target.innerHTML = rows.map((item) => '<div class="signal">'
        + '<strong>' + escapeHtml(item.keyword) + '</strong>'
        + '<span>' + escapeHtml(item.description) + '</span>'
        + '<span class="source-badge">' + escapeHtml(item.source) + '</span>'
        + '</div>').join('');
    }

    async function loadLive() {
      if (await loadProBoard()) return;
      try {
        const res = await fetch('/v1/public/live-golden', { cache: 'no-store' });
        const payload = await res.json();
        const pct = Math.min(100, Math.round((payload.boardCount / Math.max(1, payload.boardTarget)) * 100));
        document.getElementById('metricBoard').textContent = payload.boardCount + '/' + payload.boardTarget;
        document.getElementById('metricLocked').textContent = payload.lockedCount;
        document.getElementById('metricState').textContent = payload.running ? '발굴중' : '대기';
        document.getElementById('boardProgress').style.width = pct + '%';
        document.getElementById('boardCount').textContent = '현재 ' + payload.boardCount + ' / ' + payload.boardTarget + '개 검증';
        document.getElementById('boardUpdated').textContent = '최근 갱신 ' + fmtTime(payload.updatedAt);
        document.getElementById('previewPolicy').textContent = payload.previewPolicyLabel || '하위 5개 공개';
        document.getElementById('lockedNotice').textContent = '더미가 아니라 ' + payload.measurementSourceLabel + ' 실측 기반입니다. 공개 화면은 범위만 표시하고 정확 수치는 Pro에서만 공개됩니다.';
        renderKeywords(payload);
      } catch {
        document.getElementById('metricState').textContent = '점검';
      }
    }

    async function loadSignals() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('/v1/public/source-signals', { cache: 'no-store', signal: controller.signal });
        const payload = await res.json();
        renderSignals('laneRealtime', payload.snapshot.realtime);
        renderSignals('lanePolicy', payload.snapshot.policy);
        renderSignals('laneIssues', payload.snapshot.issues);
      } catch {
        return;
      } finally {
        clearTimeout(timeout);
      }
    }

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const keyword = target.getAttribute('data-keyword') || '';
      if (action === 'search') {
        window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(keyword), '_blank', 'noopener,noreferrer');
      } else if (action === 'google-search') {
        window.open('https://www.google.com/search?q=' + encodeURIComponent(keyword), '_blank', 'noopener,noreferrer');
      } else if (action === 'pro-keyword' || action === 'pro' || action === 'pro-feature') {
        if (!proSession) {
          openProLogin();
          return;
        }
        loadProBoard();
      }
    });

    document.getElementById('proLoginClose').addEventListener('click', closeProLogin);
    document.getElementById('proLoginModal').addEventListener('click', (event) => {
      if (event.target.id === 'proLoginModal') closeProLogin();
    });
    document.getElementById('proLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('proLoginMessage');
      const userId = document.getElementById('proUserId').value.trim();
      const password = document.getElementById('proPassword').value.trim();
      const licenseCode = document.getElementById('proLicenseCode').value.trim();
      if (!userId || !password) {
        message.textContent = '아이디와 비밀번호를 입력해주세요.';
        return;
      }
      message.textContent = '로그인 중입니다...';
      try {
        const res = await fetch('/v1/web/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(licenseCode ? { userId, password, licenseCode } : { userId, password }),
        });
        const payload = await res.json();
        if (!res.ok || !payload?.session?.accessToken) {
          message.textContent = payload?.message || '로그인에 실패했습니다.';
          return;
        }
        proSession = payload.session;
        localStorage.setItem('leword.pro.session', JSON.stringify(proSession));
        renderProSessionState();
        closeProLogin();
        await loadProBoard();
      } catch (err) {
        message.textContent = err?.message || '로그인에 실패했습니다.';
      }
    });

    restoreProSession();
    loadLive();
    loadSignals();
    setInterval(loadLive, 15000);
    setInterval(loadSignals, 60000);
  </script>
</body>
</html>`;
}
