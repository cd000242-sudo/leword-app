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
    .golden-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .board-stat {
      border: 1px solid rgba(159,177,200,.2);
      border-radius: 8px;
      background: #07111f;
      padding: 12px;
    }
    .board-stat strong { display: block; color: var(--gold); font-size: 20px; }
    .board-stat span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
    .board-progress { height: 8px; border-radius: 999px; background: #07111f; overflow: hidden; border: 1px solid rgba(159,177,200,.2); }
    .board-progress div { width: 0%; height: 100%; background: linear-gradient(90deg, var(--gold), var(--green)); }
    .board-meta { display: flex; justify-content: space-between; gap: 12px; margin: 10px 0 14px; color: var(--muted); font-size: 12px; flex-wrap: wrap; }
    .quality-strip {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 12px;
    }
    .quality-pill {
      border: 1px solid rgba(159,177,200,.2);
      border-radius: 8px;
      background: #07111f;
      padding: 10px;
      min-height: 58px;
    }
    .quality-pill strong { display: block; color: var(--text); font-size: 15px; }
    .quality-pill span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.35; }
    .quality-pill.good { border-color: rgba(52,211,153,.35); }
    .quality-pill.good strong { color: var(--green); }
    .quality-pill.warn { border-color: rgba(248,194,27,.4); }
    .quality-pill.warn strong { color: var(--gold); }
    .golden-list { display: grid; gap: 8px; }
    .golden-row {
      display: grid;
      grid-template-columns: 58px minmax(0, 1fr) 64px minmax(240px, auto);
      align-items: center;
      gap: 12px;
      border: 1px solid rgba(159,177,200,.2);
      border-radius: 8px;
      background: #0b1626;
      padding: 12px;
    }
    .rank { color: var(--gold); font-weight: 1000; }
    .golden-main strong { display: block; font-size: 15px; overflow-wrap: anywhere; }
    .golden-main span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .golden-actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    .tiny-btn {
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #17263d;
      color: var(--text);
      padding: 7px 9px;
      font-weight: 900;
      font-size: 12px;
    }
    .tiny-btn.pro { border-color: rgba(248,194,27,.45); color: var(--gold); background: rgba(248,194,27,.08); }
    .locked {
      border: 1px dashed rgba(248,194,27,.45);
      border-radius: 8px;
      padding: 14px;
      color: #ffe58a;
      background: rgba(248,194,27,.08);
      line-height: 1.55;
    }
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
    .tool-console {
      border: 1px solid rgba(53,183,255,.28);
      border-radius: 8px;
      background: #0b1626;
      padding: 14px;
      margin-bottom: 12px;
    }
    .tool-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
    .tool-tab {
      min-height: 34px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #17263d;
      color: #d9e6f7;
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 900;
    }
    .tool-tab.active { border-color: rgba(248,194,27,.7); color: #07111f; background: var(--gold); }
    .tool-form { display: grid; grid-template-columns: 1.2fr .9fr .7fr .8fr; gap: 8px; align-items: center; }
    .tool-checks { display: flex; gap: 10px; flex-wrap: wrap; grid-column: 1 / -1; color: #d9e6f7; font-size: 12px; }
    .tool-checks label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .tool-note { margin-top: 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .catalog-strip {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      margin: 0 0 12px;
    }
    .catalog-pill {
      border: 1px solid rgba(159,177,200,.2);
      border-radius: 8px;
      background: #07111f;
      padding: 10px;
      min-height: 58px;
    }
    .catalog-pill strong { display: block; color: var(--gold); font-size: 17px; }
    .catalog-pill span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.35; }
    .catalog-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .catalog-item {
      border: 1px solid rgba(159,177,200,.18);
      border-radius: 8px;
      background: #0b1626;
      padding: 10px;
      min-width: 0;
    }
    .catalog-item strong { display: block; font-size: 13px; overflow-wrap: anywhere; }
    .catalog-item span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
    .ops-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .ops-card {
      border: 1px solid rgba(159,177,200,.2);
      border-radius: 8px;
      background: #0b1626;
      padding: 14px;
      min-height: 178px;
    }
    .ops-card h3 { margin: 0 0 10px; font-size: 15px; line-height: 1.35; }
    .ops-number { display: block; color: var(--gold); font-size: 24px; font-weight: 1000; }
    .ops-meta { display: block; margin: 4px 0 10px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .ops-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .ops-list li {
      border-top: 1px solid rgba(159,177,200,.14);
      padding-top: 6px;
      color: #d9e6f7;
      font-size: 12px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
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
    .result-stack { display: grid; gap: 10px; min-width: 0; }
    .result-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #07111f;
      padding: 12px;
      min-height: 180px;
    }
    .result-panel h3 { margin: 0 0 6px; font-size: 16px; }
    .result-panel p { margin: 0 0 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .result-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
    .result-kpi {
      border: 1px solid rgba(159,177,200,.18);
      border-radius: 8px;
      background: #0b1626;
      padding: 10px;
    }
    .result-kpi strong { display: block; color: var(--gold); font-size: 18px; }
    .result-kpi span { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; }
    .result-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .result-list li {
      border-top: 1px solid rgba(159,177,200,.16);
      padding-top: 8px;
      display: grid;
      gap: 5px;
      font-size: 12px;
      line-height: 1.45;
    }
    .result-list strong { font-size: 13px; overflow-wrap: anywhere; }
    .result-list span { color: var(--muted); overflow-wrap: anywhere; }
    .result-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .result-toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) repeat(4, auto);
      gap: 8px;
      align-items: center;
      margin: 10px 0;
    }
    .result-toolbar .input { min-height: 34px; padding: 7px 9px; font-size: 12px; }
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
      .feature-grid, .ops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 820px) {
      .source-grid, .metrics, .workbench, .lookup-row, .golden-stats, .ops-grid, .tool-form, .catalog-strip, .catalog-list { grid-template-columns: 1fr; }
      .quality-strip { grid-template-columns: 1fr 1fr; }
      .result-toolbar { grid-template-columns: 1fr; }
      .result-kpis { grid-template-columns: 1fr 1fr; }
      .golden-row { grid-template-columns: 48px minmax(0, 1fr); }
      .golden-row .grade { justify-self: start; }
      .golden-actions { grid-column: 1 / -1; justify-content: flex-start; }
      .sidebar { grid-template-columns: 1fr 1fr; }
      .hero h1 { font-size: 28px; }
    }
    @media (max-width: 560px) {
      .shell { padding: 12px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .nav, .feature-grid, .sidebar { grid-template-columns: 1fr; width: 100%; }
      .quality-strip { grid-template-columns: 1fr; }
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
        <a href="#golden">황금키워드 보드</a>
        <a href="#sources">실시간 소스</a>
        <a href="#lookup">키워드 조회</a>
        <a href="#features">Pro 기능</a>
        <a href="#ops">운영 현황</a>
        <button type="button" id="loginOpen">Pro 로그인</button>
      </nav>
    </header>

    <div class="layout">
      <aside class="sidebar" aria-label="Pro 기능 탭">
        <a class="side-link" href="#golden">LIVE 황금키워드 보드</a>
        <a class="side-link" href="#sources">네이버/다음/네이트/줌/정책/이슈</a>
        <a class="side-link" href="#lookup">PC/모바일 실측 조회</a>
        <a class="side-link" href="#features">전체 Pro 기능</a>
        <a class="side-link" href="#ops">노출/성과/발행/스케줄</a>
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

        <section class="panel" id="golden">
          <div class="panel-title">
            <div>
              <h2>LIVE 황금키워드 보드</h2>
              <div class="muted">서버가 계속 수집하고 실측한 황금키워드 후보입니다. 로그인 전에는 공개 5개, Pro 로그인 후에는 전체 보드와 정확 지표를 표시합니다.</div>
            </div>
            <button class="btn blue" type="button" id="refreshGolden">보드 새로고침</button>
          </div>
          <div class="golden-stats">
            <div class="board-stat"><strong id="goldenBoardCount">0/60</strong><span>검증 보드</span></div>
            <div class="board-stat"><strong id="goldenPublicCount">0</strong><span>현재 표시</span></div>
            <div class="board-stat"><strong id="goldenLockedCount">0</strong><span>Pro 잠금</span></div>
            <div class="board-stat"><strong id="goldenState">확인 중</strong><span>보드 상태</span></div>
          </div>
          <div class="board-progress"><div id="goldenProgress"></div></div>
          <div class="board-meta">
            <span id="goldenPolicy">공개 정책 확인 중</span>
            <span id="goldenUpdated">업데이트 대기</span>
          </div>
          <div class="quality-strip" id="goldenQualityStrip"></div>
          <div id="goldenNotice" class="locked">황금키워드 보드를 불러오는 중입니다.</div>
          <div class="golden-list" id="goldenBoardList" style="margin-top:10px;"></div>
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
          <div class="tool-console" id="toolConsole">
            <div class="tool-tabs" id="toolTabs" aria-label="Pro 도구 선택"></div>
            <div class="tool-form">
              <input class="input" id="toolSeedInput" placeholder="시드 키워드 또는 상품/질문 키워드" autocomplete="off" />
              <select class="input" id="toolCategory">
                <option value="all">전체 카테고리</option>
                <option value="policy">정책/지원금</option>
                <option value="broadcast">방송/이슈</option>
                <option value="shopping">쇼핑</option>
                <option value="sports">스포츠</option>
                <option value="education">교육</option>
                <option value="life">생활</option>
              </select>
              <input class="input" id="toolTargetCount" type="number" min="5" max="80" step="5" value="30" />
              <select class="input" id="toolSort">
                <option value="sim">관련도/정밀</option>
                <option value="date">최신순</option>
                <option value="trending">트렌딩</option>
                <option value="rising">급상승</option>
                <option value="full">전체 헌팅</option>
              </select>
              <div class="tool-checks">
                <label><input type="checkbox" id="toolFreshIssue" checked /> 실시간 이슈</label>
                <label><input type="checkbox" id="toolSeasonal" checked /> 시즌성</label>
                <label><input type="checkbox" id="toolEvergreen" checked /> evergreen</label>
                <label><input type="checkbox" id="toolVolumeMetrics" checked /> PC/모바일 실측</label>
                <label><input type="checkbox" id="toolCrossRef" checked /> 교차검증</label>
              </div>
              <button class="btn primary" type="button" id="runSelectedTool">선택 도구 실행</button>
              <button class="btn blue" type="button" id="copyLookupKeyword">조회 키워드 가져오기</button>
            </div>
            <div class="tool-note" id="toolProfileNote">Pro 트래픽 폭발 키워드 헌터 설정을 조정한 뒤 실행하세요.</div>
          </div>
          <div class="catalog-strip" id="featureCatalogStrip"></div>
          <div class="catalog-list" id="featureCatalogList"></div>
          <div class="feature-grid" id="featureGrid"></div>
        </section>

        <section class="panel" id="ops">
          <div class="panel-title">
            <div>
              <h2>Pro 운영 대시보드</h2>
              <div class="muted">내 노출 추적, Pro 성과 기록, 워드프레스 발행, 예약 스케줄을 서버 스냅샷으로 모아 보여줍니다.</div>
            </div>
            <button class="btn blue" type="button" id="refreshOps">운영 현황 새로고침</button>
          </div>
          <div class="ops-grid">
            <article class="ops-card" id="ops-rank"><h3>내 노출 추적</h3><span class="ops-number">-</span><span class="ops-meta">Pro 로그인 후 확인</span></article>
            <article class="ops-card" id="ops-outcomes"><h3>성과 기록</h3><span class="ops-number">-</span><span class="ops-meta">Pro 로그인 후 확인</span></article>
            <article class="ops-card" id="ops-wordpress"><h3>워드프레스/발행</h3><span class="ops-number">-</span><span class="ops-meta">Pro 로그인 후 확인</span></article>
            <article class="ops-card" id="ops-schedule"><h3>스케줄/알림</h3><span class="ops-number">-</span><span class="ops-meta">Pro 로그인 후 확인</span></article>
          </div>
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
            <div class="result-stack">
              <div class="result-panel" id="resultSummary">
                <h3>결과 센터</h3>
                <p>키워드 조회나 Pro 기능을 실행하면 KPI, 상위 후보, 바로가기 액션을 이곳에 정리합니다.</p>
              </div>
              <div class="log" id="resultLog">원문 결과 대기 중</div>
            </div>
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
      rankTrackingManual: '/v1/mobile/rank-tracking/manual',
      keywordGroups: '/v1/mobile/keyword-groups',
      keywordExport: '/v1/mobile/export/keywords',
      proOutcomes: '/v1/mobile/pro-outcomes',
      wordpress: '/v1/mobile/wordpress',
      scheduleDashboard: '/v1/mobile/schedule-dashboard',
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
      { id: 'pro-traffic', title: 'PRO 트래픽 폭발 키워드 헌터', status: 'ready', route: endpoints.proTraffic, desc: '실시간 이슈, 계절성, evergreen 신호를 서버 job으로 분석합니다.', defaultTargetCount: 30, payload: (q, options) => ({ categoryId: options.categoryId || 'all', seedKeyword: q || undefined, targetCount: options.targetCount || 30, includeSeasonal: options.includeSeasonal !== false, includeEvergreen: options.includeEvergreen !== false, includeFreshIssue: options.includeFreshIssue !== false }) },
      { id: 'exposure', title: '내 노출 추적', status: 'linked', route: endpoints.rankTracking, desc: '서버의 노출/순위 추적 스냅샷과 SERP 체크 라우트에 연결합니다.', method: 'GET' },
      { id: 'shopping', title: '쇼핑 커넥트', status: 'ready', route: endpoints.shoppingConnect, desc: '네이버 쇼핑 상품 신호를 서버 job으로 분석하고 블로그 진입 키워드로 변환합니다.', requiresKeyword: true, defaultTargetCount: 20, payload: (q, options) => ({ keyword: q, targetCount: options.targetCount || 20, sort: options.sort || 'sim' }) },
      { id: 'youtube', title: '유튜브 황금키워드', status: 'ready', route: endpoints.youtubeGolden, desc: 'YouTube 급상승 영상 신호를 수집하고 네이버 수요와 교차검증합니다.', defaultTargetCount: 50, payload: (_q, options) => ({ maxResults: options.targetCount || 50, crossReferenceNaver: options.crossReferenceNaver !== false }) },
      { id: 'adsense', title: '애드센스 승인 키워드 헌터', status: 'ready', route: endpoints.adsense, desc: 'home-board/adsense 계열 엔진을 서버 job으로 실행합니다.', defaultTargetCount: 30, payload: (q, options) => ({ categoryId: options.categoryId === 'all' ? 'policy' : options.categoryId || 'policy', seedKeyword: q || undefined, targetCount: options.targetCount || 30, requireSplusFloor: true }) },
      { id: 'naver-mate', title: '네이버 메이트 키워드 헌터', status: 'ready', route: endpoints.naverMate, desc: '네이버 자동완성/연관어 기반 확장을 서버 측정표로 연결합니다.', requiresKeyword: true, defaultTargetCount: 50, payload: (q, options) => ({ seedKeyword: q, targetCount: options.targetCount || 50, includeAutocomplete: true, includeRelated: true, includeVolumeMetrics: options.includeVolumeMetrics !== false }) },
      { id: 'kin', title: '지식인 황금질문', status: 'ready', route: endpoints.kin, desc: '지식인 외부유입 질문을 서버 job으로 발굴합니다.', defaultTargetCount: 30, payload: (_q, options) => ({ tabType: ['rising', 'full'].includes(options.sort) ? options.sort : 'trending', targetCount: options.targetCount || 30, isPremiumRequest: true }) },
      { id: 'blueprint', title: 'Pro 블루프린트/수익 설계', status: 'linked', route: endpoints.revenue, desc: '키워드별 예상 수익과 글감 블루프린트 서버 라우트에 연결합니다.', requiresKeyword: false, defaultTargetCount: 30, payload: (q, options) => ({ keyword: q || '소상공인 지원금 신청', monthlyViews: Math.max(100, (options.targetCount || 30) * 100), category: options.categoryId === 'all' ? 'policy' : options.categoryId || 'policy' }) }
    ];

    let session = null;
    let pcCatalog = null;
    let selectedToolId = 'pro-traffic';
    let lastKeywordResult = null;

    function qs(id) { return document.getElementById(id); }
    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }
    function escapeAttr(value) {
      return escapeHtml(value).replace(new RegExp(String.fromCharCode(96), 'g'), '&#96;');
    }
    function normalizeText(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
    function fmt(value) {
      if (value === null || value === undefined || value === '') return '-';
      if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-';
      return String(value);
    }
    function fmtTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    function resultKpiHtml(metrics) {
      return '<div class="result-kpis">' + metrics.map(function(metric) {
        return '<div class="result-kpi"><strong>' + escapeHtml(metric.value) + '</strong><span>' + escapeHtml(metric.label) + '</span></div>';
      }).join('') + '</div>';
    }
    function renderResultSummary(title, subtitle, metrics, rows) {
      const list = Array.isArray(rows) && rows.length
        ? '<ul class="result-list">' + rows.join('') + '</ul>'
        : '<ul class="result-list"><li><span>표시할 상세 항목이 없습니다.</span></li></ul>';
      qs('resultSummary').innerHTML = '<h3>' + escapeHtml(title) + '</h3>'
        + '<p>' + escapeHtml(subtitle || '') + '</p>'
        + resultKpiHtml(metrics || [])
        + list;
    }
    function keywordActionHtml(keyword) {
      const safe = escapeAttr(keyword || '');
      return '<div class="result-actions">'
        + '<button class="tiny-btn" type="button" data-board-action="naver" data-keyword="' + safe + '">네이버</button>'
        + '<button class="tiny-btn" type="button" data-board-action="google" data-keyword="' + safe + '">Google</button>'
        + '<button class="tiny-btn pro" type="button" data-board-action="analyze" data-keyword="' + safe + '">Pro 분석</button>'
        + '</div>';
    }
    function renderKeywordResultSummary(title, result) {
      const rows = Array.isArray(result && result.keywords) ? result.keywords : [];
      lastKeywordResult = rows.length ? result : null;
      const summary = result && result.summary ? result.summary : {};
      const sss = summary.sss == null ? rows.filter(function(row) { return row.grade === 'SSS'; }).length : summary.sss;
      const measured = summary.measured == null ? rows.filter(function(row) { return row.isMeasured; }).length : summary.measured;
      const topRows = rows.slice(0, 5).map(function(row) {
        return '<li><strong>' + escapeHtml(row.keyword || '-') + '</strong>'
          + '<span>등급 ' + escapeHtml(row.grade || '-') + ' · 전체 ' + fmt(row.totalSearchVolume) + ' · PC ' + fmt(row.pcSearchVolume) + ' · 모바일 ' + fmt(row.mobileSearchVolume) + ' · 문서 ' + fmt(row.documentCount) + ' · 황금비 ' + fmt(row.goldenRatio) + '</span>'
          + keywordActionHtml(row.keyword || '')
          + '</li>';
      });
      const toolbar = '<li><div class="result-toolbar">'
        + '<input class="input" id="trackingPostUrl" placeholder="추적 등록용 내 글 URL" autocomplete="off" />'
        + '<button class="tiny-btn pro" type="button" id="saveKeywordGroup">그룹 저장</button>'
        + '<button class="tiny-btn" type="button" id="exportKeywordCsv">CSV</button>'
        + '<button class="tiny-btn" type="button" id="exportKeywordJson">JSON</button>'
        + '<button class="tiny-btn pro" type="button" id="trackTopKeyword">상위 추적 등록</button>'
        + '</div><span>결과를 저장하거나 내 글 URL을 입력해 상위 키워드를 노출 추적에 바로 등록합니다.</span></li>';
      renderResultSummary(title, '서버 실측 결과를 PC/모바일/문서수 기준으로 정리했습니다.', [
        { label: '전체 후보', value: fmt(summary.total == null ? rows.length : summary.total) },
        { label: 'SSS 후보', value: fmt(sss) },
        { label: '실측 완료', value: fmt(measured) },
        { label: '처리 시간', value: summary.elapsedMs == null ? '-' : fmt(summary.elapsedMs) + 'ms' },
      ], [toolbar].concat(topRows));
    }
    function renderSnapshotResultSummary(feature, payload) {
      const title = feature && feature.title ? feature.title : '서버 스냅샷';
      const snapshot = payload && payload.snapshot ? payload.snapshot : payload;
      if (snapshot && snapshot.totals) {
        const totals = snapshot.totals || {};
        const posts = ((snapshot.posts || {}).items || []).slice(0, 5).map(function(post) {
          return '<li><strong>' + escapeHtml(post.keyword || post.postTitle || '추적 글') + '</strong><span>현재 순위 ' + fmt(post.currentRank) + ' · Top30 ' + (post.currentInTop30 ? '노출' : '미노출') + ' · ' + escapeHtml(post.postTitle || post.postUrl || '-') + '</span></li>';
        });
        renderResultSummary('내 노출 추적', '서버가 저장한 노출/순위 추적 현황입니다.', [
          { label: '추적쌍', value: fmt(totals.trackedPairs || 0) },
          { label: 'Top30', value: fmt(totals.currentlyInTop30 || 0) },
          { label: 'Top10', value: fmt(totals.currentlyInTop10 || 0) },
          { label: '알림', value: fmt(totals.alerts || 0) },
        ], posts);
        return;
      }
      if (snapshot && snapshot.benchmark) {
        const benchmark = snapshot.benchmark || {};
        const top = (benchmark.topPerformingKeywords || []).slice(0, 5).map(function(item) {
          return '<li><strong>' + escapeHtml(item.keyword || '성과 키워드') + '</strong><span>순위 ' + fmt(item.rank) + ' · 조회 ' + fmt(item.views || 0) + ' · 수익 ' + fmt(item.revenue || 0) + '</span></li>';
        });
        renderResultSummary('성과 기록', '예측 대비 실제 순위/조회/수익 기록입니다.', [
          { label: '전체 기록', value: fmt(snapshot.totalRecords || 0) },
          { label: '측정 글', value: fmt(snapshot.measuredPosts || 0) },
          { label: '월 조회', value: fmt(benchmark.totalMonthlyViews || 0) },
          { label: '월 수익', value: fmt(benchmark.totalMonthlyRevenue || 0) },
        ], top);
        return;
      }
      if (snapshot && snapshot.sites && snapshot.drafts) {
        const drafts = (snapshot.drafts.items || []).slice(0, 5).map(function(draft) {
          return '<li><strong>' + escapeHtml(draft.title || draft.keyword || '발행 초안') + '</strong><span>' + escapeHtml(draft.status || 'draft') + ' · ' + fmtTime(draft.updatedAt || draft.createdAt) + '</span></li>';
        });
        renderResultSummary('워드프레스/발행', '연결 사이트와 발행 초안 현황입니다.', [
          { label: '연결 사이트', value: fmt(snapshot.sites.total || 0) },
          { label: '발행 초안', value: fmt(snapshot.drafts.total || 0) },
          { label: '구성 상태', value: snapshot.configured ? '정상' : '대기' },
          { label: '갱신', value: fmtTime(snapshot.updatedAt) },
        ], drafts);
        return;
      }
      if (snapshot && snapshot.schedules) {
        const schedules = (snapshot.schedules.items || []).slice(0, 5).map(function(item) {
          return '<li><strong>' + escapeHtml(item.keyword || item.topic || '예약') + '</strong><span>' + escapeHtml(item.status || '-') + ' · ' + fmtTime(item.scheduleDateTime) + ' · ' + escapeHtml(item.platform || '-') + '</span></li>';
        });
        renderResultSummary('스케줄/알림', '예약 발행과 키워드 알림 상태입니다.', [
          { label: '전체 예약', value: fmt(snapshot.schedules.total || 0) },
          { label: '대기', value: fmt(snapshot.schedules.pending || 0) },
          { label: '완료', value: fmt(snapshot.schedules.completed || 0) },
          { label: '키워드 그룹', value: fmt((snapshot.groups || {}).total || 0) },
        ], schedules);
        return;
      }
      renderResultSummary(title, '서버 원문 결과는 아래 JSON 로그에서 확인할 수 있습니다.', [
        { label: '라우트', value: feature && feature.route ? feature.route : '-' },
        { label: '상태', value: '완료' },
        { label: '타입', value: payload && payload.ok === false ? '오류' : '스냅샷' },
        { label: '시간', value: new Date().toLocaleTimeString('ko-KR') },
      ], []);
    }
    function renderFeatureResult(feature, result) {
      setResult(result);
      if (result && Array.isArray(result.keywords)) {
        renderKeywordRows(result);
        renderKeywordResultSummary(feature && feature.title ? feature.title : '키워드 결과', result);
        return;
      }
      renderSnapshotResultSummary(feature, result);
    }
    function lastKeywordRows(limit) {
      const rows = lastKeywordResult && Array.isArray(lastKeywordResult.keywords) ? lastKeywordResult.keywords : [];
      return rows.slice(0, limit || 50);
    }
    function ensureKeywordResult() {
      const rows = lastKeywordRows(1);
      if (!rows.length) {
        log('저장할 키워드 결과가 없습니다. 먼저 Pro 도구나 키워드 조회를 실행하세요.');
        return false;
      }
      return true;
    }
    function downloadArtifact(artifact) {
      if (!artifact || !artifact.content) return;
      const blob = new Blob([artifact.content], { type: artifact.mimeType || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = artifact.filename || 'leword-keywords.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }
    async function saveKeywordGroupFromResult() {
      if (!requireSession() || !ensureKeywordResult()) return;
      const rows = lastKeywordRows(50);
      const title = 'Pro Web 결과 ' + new Date().toLocaleString('ko-KR');
      try {
        const payload = await apiPost(endpoints.keywordGroups, {
          name: title,
          seedKeyword: rows[0] && rows[0].keyword,
          keywords: rows.map(function(row) { return row.keyword; }).filter(Boolean)
        });
        setResult(payload);
        renderSnapshotResultSummary({ title: '키워드 그룹 저장' }, {
          ok: true,
          route: endpoints.keywordGroups,
          savedGroup: payload.group,
          snapshot: payload.snapshot,
        });
        log('키워드 그룹 저장 완료: ' + ((payload.group && payload.group.keywordCount) || rows.length) + '개');
      } catch (err) {
        log('키워드 그룹 저장 실패: ' + err.message);
      }
    }
    async function exportKeywordResult(format) {
      if (!requireSession() || !ensureKeywordResult()) return;
      const rows = lastKeywordRows(80);
      try {
        const payload = await apiPost(endpoints.keywordExport, {
          format: format,
          title: 'LEWORD Pro Web 결과',
          keywords: rows,
        });
        if (payload.artifact) downloadArtifact(payload.artifact);
        setResult(payload);
        renderResultSummary('키워드 내보내기 완료', (payload.artifact && payload.artifact.filename) || '다운로드 artifact를 생성했습니다.', [
          { label: '형식', value: format.toUpperCase() },
          { label: '항목', value: fmt((payload.artifact && payload.artifact.itemCount) || rows.length) },
          { label: '크기', value: fmt((payload.artifact && payload.artifact.byteLength) || 0) + 'B' },
          { label: '시간', value: new Date().toLocaleTimeString('ko-KR') },
        ], []);
        log('키워드 ' + format.toUpperCase() + ' 내보내기 완료');
      } catch (err) {
        log('키워드 내보내기 실패: ' + err.message);
      }
    }
    async function trackTopKeywordFromResult() {
      if (!requireSession() || !ensureKeywordResult()) return;
      const postUrlInput = qs('trackingPostUrl');
      const postUrl = postUrlInput ? postUrlInput.value.trim() : '';
      if (!postUrl) {
        log('추적 등록에는 내 글 URL이 필요합니다.');
        if (postUrlInput) postUrlInput.focus();
        return;
      }
      const rows = lastKeywordRows(5);
      const keyword = rows[0].keyword;
      try {
        const payload = await apiPost(endpoints.rankTrackingManual, {
          keyword: keyword,
          postUrl: postUrl,
          postTitle: 'Pro Web 추적 등록',
          category: 'pro-web',
        });
        setResult(payload);
        renderSnapshotResultSummary({ title: '내 노출 추적 등록' }, payload.snapshot || payload);
        log('상위 키워드 추적 등록 완료: ' + keyword);
        await loadOpsDashboard().catch(function() {});
      } catch (err) {
        log('추적 등록 실패: ' + err.message);
      }
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
        if (current.state === 'failed' || current.state === 'cancelled') throw new Error(current.error || current.progressMessage || current.state);
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
    function setGoldenSummary(boardCount, boardTarget, visibleCount, lockedCount, running, updatedAt, policy) {
      const target = boardTarget || 60;
      const count = boardCount || 0;
      const pct = Math.min(100, Math.round((count / Math.max(1, target)) * 100));
      qs('metricBoard').textContent = count + '/' + target;
      qs('goldenBoardCount').textContent = count + '/' + target;
      qs('goldenPublicCount').textContent = String(visibleCount || 0);
      qs('goldenLockedCount').textContent = String(lockedCount || 0);
      qs('goldenState').textContent = running ? '발굴중' : '대기';
      qs('goldenProgress').style.width = pct + '%';
      qs('goldenPolicy').textContent = policy || '하위 5개 공개';
      qs('goldenUpdated').textContent = updatedAt ? '최근 갱신 ' + fmtTime(updatedAt) : '업데이트 대기';
    }
    function isThinProfileKeywordText(keyword) {
      return /(프로필|인물정보|약력|나이|학력|고향|키|인스타|나무위키|가족|결혼|남편|아내|부인|군대|작품활동|필모그래피)/.test(normalizeText(keyword));
    }
    function qualityPill(label, value, meta, state) {
      return '<div class="quality-pill ' + escapeHtml(state || '') + '"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label + ' · ' + meta) + '</span></div>';
    }
    function renderGoldenQuality(items, exact, boardCount, lockedCount) {
      const rows = Array.isArray(items) ? items : [];
      const measured = rows.filter(function(item) { return item.isMeasured !== false && (item.totalSearchVolume != null || item.documentCount != null || exact); }).length;
      const topTier = rows.filter(function(item) { return item.grade === 'SSS' || item.grade === 'SS'; }).length;
      const profileLeak = rows.filter(function(item) { return isThinProfileKeywordText(item.keyword || ''); }).length;
      const categories = new Set(rows.map(function(item) { return normalizeText(item.category || item.source || 'unknown'); }).filter(Boolean));
      const visible = rows.length;
      const totalBoard = boardCount || visible;
      const lockCount = Math.max(0, lockedCount || Math.max(0, totalBoard - visible));
      qs('goldenQualityStrip').innerHTML = [
        exact
          ? qualityPill('실측률', fmt(measured) + '/' + fmt(visible), 'PC·모바일·문서수 기준', measured >= visible ? 'good' : 'warn')
          : qualityPill('무료 미리보기', fmt(visible) + '개', '하위 후보만 노출', 'warn'),
        qualityPill('프로필 누출', fmt(profileLeak), profileLeak === 0 ? '차단 정상' : '검토 필요', profileLeak === 0 ? 'good' : 'warn'),
        qualityPill('카테고리 다양성', fmt(categories.size), '도배 방지 캡 적용', categories.size >= Math.min(4, visible) ? 'good' : 'warn'),
        exact
          ? qualityPill('SSS/SS 후보', fmt(topTier), 'Pro 상위 검증권', topTier > 0 ? 'good' : 'warn')
          : qualityPill('Pro 잠금', fmt(lockCount), '상위 보드 보호', lockCount > visible ? 'good' : 'warn'),
      ].join('');
    }
    function renderGoldenRows(items, exact) {
      const rows = (items || []).slice(0, exact ? 60 : 5);
      if (!rows.length) {
        qs('goldenBoardList').innerHTML = '';
        qs('goldenNotice').textContent = '서버가 황금키워드 후보를 검증하는 중입니다.';
        return;
      }
      qs('goldenBoardList').innerHTML = rows.map(function(item) {
        const searchVolume = exact ? fmt(item.totalSearchVolume) : escapeHtml(item.publicSearchVolumeLabel || '-');
        const documents = exact ? fmt(item.documentCount) : escapeHtml(item.publicDocumentCountLabel || '-');
        const reason = exact
          ? '황금비율 ' + fmt(item.goldenRatio) + ' · ' + escapeHtml(item.intent || item.source || '실측')
          : escapeHtml(item.publicReason || '실측 후보');
        return '<article class="golden-row">'
          + '<div class="rank">#' + escapeHtml(item.rank || '-') + '</div>'
          + '<div class="golden-main"><strong>' + escapeHtml(item.keyword || '-') + '</strong><span>'
          + '검색량 ' + searchVolume + ' · 문서수 ' + documents + ' · ' + reason
          + '</span></div>'
          + '<div class="grade ' + escapeHtml(item.grade || '') + '">' + escapeHtml(item.grade || '-') + '</div>'
          + '<div class="golden-actions">'
          + '<button class="tiny-btn" type="button" data-board-action="naver" data-keyword="' + escapeAttr(item.keyword || '') + '">네이버</button>'
          + '<button class="tiny-btn" type="button" data-board-action="google" data-keyword="' + escapeAttr(item.keyword || '') + '">Google</button>'
          + '<button class="tiny-btn pro" type="button" data-board-action="analyze" data-keyword="' + escapeAttr(item.keyword || '') + '">Pro 분석</button>'
          + '</div>'
          + '</article>';
      }).join('');
    }
    function renderPublicGoldenBoard(payload) {
      const items = payload.publicPreview || [];
      setGoldenSummary(
        payload.boardCount,
        payload.boardTarget,
        items.length,
        payload.lockedCount,
        payload.running,
        payload.updatedAt,
        payload.previewPolicyLabel || '하위 5개 공개'
      );
      qs('metricMeasured').textContent = fmt(payload.boardCount || 0);
      qs('goldenNotice').textContent = '공개 화면은 맛보기만 표시합니다. Pro 로그인 후 전체 순위와 정확 검색량·문서수·황금비율을 불러옵니다.';
      renderGoldenQuality(items, false, payload.boardCount, payload.lockedCount);
      renderGoldenRows(items, false);
    }
    function renderProGoldenBoard(snapshot) {
      const items = (snapshot && snapshot.board) || [];
      setGoldenSummary(
        snapshot.boardCount || items.length,
        snapshot.boardTarget || 60,
        items.length,
        0,
        snapshot.running,
        snapshot.boardUpdatedAt || snapshot.lastFinishedAt,
        'Pro 전체 공개'
      );
      qs('metricMeasured').textContent = items.filter(function(item) { return item.isMeasured !== false; }).length.toLocaleString('ko-KR');
      qs('goldenNotice').textContent = 'Pro 로그인 상태입니다. 전체 순위와 정확 지표를 표시합니다.';
      renderGoldenQuality(items, true, snapshot.boardCount || items.length, 0);
      renderGoldenRows(items, true);
    }
    async function loadGoldenBoard() {
      if (session && session.accessToken) {
        try {
          const payload = await apiGet(endpoints.liveGolden, true);
          if (payload && payload.snapshot) {
            renderProGoldenBoard(payload.snapshot);
            log('LIVE 황금키워드 Pro 보드 갱신: ' + ((payload.snapshot.board || []).length) + '개');
            return;
          }
        } catch (err) {
          log('Pro 보드 갱신 실패, 공개 보드로 전환: ' + err.message);
        }
      }
      try {
        const payload = await apiGet(endpoints.publicLiveGolden, false);
        renderPublicGoldenBoard(payload);
        log('LIVE 황금키워드 공개 보드 갱신: ' + (payload.boardCount || 0) + '개');
      } catch (err) {
        qs('goldenState').textContent = '오류';
        qs('goldenNotice').textContent = '황금키워드 보드를 불러오지 못했습니다: ' + err.message;
      }
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
    function getSelectedTool() {
      return features.find(function(feature) { return feature.id === selectedToolId; }) || features[0];
    }
    function renderToolTabs() {
      qs('toolTabs').innerHTML = features.map(function(feature) {
        const active = feature.id === selectedToolId ? ' active' : '';
        return '<button class="tool-tab' + active + '" type="button" data-tool="' + escapeAttr(feature.id) + '">' + escapeHtml(feature.title) + '</button>';
      }).join('');
    }
    function selectTool(id) {
      const feature = features.find(function(row) { return row.id === id; }) || features[0];
      selectedToolId = feature.id;
      qs('toolTargetCount').value = String(feature.defaultTargetCount || 30);
      qs('toolSeedInput').placeholder = feature.requiresKeyword
        ? feature.title + ' 실행 키워드 필수'
        : feature.title + ' 시드 키워드 선택 입력';
      qs('toolProfileNote').textContent = feature.title + ' · ' + feature.desc;
      renderToolTabs();
    }
    function toolKeywordInput() {
      return (qs('toolSeedInput').value.trim() || compactKeywordInput()).trim();
    }
    function collectToolOptions() {
      const count = Math.max(5, Math.min(80, Number(qs('toolTargetCount').value || 30)));
      return {
        keyword: toolKeywordInput(),
        categoryId: qs('toolCategory').value || 'all',
        targetCount: count,
        sort: qs('toolSort').value || 'sim',
        includeFreshIssue: qs('toolFreshIssue').checked,
        includeSeasonal: qs('toolSeasonal').checked,
        includeEvergreen: qs('toolEvergreen').checked,
        includeVolumeMetrics: qs('toolVolumeMetrics').checked,
        crossReferenceNaver: qs('toolCrossRef').checked,
      };
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
    function catalogStatusLabel(status) {
      if (status === 'ready') return '즉시 실행';
      if (status === 'linked') return '서버 연동';
      if (status === 'pc-only') return 'PC 전용';
      return '분리 예정';
    }
    function catalogPill(label, value, meta) {
      return '<div class="catalog-pill"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label + ' · ' + meta) + '</span></div>';
    }
    function renderFeatureCatalog(catalog, apiStatus) {
      const items = catalog && Array.isArray(catalog.items) ? catalog.items : [];
      const manualReady = features.filter(function(feature) { return feature.status === 'ready'; }).length;
      const total = catalog && catalog.totalHandlers != null ? catalog.totalHandlers : items.length;
      const ready = catalog && catalog.ready != null ? catalog.ready : manualReady;
      const linked = catalog && catalog.linked != null ? catalog.linked : features.filter(function(feature) { return feature.status === 'linked'; }).length;
      const planned = catalog && catalog.planned != null ? catalog.planned : 0;
      const statusText = apiStatus && apiStatus.ready === false
        ? 'API 설정 확인 필요'
        : apiStatus && apiStatus.ok === false
          ? 'API 상태 확인 필요'
          : '서버 기능 점검 가능';
      qs('featureCatalogStrip').innerHTML = [
        catalogPill('Electron IPC', total ? fmt(total) : '로그인 후', '전체 기능 표면'),
        catalogPill('즉시 실행', fmt(ready), '서버 job 실행'),
        catalogPill('서버 연동', fmt(linked), '스냅샷/저장/발행'),
        catalogPill('분리 예정', fmt(planned), '웹 전환 후보'),
        catalogPill('상태', statusText, 'API/권한/런타임'),
      ].join('');
      const priority = items.length
        ? items
          .filter(function(item) { return item.status === 'ready' || item.status === 'linked'; })
          .slice(0, 12)
        : features.map(function(feature) {
          return {
            title: feature.title,
            status: feature.status,
            mobileRoute: feature.route,
            description: feature.desc,
          };
        });
      qs('featureCatalogList').innerHTML = priority.map(function(item) {
        return '<article class="catalog-item">'
          + '<span class="status-pill ' + escapeHtml(item.status || '') + '">' + escapeHtml(catalogStatusLabel(item.status)) + '</span>'
          + '<strong>' + escapeHtml(item.title || item.handler || '-') + '</strong>'
          + '<span>' + escapeHtml((item.mobileRoute || item.route || '-') + ' · ' + (item.description || item.ipcEquivalent || 'server')) + '</span>'
          + '</article>';
      }).join('');
      if (!priority.length) {
        qs('featureCatalogList').innerHTML = '<article class="catalog-item"><strong>로그인 후 Electron 기능 카탈로그를 불러옵니다.</strong><span>현재 화면의 주요 Pro 도구는 위 실행 패널에서 바로 사용할 수 있습니다.</span></article>';
      }
    }
    function emptyOpsMessage() {
      return '<ul class="ops-list"><li>아직 표시할 데이터가 없습니다.</li></ul>';
    }
    function renderOpsCard(id, title, value, meta, items) {
      const target = qs('ops-' + id);
      if (!target) return;
      const list = Array.isArray(items) && items.length
        ? '<ul class="ops-list">' + items.slice(0, 3).map(function(item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul>'
        : emptyOpsMessage();
      target.innerHTML = '<h3>' + escapeHtml(title) + '</h3>'
        + '<span class="ops-number">' + escapeHtml(value) + '</span>'
        + '<span class="ops-meta">' + escapeHtml(meta) + '</span>'
        + list;
    }
    function renderOpsLocked() {
      renderOpsCard('rank', '내 노출 추적', '-', 'Pro 로그인 후 서버 추적 현황을 확인합니다.', []);
      renderOpsCard('outcomes', '성과 기록', '-', 'Pro 로그인 후 실제 노출/수익 기록을 확인합니다.', []);
      renderOpsCard('wordpress', '워드프레스/발행', '-', 'Pro 로그인 후 사이트와 발행 초안을 확인합니다.', []);
      renderOpsCard('schedule', '스케줄/알림', '-', 'Pro 로그인 후 예약과 알림 상태를 확인합니다.', []);
    }
    function settledValue(result) {
      return result && result.status === 'fulfilled' ? result.value : null;
    }
    function settledError(result) {
      return result && result.status === 'rejected' && result.reason ? result.reason.message || String(result.reason) : null;
    }
    async function loadOpsDashboard() {
      if (!session || !session.accessToken) {
        renderOpsLocked();
        return;
      }
      const results = await Promise.allSettled([
        apiGet(endpoints.rankTracking, true),
        apiGet(endpoints.proOutcomes, true),
        apiGet(endpoints.wordpress, true),
        apiGet(endpoints.scheduleDashboard, true)
      ]);
      const rank = settledValue(results[0]);
      const outcomes = settledValue(results[1]);
      const wordpress = settledValue(results[2]);
      const schedule = settledValue(results[3]);

      if (rank && rank.snapshot) {
        const totals = rank.snapshot.totals || {};
        const posts = ((rank.snapshot.posts || {}).items || []).slice(0, 3).map(function(post) {
          const rankText = post.currentRank ? String(post.currentRank) + '위' : 'Top30 밖';
          return (post.keyword || post.postTitle || '추적 글') + ' · ' + rankText + ' · ' + (post.postTitle || post.postUrl || '-');
        });
        renderOpsCard('rank', '내 노출 추적', fmt(totals.currentlyInTop30 || 0) + '/' + fmt(totals.trackedPairs || 0), 'Top30 노출 / 추적쌍 · Top10 ' + fmt(totals.currentlyInTop10 || 0), posts);
      } else {
        renderOpsCard('rank', '내 노출 추적', '오류', settledError(results[0]) || '스냅샷을 불러오지 못했습니다.', []);
      }

      if (outcomes && outcomes.snapshot) {
        const snapshot = outcomes.snapshot;
        const benchmark = snapshot.benchmark || {};
        const topKeywords = (benchmark.topPerformingKeywords || []).slice(0, 3).map(function(item) {
          return (item.keyword || '성과 키워드') + ' · 조회 ' + fmt(item.views || 0) + ' · 수익 ' + fmt(item.revenue || 0);
        });
        renderOpsCard('outcomes', '성과 기록', fmt(snapshot.measuredPosts || 0) + '/' + fmt(snapshot.totalRecords || 0), '측정 글 / 전체 기록 · 월수익 ' + fmt(benchmark.totalMonthlyRevenue || 0), topKeywords);
      } else {
        renderOpsCard('outcomes', '성과 기록', '오류', settledError(results[1]) || '스냅샷을 불러오지 못했습니다.', []);
      }

      if (wordpress && wordpress.snapshot) {
        const snapshot = wordpress.snapshot;
        const sites = snapshot.sites || {};
        const drafts = snapshot.drafts || {};
        const draftItems = (drafts.items || []).slice(0, 3).map(function(draft) {
          return (draft.title || draft.keyword || '발행 초안') + ' · ' + (draft.status || 'draft');
        });
        renderOpsCard('wordpress', '워드프레스/발행', fmt(drafts.total || 0), '초안 · 연결 사이트 ' + fmt(sites.total || 0), draftItems);
      } else {
        renderOpsCard('wordpress', '워드프레스/발행', '오류', settledError(results[2]) || '스냅샷을 불러오지 못했습니다.', []);
      }

      if (schedule && schedule.snapshot) {
        const snapshot = schedule.snapshot;
        const schedules = snapshot.schedules || {};
        const groups = snapshot.groups || {};
        const nextItems = (schedules.items || []).slice(0, 3).map(function(item) {
          return (item.keyword || item.topic || '예약') + ' · ' + (item.status || '-') + ' · ' + fmtTime(item.scheduleDateTime);
        });
        renderOpsCard('schedule', '스케줄/알림', fmt(schedules.pending || 0) + '/' + fmt(schedules.total || 0), '대기 / 전체 예약 · 그룹 ' + fmt(groups.total || 0) + ' · 다음 ' + fmtTime(schedules.nextRunAt), nextItems);
      } else {
        renderOpsCard('schedule', '스케줄/알림', '오류', settledError(results[3]) || '스냅샷을 불러오지 못했습니다.', []);
      }

      setResult({
        operations: {
          rankTracking: rank && rank.snapshot ? rank.snapshot.totals : settledError(results[0]),
          outcomes: outcomes && outcomes.snapshot ? { totalRecords: outcomes.snapshot.totalRecords, measuredPosts: outcomes.snapshot.measuredPosts } : settledError(results[1]),
          wordpress: wordpress && wordpress.snapshot ? { sites: wordpress.snapshot.sites.total, drafts: wordpress.snapshot.drafts.total } : settledError(results[2]),
          schedule: schedule && schedule.snapshot ? { schedules: schedule.snapshot.schedules.total, pending: schedule.snapshot.schedules.pending } : settledError(results[3])
        }
      });
      log('Pro 운영 대시보드를 갱신했습니다.');
    }
    async function refreshFeatureStatus() {
      if (!requireSession()) return;
      try {
        const payload = await apiGet(endpoints.pcFeatures, true);
        pcCatalog = payload.catalog;
        const status = await apiGet(endpoints.apiStatus, true).catch(function(err) { return { error: err.message }; });
        renderFeatureCatalog(pcCatalog, status.snapshot || status);
        setResult({ pcFeatureCatalog: pcCatalog && pcCatalog.summary ? pcCatalog.summary : pcCatalog, apiStatus: status.snapshot || status });
        log('서버 기능 카탈로그와 API 상태를 확인했습니다.');
      } catch (err) {
        log('기능 상태 확인 실패: ' + err.message);
      }
    }
    async function runFeature(feature, options) {
      if (!requireSession()) return;
      const runOptions = options || {};
      const q = runOptions.keyword == null ? compactKeywordInput() : String(runOptions.keyword || '').trim();
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
            renderFeatureResult(feature, { feature: feature.title, route: feature.route, matchedHandlers: matched });
          } else {
            renderFeatureResult(feature, payload.snapshot || payload.catalog || payload);
          }
          log(feature.title + ' 서버 상태 확인 완료');
          return;
        }
        const created = await apiPost(feature.route, feature.payload ? feature.payload(q, runOptions) : {});
        const result = await pollJob(created);
        renderFeatureResult(feature, result);
        log(feature.title + ' 완료');
      } catch (err) {
        log(feature.title + ' 실패: ' + err.message);
        setResult({ error: err.message });
        renderResultSummary(feature.title + ' 실패', err.message, [
          { label: '상태', value: '오류' },
          { label: '시간', value: new Date().toLocaleTimeString('ko-KR') },
          { label: '라우트', value: feature.route || '-' },
          { label: '입력', value: q || '-' },
        ], []);
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
        await Promise.all([loadSources(), loadGoldenBoard(), loadOpsDashboard(), refreshFeatureStatus().catch(function() {})]);
      } catch (err) {
        qs('loginMessage').textContent = err.message;
      }
    });
    qs('lookupForm').addEventListener('submit', function(event) {
      event.preventDefault();
      runLookup(qs('lookupMode').value);
    });
    qs('toolTabs').addEventListener('click', function(event) {
      const target = event.target.closest('[data-tool]');
      if (!target) return;
      selectTool(target.getAttribute('data-tool'));
    });
    qs('copyLookupKeyword').addEventListener('click', function() {
      qs('toolSeedInput').value = compactKeywordInput();
      qs('toolSeedInput').focus();
    });
    qs('runSelectedTool').addEventListener('click', function() {
      const feature = getSelectedTool();
      const options = collectToolOptions();
      runFeature(feature, options);
    });
    qs('refreshSources').addEventListener('click', loadSources);
    qs('refreshGolden').addEventListener('click', loadGoldenBoard);
    qs('refreshOps').addEventListener('click', function() {
      if (!requireSession()) {
        renderOpsLocked();
        return;
      }
      loadOpsDashboard().catch(function(err) { log('운영 대시보드 갱신 실패: ' + err.message); });
    });
    qs('refreshFeatureStatus').addEventListener('click', refreshFeatureStatus);
    qs('clearLog').addEventListener('click', function() {
      qs('runLog').textContent = 'LEWORD Pro Web 대기 중';
      qs('resultLog').textContent = '원문 결과 대기 중';
      qs('resultSummary').innerHTML = '<h3>결과 센터</h3><p>키워드 조회나 Pro 기능을 실행하면 KPI, 상위 후보, 바로가기 액션을 이곳에 정리합니다.</p>';
      lastKeywordResult = null;
    });
    document.addEventListener('click', function(event) {
      const actionTarget = event.target.closest('#saveKeywordGroup, #exportKeywordCsv, #exportKeywordJson, #trackTopKeyword');
      if (!actionTarget) return;
      if (actionTarget.id === 'saveKeywordGroup') {
        saveKeywordGroupFromResult();
        return;
      }
      if (actionTarget.id === 'exportKeywordCsv') {
        exportKeywordResult('csv');
        return;
      }
      if (actionTarget.id === 'exportKeywordJson') {
        exportKeywordResult('json');
        return;
      }
      if (actionTarget.id === 'trackTopKeyword') {
        trackTopKeywordFromResult();
      }
    });
    document.addEventListener('click', function(event) {
      const target = event.target.closest('[data-feature]');
      if (!target) return;
      const feature = features.find(function(row) { return row.id === target.getAttribute('data-feature'); });
      if (feature) runFeature(feature);
    });
    document.addEventListener('click', function(event) {
      const target = event.target.closest('[data-board-action]');
      if (!target) return;
      const keyword = target.getAttribute('data-keyword') || '';
      const action = target.getAttribute('data-board-action');
      if (!keyword) return;
      if (action === 'naver') {
        window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(keyword), '_blank', 'noopener');
        return;
      }
      if (action === 'google') {
        window.open('https://www.google.com/search?q=' + encodeURIComponent(keyword), '_blank', 'noopener');
        return;
      }
      qs('keywordInput').value = keyword;
      qs('lookupMode').value = 'golden-discovery';
      runLookup('golden-discovery');
    });

    restoreSession();
    renderFeatureGrid();
    renderFeatureCatalog(null, null);
    selectTool(selectedToolId);
    renderOpsLocked();
    loadHealth();
    loadGoldenBoard();
    loadSources();
    loadOpsDashboard();
    setInterval(loadHealth, 30000);
    setInterval(loadGoldenBoard, 60000);
    setInterval(loadSources, 60000);
    setInterval(loadOpsDashboard, 90000);
  </script>
</body>
</html>`;
}
