export function renderLewordProWeb(): string {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LEWORD Pro Web</title>
  <meta name="description" content="LEWORD Pro Web - 서버 기반 실시간 키워드 분석 콘솔" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: #101b2d;
      --panel2: #16243a;
      --line: #2b3d58;
      --text: #f8fbff;
      --muted: #9fb1c8;
      --gold: #f8c21b;
      --green: #16c784;
      --blue: #35b7ff;
      --red: #ff4d58;
      --orange: #ff8a34;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    a { color: inherit; text-decoration: none; }
    .shell { max-width: 1440px; margin: 0 auto; padding: 18px; }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 8px 0 16px;
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(7,17,31,.92);
      backdrop-filter: blur(10px);
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 1000; font-size: 22px; }
    .brand-mark {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--gold), #9cff38);
      color: #07111f;
    }
    .nav { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .nav a, .nav button, .btn {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #17263d;
      color: var(--text);
      padding: 9px 12px;
      font-weight: 900;
      font-size: 13px;
    }
    .btn.primary { border: 0; background: linear-gradient(135deg, var(--gold), #9cff38); color: #07111f; }
    .btn.blue { border-color: rgba(53,183,255,.5); color: #c9efff; }
    .btn.red { border-color: rgba(255,77,88,.45); color: #ffb4bb; }
    .layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 16px; align-items: start; }
    .sidebar, .panel, .lane, .feature-card, .metric-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 18px 42px rgba(0,0,0,.22);
    }
    .sidebar {
      position: sticky;
      top: 72px;
      padding: 14px;
      display: grid;
      gap: 8px;
    }
    .side-link {
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 11px 12px;
      color: #d9e6f7;
      font-size: 13px;
      font-weight: 900;
      background: rgba(255,255,255,.035);
    }
    .side-link:hover { border-color: rgba(53,183,255,.45); color: white; }
    .side-note {
      margin-top: 8px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(53,183,255,.08);
      border: 1px solid rgba(53,183,255,.25);
      color: #bfe9ff;
      font-size: 12px;
      line-height: 1.55;
    }
    .main { display: grid; gap: 16px; min-width: 0; }
    .hero {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(22,199,132,.12), rgba(53,183,255,.08)), var(--panel);
      padding: 22px;
    }
    .hero h1 { margin: 0 0 8px; font-size: 34px; line-height: 1.18; letter-spacing: 0; word-break: keep-all; }
    .hero p { margin: 0; max-width: 980px; color: #c8d5e7; line-height: 1.65; word-break: keep-all; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
    .metric-card { padding: 14px; }
    .metric-card strong { display: block; font-size: 22px; color: var(--gold); }
    .metric-card span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
    .panel { padding: 18px; min-width: 0; }
    .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .panel-title h2 { margin: 0; font-size: 21px; letter-spacing: 0; }
    .muted { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .lane { padding: 14px; min-height: 206px; }
    .lane h3 { margin: 0 0 10px; font-size: 17px; display: flex; justify-content: space-between; gap: 8px; }
    .lane-count {
      border-radius: 999px;
      background: rgba(248,194,27,.12);
      border: 1px solid rgba(248,194,27,.35);
      color: var(--gold);
      padding: 3px 8px;
      font-size: 11px;
      white-space: nowrap;
    }
    .signal { border-top: 1px solid rgba(159,177,200,.18); padding: 10px 0; }
    .signal:first-of-type { border-top: 0; padding-top: 0; }
    .signal strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
    .signal span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .lookup-row { display: grid; grid-template-columns: minmax(180px, 1fr) 160px 130px; gap: 8px; }
    .input {
      width: 100%;
      min-height: 42px;
      border-radius: 8px;
      border: 1px solid var(--line);
      background: #07111f;
      color: var(--text);
      padding: 10px 12px;
    }
    .table-wrap { margin-top: 14px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 980px; }
    th, td { padding: 10px 11px; border-bottom: 1px solid rgba(159,177,200,.18); text-align: left; font-size: 13px; }
    th { color: #c8d5e7; background: #0c1727; position: sticky; top: 0; }
    td { color: #edf4ff; }
    .grade {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 38px;
      border-radius: 999px;
      padding: 4px 8px;
      background: var(--red);
      color: white;
      font-weight: 1000;
      font-size: 12px;
    }
    .grade.SS { background: var(--orange); }
    .grade.S { background: var(--gold); color: #07111f; }
    .grade.A { background: var(--green); color: #052016; }
    .feature-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .feature-card {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 190px;
    }
    .feature-card h3 { margin: 0; font-size: 16px; line-height: 1.35; }
    .feature-card p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; flex: 1; }
    .status-pill {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 900;
      border: 1px solid rgba(22,199,132,.35);
      color: #98f7c7;
      background: rgba(22,199,132,.08);
    }
    .status-pill.linked { border-color: rgba(53,183,255,.4); color: #bfe9ff; background: rgba(53,183,255,.08); }
    .status-pill.planned { border-color: rgba(248,194,27,.45); color: var(--gold); background: rgba(248,194,27,.08); }
    .workbench { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(300px, .9fr); gap: 12px; }
    .log {
      min-height: 180px;
      max-height: 360px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #07111f;
      padding: 12px;
      color: #c8d5e7;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .modal {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 50;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2,6,23,.78);
    }
    .modal.open { display: flex; }
    .dialog {
      width: min(430px, 100%);
      border: 1px solid rgba(53,183,255,.4);
      border-radius: 8px;
      background: #0f172a;
      box-shadow: 0 24px 80px rgba(0,0,0,.38);
      padding: 20px;
    }
    .dialog h2 { margin: 0 0 8px; font-size: 22px; }
    .dialog p { margin: 0 0 14px; color: var(--muted); line-height: 1.55; }
    .dialog label { display: block; margin: 10px 0 6px; font-size: 13px; color: #d9e6f7; font-weight: 900; }
    .dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
    @media (max-width: 1160px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: static; grid-template-columns: repeat(4, 1fr); }
      .side-note { grid-column: 1 / -1; }
      .feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 820px) {
      .source-grid, .metrics, .workbench, .lookup-row { grid-template-columns: 1fr; }
      .sidebar { grid-template-columns: 1fr 1fr; }
      .hero h1 { font-size: 28px; }
    }
    @media (max-width: 560px) {
      .shell { padding: 12px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .nav, .feature-grid, .sidebar { grid-template-columns: 1fr; width: 100%; }
      .nav a, .nav button, .btn { width: 100%; }
      .hero h1 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/leword"><span class="brand-mark">L</span><span>LEWORD Pro Web</span></a>
      <nav class="nav" aria-label="주요 메뉴">
        <a href="#sources">실시간 소스</a>
        <a href="#lookup">키워드 조회</a>
        <a href="#features">Pro 기능</a>
        <button type="button" id="loginOpen">Pro 로그인</button>
      </nav>
    </header>

    <div class="layout">
      <aside class="sidebar" aria-label="Pro 기능 탭">
        <a class="side-link" href="#sources">네이버/다음/네이트/줌/정책/이슈</a>
        <a class="side-link" href="#lookup">PC/모바일 실측 조회</a>
        <a class="side-link" href="#features">전체 Pro 기능</a>
        <a class="side-link" href="#workbench">실행 로그</a>
        <div class="side-note">내부 설명 대신 실제 실행 콘솔만 보여줍니다. 서버가 수집, 측정, 캐시, job 실행을 담당합니다.</div>
      </aside>

      <section class="main">
        <section class="hero">
          <h1>LEWORD Pro Web: 서버 기반 키워드 끝판왕 콘솔</h1>
          <p>Electron 앱의 핵심 기능을 웹에서 바로 실행하도록 재배치했습니다. 화면은 콘솔 역할만 하고, 실시간 소스 수집, PC/모바일 검색량 측정, 문서수 확인, 장기 분석 job, Pro 권한 체크는 서버가 담당합니다.</p>
          <div class="metrics">
            <div class="metric-card"><strong id="metricSession">로그인 필요</strong><span>Pro 세션</span></div>
            <div class="metric-card"><strong id="metricBoard">0/60</strong><span>황금키워드 보드</span></div>
            <div class="metric-card"><strong id="metricMeasured">0</strong><span>실측 키워드</span></div>
            <div class="metric-card"><strong id="metricServer">확인 중</strong><span>서버 상태</span></div>
          </div>
        </section>

        <section class="panel" id="sources">
          <div class="panel-title">
            <div>
              <h2>실시간 소스 보드</h2>
              <div class="muted">네이버 / 다음 / 네이트 / 줌 / 정책 / 이슈 순서로 서버 수집 결과를 보여줍니다.</div>
            </div>
            <button class="btn blue" type="button" id="refreshSources">새로고침</button>
          </div>
          <div class="source-grid">
            <div class="lane" id="lane-naver"><h3>네이버 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
            <div class="lane" id="lane-daum"><h3>다음 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
            <div class="lane" id="lane-nate"><h3>네이트 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
            <div class="lane" id="lane-zum"><h3>줌 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
            <div class="lane" id="lane-policy"><h3>정책 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
            <div class="lane" id="lane-issue"><h3>이슈 <span class="lane-count">0</span></h3><div class="muted">불러오는 중...</div></div>
          </div>
        </section>

        <section class="panel" id="lookup">
          <div class="panel-title">
            <div>
              <h2>키워드 실측 조회</h2>
              <div class="muted">PC/모바일 검색량을 분리해 표로 보여줍니다. 서버의 SearchAd/OpenAPI 설정이 없으면 측정 불가 상태를 그대로 표시합니다.</div>
            </div>
          </div>
          <form class="lookup-row" id="lookupForm">
            <input class="input" id="keywordInput" placeholder="예: 소상공인 지원금 신청" autocomplete="off" />
            <select class="input" id="lookupMode">
              <option value="keyword-analysis">정밀 키워드 분석</option>
              <option value="mindmap-expansion">마인드맵 확장</option>
              <option value="golden-discovery">황금키워드 발굴</option>
            </select>
            <button class="btn primary" type="submit">서버 조회</button>
          </form>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>키워드</th>
                  <th>PC</th>
                  <th>모바일</th>
                  <th>전체</th>
                  <th>문서수</th>
                  <th>경쟁비</th>
                  <th>CPC</th>
                  <th>의도</th>
                  <th>등급</th>
                  <th>소스</th>
                  <th>측정</th>
                </tr>
              </thead>
              <tbody id="keywordRows">
                <tr><td colspan="11" class="muted">키워드를 입력하고 서버 조회를 실행하세요.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel" id="features">
          <div class="panel-title">
            <div>
              <h2>Pro 전체 기능 런처</h2>
              <div class="muted">Electron 기능을 웹 Pro에서 사용할 수 있도록 서버 라우트와 연결합니다. 실행형 기능은 바로 job으로 돌고, 서버 분리가 필요한 기능은 상태와 다음 연결 지점을 표시합니다.</div>
            </div>
            <button class="btn blue" type="button" id="refreshFeatureStatus">서버 상태 확인</button>
          </div>
          <div class="feature-grid" id="featureGrid"></div>
        </section>

        <section class="panel" id="workbench">
          <div class="panel-title">
            <div>
              <h2>서버 실행 로그</h2>
              <div class="muted">job 접수, 진행률, 결과, 서버 상태를 여기에 누적합니다.</div>
            </div>
            <button class="btn red" type="button" id="clearLog">로그 지우기</button>
          </div>
          <div class="workbench">
            <div class="log" id="runLog">LEWORD Pro Web 대기 중</div>
            <div class="log" id="resultLog">결과 요약 대기 중</div>
          </div>
        </section>
      </section>
    </div>
  </main>

  <div class="modal" id="loginModal" aria-hidden="true">
    <form class="dialog" id="loginForm">
      <h2>LEWORD Pro 로그인</h2>
      <p>기존 사용자 아이디와 비밀번호만 입력하면 서버 세션을 발급합니다.</p>
      <label for="userId">아이디</label>
      <input class="input" id="userId" autocomplete="username" required />
      <label for="password">비밀번호</label>
      <input class="input" id="password" type="password" autocomplete="current-password" required />
      <div class="dialog-actions">
        <button class="btn primary" type="submit">로그인</button>
        <button class="btn" type="button" id="loginClose">닫기</button>
      </div>
      <div class="muted" id="loginMessage" style="margin-top:12px; min-height:18px;"></div>
    </form>
  </div>

  <script>
    const endpoints = {
      health: '/health',
      session: '/v1/web/session',
      publicLiveGolden: '/v1/public/live-golden',
      publicSources: '/v1/public/source-signals',
      proSources: '/v1/mobile/source-signals',
      apiStatus: '/v1/mobile/api-status',
      pcFeatures: '/v1/mobile/pc-features',
      rankTracking: '/v1/mobile/rank-tracking',
      liveGolden: '/v1/live-golden/snapshot',
      keywordAnalysis: '/v1/keywords/analyze',
      mindmap: '/v1/mindmap/expand',
      golden: '/v1/golden/discover',
      proTraffic: '/v1/pro/hunt',
      adsense: '/v1/home-board/hunt',
      shoppingConnect: '/v1/shopping/connect',
      youtubeGolden: '/v1/youtube/golden',
      naverMate: '/v1/naver/mate',
      kin: '/v1/kin/honey',
      blueprint: '/v1/mobile/pro-blueprint',
      revenue: '/v1/mobile/pro-blueprint/revenue'
    };

    const features = [
      { id: 'pro-traffic', title: 'PRO 트래픽 폭발 키워드 헌터', status: 'ready', route: endpoints.proTraffic, desc: '실시간 이슈, 계절성, evergreen 신호를 서버 job으로 분석합니다.', payload: (q) => ({ categoryId: 'all', seedKeyword: q || undefined, targetCount: 30, includeSeasonal: true, includeEvergreen: true, includeFreshIssue: true }) },
      { id: 'exposure', title: '내 노출 추적', status: 'linked', route: endpoints.rankTracking, desc: '서버의 노출/순위 추적 스냅샷과 SERP 체크 라우트에 연결합니다.', method: 'GET' },
      { id: 'shopping', title: '쇼핑 커넥트', status: 'ready', route: endpoints.shoppingConnect, desc: '네이버 쇼핑 상품 신호를 서버 job으로 분석하고 블로그 진입 키워드로 변환합니다.', requiresKeyword: true, payload: (q) => ({ keyword: q, targetCount: 20, sort: 'sim' }) },
      { id: 'youtube', title: '유튜브 황금키워드', status: 'ready', route: endpoints.youtubeGolden, desc: 'YouTube 급상승 영상 신호를 수집하고 네이버 수요와 교차검증합니다.', payload: () => ({ maxResults: 50, crossReferenceNaver: true }) },
      { id: 'adsense', title: '애드센스 승인 키워드 헌터', status: 'ready', route: endpoints.adsense, desc: 'home-board/adsense 계열 엔진을 서버 job으로 실행합니다.', payload: (q) => ({ categoryId: 'policy', seedKeyword: q || undefined, targetCount: 30, requireSplusFloor: true }) },
      { id: 'naver-mate', title: '네이버 메이트 키워드 헌터', status: 'ready', route: endpoints.naverMate, desc: '네이버 자동완성/연관어 기반 확장을 서버 측정표로 연결합니다.', requiresKeyword: true, payload: (q) => ({ seedKeyword: q, targetCount: 50, includeAutocomplete: true, includeRelated: true, includeVolumeMetrics: true }) },
      { id: 'kin', title: '지식인 황금질문', status: 'ready', route: endpoints.kin, desc: '지식인 외부유입 질문을 서버 job으로 발굴합니다.', payload: () => ({ tabType: 'trending', targetCount: 30, isPremiumRequest: true }) },
      { id: 'blueprint', title: 'Pro 블루프린트/수익 설계', status: 'linked', route: endpoints.revenue, desc: '키워드별 예상 수익과 글감 블루프린트 서버 라우트에 연결합니다.', payload: (q) => ({ keyword: q || '소상공인 지원금 신청', monthlyViews: 3000, category: 'policy' }) }
    ];

    let session = null;
    let pcCatalog = null;

    function qs(id) { return document.getElementById(id); }
    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }
    function fmt(value) {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-';
      return String(value);
    }
    function compactKeywordInput() {
      return qs('keywordInput').value.trim();
    }
    function log(message) {
      const el = qs('runLog');
      const line = '[' + new Date().toLocaleTimeString('ko-KR') + '] ' + message;
      el.textContent = el.textContent === 'LEWORD Pro Web 대기 중' ? line : el.textContent + '\\n' + line;
      el.scrollTop = el.scrollHeight;
    }
    function setResult(message) {
      qs('resultLog').textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    }
    function headers() {
      const out = { 'Content-Type': 'application/json' };
      if (session && session.accessToken) out.Authorization = 'Bearer ' + session.accessToken;
      return out;
    }
    function requireSession() {
      if (!session || !session.accessToken) {
        openLogin();
        log('Pro 로그인이 필요합니다.');
        return false;
      }
      return true;
    }
    function saveSession(value) {
      session = value;
      if (session) localStorage.setItem('leword.pro.session', JSON.stringify(session));
      else localStorage.removeItem('leword.pro.session');
      renderSession();
    }
    function restoreSession() {
      try {
        const saved = JSON.parse(localStorage.getItem('leword.pro.session') || 'null');
        if (saved && saved.accessToken) session = saved;
      } catch {}
      renderSession();
    }
    function renderSession() {
      qs('metricSession').textContent = session ? (session.tier || 'Pro') : '로그인 필요';
      qs('loginOpen').textContent = session ? 'Pro 접속중' : 'Pro 로그인';
    }
    function openLogin() {
      qs('loginModal').classList.add('open');
      qs('loginModal').setAttribute('aria-hidden', 'false');
      setTimeout(function() { qs('userId').focus(); }, 0);
    }
    function closeLogin() {
      qs('loginModal').classList.remove('open');
      qs('loginModal').setAttribute('aria-hidden', 'true');
    }
    async function apiGet(url, authed) {
      const res = await fetch(url, { cache: 'no-store', headers: authed ? headers() : undefined });
      const payload = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error(payload.message || payload.error || 'HTTP ' + res.status);
      return payload;
    }
    async function apiPost(url, body) {
      const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body || {}) });
      const payload = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error(payload.message || payload.error || 'HTTP ' + res.status);
      return payload;
    }
    async function pollJob(jobPayload) {
      const job = jobPayload.job;
      if (!job || !jobPayload.links || !jobPayload.links.self) return jobPayload;
      log('job 접수: ' + job.id + ' / ' + job.product);
      for (let i = 0; i < 180; i++) {
        const state = await apiGet(jobPayload.links.self, true);
        const current = state.job || {};
        if (current.progressMessage) log(current.progressPercent + '% ' + current.progressMessage);
        if (current.state === 'completed') return current.result || state;
        if (current.state === 'failed' || current.state === 'cancelled') throw new Error(current.progressMessage || current.state);
        await new Promise(function(resolve) { setTimeout(resolve, i < 6 ? 900 : 1600); });
      }
      throw new Error('job timeout');
    }
    function renderKeywordRows(result) {
      const rows = Array.isArray(result && result.keywords) ? result.keywords : [];
      qs('metricMeasured').textContent = rows.filter(function(row) { return row.isMeasured; }).length.toLocaleString('ko-KR');
      if (!rows.length) {
        qs('keywordRows').innerHTML = '<tr><td colspan="11" class="muted">서버 결과가 비어 있습니다. API 키 상태 또는 소스 장애를 확인하세요.</td></tr>';
        return;
      }
      qs('keywordRows').innerHTML = rows.slice(0, 80).map(function(row) {
        return '<tr>'
          + '<td><strong>' + escapeHtml(row.keyword) + '</strong></td>'
          + '<td>' + fmt(row.pcSearchVolume) + '</td>'
          + '<td>' + fmt(row.mobileSearchVolume) + '</td>'
          + '<td>' + fmt(row.totalSearchVolume) + '</td>'
          + '<td>' + fmt(row.documentCount) + '</td>'
          + '<td>' + fmt(row.goldenRatio) + '</td>'
          + '<td>' + fmt(row.cpc) + '</td>'
          + '<td>' + escapeHtml(row.intent || '-') + '</td>'
          + '<td><span class="grade ' + escapeHtml(row.grade || '') + '">' + escapeHtml(row.grade || '-') + '</span></td>'
          + '<td>' + escapeHtml(row.source || '-') + '</td>'
          + '<td>' + (row.isMeasured ? '실측' : '측정 필요') + '</td>'
          + '</tr>';
      }).join('');
    }
    function splitFallbackLanes(snapshot) {
      const realtime = (snapshot && snapshot.realtime) || [];
      const policy = (snapshot && snapshot.policy) || [];
      const issues = (snapshot && snapshot.issues) || [];
      const lanes = [
        { id: 'naver', label: '네이버', items: [] },
        { id: 'daum', label: '다음', items: [] },
        { id: 'nate', label: '네이트', items: [] },
        { id: 'zum', label: '줌', items: [] },
        { id: 'policy', label: '정책', items: policy },
        { id: 'issue', label: '이슈', items: issues }
      ];
      realtime.forEach(function(item, index) {
        const text = String((item.source || '') + ' ' + (item.title || '')).toLowerCase();
        let id = index === 0 ? 'naver' : index === 1 ? 'daum' : index === 2 ? 'nate' : 'zum';
        if (text.indexOf('naver') >= 0 || text.indexOf('네이버') >= 0) id = 'naver';
        else if (text.indexOf('daum') >= 0 || text.indexOf('다음') >= 0) id = 'daum';
        else if (text.indexOf('nate') >= 0 || text.indexOf('네이트') >= 0) id = 'nate';
        else if (text.indexOf('zum') >= 0 || text.indexOf('줌') >= 0) id = 'zum';
        const lane = lanes.find(function(row) { return row.id === id; });
        if (lane) lane.items.push(item);
      });
      return lanes;
    }
    function renderSourceLane(lane) {
      const target = qs('lane-' + lane.id);
      if (!target) return;
      const items = (lane.items || []).slice(0, 5);
      target.querySelector('.lane-count').textContent = String(items.length);
      const body = items.length ? items.map(function(item) {
        return '<div class="signal"><strong>' + escapeHtml(item.keyword || item.title || '-') + '</strong><span>' + escapeHtml(item.description || item.title || item.source || '-') + '</span><span>' + escapeHtml(item.source || lane.label) + '</span></div>';
      }).join('') : '<div class="muted">서버 수집 결과가 없습니다. 소스 상태를 확인하세요.</div>';
      target.innerHTML = '<h3>' + escapeHtml(lane.label) + ' <span class="lane-count">' + items.length + '</span></h3>' + body;
    }
    async function loadSources() {
      try {
        const url = session ? endpoints.proSources + '?limit=8' : endpoints.publicSources + '?limit=8';
        const payload = await apiGet(url, !!session);
        const lanes = payload.lanes || splitFallbackLanes(payload.snapshot);
        lanes.forEach(renderSourceLane);
        log('실시간 소스 보드 갱신: ' + lanes.map(function(l) { return l.label + ' ' + ((l.items || []).length); }).join(', '));
      } catch (err) {
        log('소스 보드 갱신 실패: ' + err.message);
      }
    }
    async function loadHealth() {
      try {
        const health = await apiGet(endpoints.health, false);
        qs('metricServer').textContent = health.ok ? '정상' : '확인 필요';
        if (health.liveGolden) qs('metricBoard').textContent = (health.liveGolden.boardCount || 0) + '/' + (health.liveGolden.boardTarget || 60);
      } catch (err) {
        qs('metricServer').textContent = '오류';
      }
    }
    function renderFeatureGrid() {
      qs('featureGrid').innerHTML = features.map(function(feature) {
        const pill = feature.status === 'ready' ? '실행 가능' : feature.status === 'linked' ? '서버 연결' : '서버 분리 대상';
        return '<article class="feature-card">'
          + '<span class="status-pill ' + feature.status + '">' + pill + '</span>'
          + '<h3>' + escapeHtml(feature.title) + '</h3>'
          + '<p>' + escapeHtml(feature.desc) + '</p>'
          + '<button class="btn ' + (feature.status === 'ready' ? 'primary' : 'blue') + '" type="button" data-feature="' + feature.id + '">실행/확인</button>'
          + '</article>';
      }).join('');
    }
    async function refreshFeatureStatus() {
      if (!requireSession()) return;
      try {
        const payload = await apiGet(endpoints.pcFeatures, true);
        pcCatalog = payload.catalog;
        const status = await apiGet(endpoints.apiStatus, true).catch(function(err) { return { error: err.message }; });
        setResult({ pcFeatureCatalog: pcCatalog && pcCatalog.summary ? pcCatalog.summary : pcCatalog, apiStatus: status.snapshot || status });
        log('서버 기능 카탈로그와 API 상태를 확인했습니다.');
      } catch (err) {
        log('기능 상태 확인 실패: ' + err.message);
      }
    }
    async function runFeature(feature) {
      if (!requireSession()) return;
      const q = compactKeywordInput();
      try {
        if (feature.requiresKeyword && !q) {
          log(feature.title + '는 키워드 입력이 필요합니다.');
          return;
        }
        log(feature.title + ' 실행 시작');
        if (feature.method === 'GET') {
          const payload = await apiGet(feature.route, true);
          if (feature.handler && payload.catalog && Array.isArray(payload.catalog.items)) {
            const matched = payload.catalog.items.filter(function(item) { return item.handler === feature.handler; });
            setResult({ feature: feature.title, route: feature.route, matchedHandlers: matched });
          } else {
            setResult(payload.snapshot || payload.catalog || payload);
          }
          log(feature.title + ' 서버 상태 확인 완료');
          return;
        }
        const created = await apiPost(feature.route, feature.payload ? feature.payload(q) : {});
        const result = await pollJob(created);
        setResult(result.summary || result);
        if (result && Array.isArray(result.keywords)) renderKeywordRows(result);
        log(feature.title + ' 완료');
      } catch (err) {
        log(feature.title + ' 실패: ' + err.message);
        setResult({ error: err.message });
      }
    }
    async function runLookup(mode) {
      if (!requireSession()) return;
      const q = compactKeywordInput();
      if (!q) {
        log('키워드를 입력해야 합니다.');
        return;
      }
      const feature = mode === 'mindmap-expansion'
        ? { title: '마인드맵 확장', route: endpoints.mindmap, payload: function() { return { seedKeyword: q, depth: 1, targetCount: 50, includeVolumeMetrics: true }; } }
        : mode === 'golden-discovery'
          ? { title: '황금키워드 발굴', route: endpoints.golden, payload: function() { return { categoryId: 'all', seedKeyword: q, mode: 'precision', targetCount: 30, requireSssFloor: true }; } }
          : { title: '정밀 키워드 분석', route: endpoints.keywordAnalysis, payload: function() { return { keyword: q, maxRelatedCount: 30, includeMindmapPreview: true }; } };
      await runFeature(feature);
    }

    qs('loginOpen').addEventListener('click', openLogin);
    qs('loginClose').addEventListener('click', closeLogin);
    qs('loginModal').addEventListener('click', function(event) { if (event.target.id === 'loginModal') closeLogin(); });
    qs('loginForm').addEventListener('submit', async function(event) {
      event.preventDefault();
      const userId = qs('userId').value.trim();
      const password = qs('password').value.trim();
      qs('loginMessage').textContent = '로그인 중...';
      try {
        const payload = await apiPost(endpoints.session, { userId: userId, password: password });
        if (!payload.session || !payload.session.accessToken) throw new Error(payload.message || '세션 발급 실패');
        saveSession(payload.session);
        qs('loginMessage').textContent = '로그인 완료';
        closeLogin();
        log('Pro 로그인 완료: ' + (payload.session.tier || 'standard'));
        await Promise.all([loadSources(), refreshFeatureStatus().catch(function() {})]);
      } catch (err) {
        qs('loginMessage').textContent = err.message;
      }
    });
    qs('lookupForm').addEventListener('submit', function(event) {
      event.preventDefault();
      runLookup(qs('lookupMode').value);
    });
    qs('refreshSources').addEventListener('click', loadSources);
    qs('refreshFeatureStatus').addEventListener('click', refreshFeatureStatus);
    qs('clearLog').addEventListener('click', function() {
      qs('runLog').textContent = 'LEWORD Pro Web 대기 중';
      qs('resultLog').textContent = '결과 요약 대기 중';
    });
    document.addEventListener('click', function(event) {
      const target = event.target.closest('[data-feature]');
      if (!target) return;
      const feature = features.find(function(row) { return row.id === target.getAttribute('data-feature'); });
      if (feature) runFeature(feature);
    });

    restoreSession();
    renderFeatureGrid();
    loadHealth();
    loadSources();
    setInterval(loadHealth, 30000);
    setInterval(loadSources, 60000);
  </script>
</body>
</html>`;
}
