import {
  buildPublicSourceSignalPayload,
  renderLewordLanding,
} from '../../../apps/api/src/public-site';
import type { MobileSourceSignalSnapshot } from '../../mobile/contracts';
import vm from 'vm';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[pro-web-site-regression] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const html = renderLewordLanding();

for (const [index, match] of Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).entries()) {
  try {
    new vm.Script(match[1], { filename: `pro-web-inline-${index}.js` });
  } catch (err) {
    assert(`inline script ${index} is syntactically valid`, false, err instanceof Error ? err.message : String(err));
  }
}

assert('renders LEWORD Pro Web shell', html.includes('LEWORD Pro Web'));
assert('uses resilient CSS brand mark instead of a fragile logo image',
  html.includes('class="brand-mark" aria-hidden="true">L</span>')
    && !html.includes('<img class="brand-logo"'));
assert('does not expose integration-structure subtab copy', !html.includes('연동구조'));
assert('keeps existing id/password login', html.includes('LEWORD Pro 로그인') && html.includes('아이디') && html.includes('비밀번호'));
assert('keeps license key auth collapsed as optional login path',
  html.includes('<details class="login-license">')
    && html.includes('id="licenseCode"')
    && html.includes('if (licenseCode) loginPayload.licenseCode = licenseCode'));
assert('renders live golden keyword board section',
  html.includes('id="golden"')
    && html.includes('LIVE 황금키워드 보드')
    && html.includes('id="goldenBoardList"')
    && html.includes('id="refreshGolden"'));
assert('loads public and pro golden boards',
  html.includes("publicLiveGolden: '/v1/public/live-golden'")
    && html.includes("liveGolden: '/v1/live-golden/snapshot'")
    && html.includes('function loadGoldenBoard()')
    && html.includes('renderPublicGoldenBoard')
    && html.includes('renderProGoldenBoard'));
assert('client golden guard keeps regex escapes and live backfill',
  html.includes('const lotto = text.match(/(\\d{3,4})\\s*회\\s*로또|로또\\s*(\\d{3,4})\\s*회/)')
    && html.includes('2027\\s*6모')
    && html.includes("publicSources: '/v1/public/source-signals'")
    && html.includes('function liveSignalBackfillItems')
    && html.includes('payload.clientBackfill = liveSignalBackfillItems'));
assert('live golden board exposes quality control strip',
  html.includes('id="goldenQualityStrip"')
    && html.includes('function renderGoldenQuality')
    && html.includes('function isThinProfileKeywordText')
    && html.includes('프로필 누출')
    && html.includes('카테고리 다양성')
    && html.includes('SSS/SS 후보')
    && html.includes('Pro 잠금'));
assert('shows six source lanes in requested order',
  html.indexOf('네이버 <span class="lane-count"') < html.indexOf('다음 <span class="lane-count"')
    && html.indexOf('다음 <span class="lane-count"') < html.indexOf('네이트 <span class="lane-count"')
    && html.indexOf('줌 <span class="lane-count"') > html.indexOf('네이트 <span class="lane-count"')
    && html.includes('정책 <span class="lane-count"')
    && html.includes('이슈 <span class="lane-count"'));
assert('side navigation switches isolated views instead of one stacked page',
  html.includes('data-view-target="golden"')
    && html.includes('data-view-target="sources"')
    && html.includes('data-view-target="features"')
    && html.includes('data-view-target="downloads"')
    && html.includes('class="panel main-view" id="sources" data-view="sources"')
    && html.includes('class="panel main-view" id="lookup" data-view="lookup"')
    && html.includes('class="panel main-view" id="downloads" data-view="downloads"')
    && html.includes('function setActiveView')
    && html.includes("document.querySelectorAll('[data-view-target]')"));
assert('mobile Pro Web chrome can collapse above the live board',
  html.includes('<main class="shell mobile-pro-collapsed" id="proShell">')
    && html.includes('id="mobileProShellToggle"')
    && html.includes('aria-controls="proTopNav proSidebar"')
    && html.includes('.shell.mobile-pro-collapsed .nav')
    && html.includes('.shell.mobile-pro-collapsed .sidebar')
    && html.includes('.shell.mobile-pro-collapsed .hero')
    && html.includes('function setMobileProChromeCollapsed')
    && html.includes("localStorage.setItem(mobileProChromeStorageKey, value)"));
assert('source board renders a wider always-on realtime feed',
  html.includes("endpoints.publicSources + '?limit=60'")
    && html.includes("endpoints.proSources + '?limit=60'")
    && html.includes('allItems.slice(0, 12)')
    && html.includes('function normalizeSourceLanes')
    && html.includes('class="signal-list"'));
assert('keyword lookup table separates PC and mobile',
  html.includes('<th>PC</th>') && html.includes('<th>모바일</th>') && html.includes('<th>전체</th>') && html.includes('<tbody id="keywordRows">'));

for (const label of [
  'PRO 트래픽 폭발 키워드 헌터',
  '내노출 추적',
  '쇼핑 커넥트',
  '유튜브 황금키워드',
  '애드센스 승인 키워드 헌터',
  '네이버 메이트 황금키워드',
  '지식인 황금질문',
  '황금키워드 정밀 발굴',
  'SERP 순위 즉시 점검',
  '블로그 초안 생성',
  'PC 앱 다운로드',
  '모바일 APK 다운로드',
]) {
  assert(`feature visible: ${label}`, html.includes(label));
}

assert('noisy duplicate tool tabs are removed from Pro feature tabs',
  !html.includes('data-tool-shortcut="mindmap"')
    && !html.includes('data-view-shortcut="sources"')
    && !/id:\s*'keyword-analysis'[\s\S]{0,120}group:\s*'expand'/.test(html)
    && !/id:\s*'mindmap'[\s\S]{0,120}group:\s*'expand'/.test(html)
    && !/id:\s*'source-radar'[\s\S]{0,120}group:\s*'sources'/.test(html)
    && !/id:\s*'api-status'[\s\S]{0,120}group:\s*'system'/.test(html)
    && html.includes("id=\"lookupMode\"")
    && html.includes("value=\"mindmap-expansion\"")
    && html.includes("data-board-action=\"mindmap\""));

for (const featureId of [
  "id: 'niche'",
  "id: 'content-blueprint'",
]) {
  assert(`expanded parity feature id visible: ${featureId}`, html.includes(featureId));
}

assert('ready server-backed routes are wired',
  html.includes("'/v1/pro/hunt'")
    && html.includes("'/v1/home-board/hunt'")
    && html.includes("'/v1/kin/honey'")
    && html.includes("'/v1/shopping/connect'")
    && html.includes("'/v1/youtube/golden'")
    && html.includes("'/v1/naver/mate'")
    && html.includes("'/v1/golden/discover'")
    && html.includes("'/v1/mindmap/expand'")
    && html.includes("'/v1/keywords/analyze'")
    && html.includes("'/v1/mobile/rank-tracking/run'")
    && html.includes("'/v1/live-golden/run'")
    && html.includes("'/v1/prewarm/run'"));

assert('shopping connect defaults to 30 sellable product keywords on web',
  /id:\s*'shopping'[\s\S]{0,260}defaultTargetCount:\s*30[\s\S]{0,160}targetCount:\s*options\.targetCount\s*\|\|\s*30/.test(html)
    && /id:\s*'shopping'[\s\S]{0,260}requiresKeyword:\s*false/.test(html)
    && /id:\s*'shopping'[\s\S]{0,360}autoDiscoveryLimit:\s*options\.targetCount\s*\|\|\s*30/.test(html)
    && /selected\s*&&\s*selected\.id\s*===\s*'shopping'\s*\?\s*30\s*:\s*5/.test(html)
    && !/id:\s*'shopping'[\s\S]{0,260}defaultTargetCount:\s*20/.test(html),
  'shopping connect still starts below the 30 product keyword floor');

assert('renders pro operations dashboard for Electron parity',
  html.includes('id="ops"')
    && html.includes('Pro 운영 대시보드')
    && html.includes('내노출 추적')
    && html.includes('성과 기록')
    && html.includes('워드프레스/발행')
    && html.includes('스케줄/알림')
    && html.includes('id="opsTabs"')
    && html.includes('data-ops-tab="rank"')
    && html.includes('data-ops-panel="rank"')
    && html.includes('function setActiveOpsTab')
    && html.includes('id="refreshOps"'));

assert('operations dashboard is wired to server snapshots',
  html.includes("proOutcomes: '/v1/mobile/pro-outcomes'")
    && html.includes("wordpress: '/v1/mobile/wordpress'")
    && html.includes("scheduleDashboard: '/v1/mobile/schedule-dashboard'")
    && html.includes("rankTracking: '/v1/mobile/rank-tracking'")
    && html.includes('function loadOpsDashboard()')
    && html.includes('Promise.allSettled')
    && html.includes('setInterval(loadOpsDashboard, 90000)'));

assert('renders dedicated result center instead of raw JSON-only output',
  html.includes('id="resultSummary"')
    && html.includes('결과 센터')
    && html.includes('원문 결과 대기 중')
    && html.includes('function renderFeatureResult')
    && html.includes('function renderKeywordResultSummary')
    && html.includes('function renderSnapshotResultSummary'));

assert('result center exposes KPI summary and keyword actions',
  html.includes('class="result-kpis"')
    && html.includes('class="result-list"')
    && html.includes('keywordActionHtml')
    && html.includes('data-board-action="naver"')
    && html.includes('data-board-action="daum"')
    && html.includes('data-board-action="nate"')
    && html.includes('data-board-action="zum"')
    && html.includes('data-board-action="trend"')
    && html.includes('data-board-action="mindmap"')
    && html.includes('data-board-action="analyze"')
    && html.includes('function showTrendGraph')
    && html.includes('renderFeatureResult(feature, result)'));

assert('renders feature-specific tool settings panel',
  html.includes('id="toolConsole"')
    && !html.includes('id="quickFeatureDock"')
    && !html.includes('data-tool-shortcut=')
    && html.includes('id="toolGroupTabs"')
    && html.includes('id="toolTabs"')
    && html.includes('id="toolDetail"')
    && html.includes('id="toolResultPanel"')
    && html.includes('function selectToolGroup')
    && html.includes('function currentGroupFeatures')
    && html.includes('function renderToolDetail')
    && html.includes('function renderToolFeatureResult')
    && html.includes('id="toolSeedInput"')
    && html.includes('id="toolCategory"')
    && html.includes('id="toolTargetCount"')
    && html.includes('id="toolSort"')
    && html.includes('id="runSelectedTool"')
    && html.includes('선택 도구 실행'));

assert('buttons show a progress modal while server work runs',
  html.includes('id="progressModal"')
    && html.includes('id="progressFill"')
    && html.includes('id="progressPercent"')
    && html.includes('function openProgress')
    && html.includes('function updateProgress')
    && html.includes('function completeProgress')
    && html.includes('openProgress(feature.title + \' 실행\'')
    && html.includes('updateProgress(current.progressPercent || 20, current.progressMessage)')
    && html.includes('failProgress(err.message)'));

assert('Naver API key settings are available but collapsed and secret-safe',
  html.includes('id="naverApiSettings"')
    && html.includes('네이버 API 키 설정')
    && html.includes('id="naverClientId"')
    && html.includes('id="naverClientSecret" type="password"')
    && html.includes('id="naverSearchAdAccessLicense"')
    && html.includes('id="naverSearchAdSecretKey" type="password"')
    && html.includes('id="naverSearchAdCustomerId"')
    && html.includes("naverApiSettings: '/v1/mobile/api-settings/naver'")
    && html.includes('function saveNaverApiSettings')
    && html.includes('function checkNaverApiSettings')
    && html.includes('키 값은 화면에 다시 표시하지 않습니다.'));

assert('keeps technical Electron mapping hidden while retaining telemetry wiring',
  !html.includes('Electron 기능 매핑')
    && !html.includes('Electron IPC')
    && !html.includes('Electron \uAE30\uB2A5')
    && html.includes('id="featureCatalogStrip"')
    && html.includes('aria-label="기능 적용 현황" hidden')
    && html.includes('id="featureCatalogTabs" hidden')
    && html.includes('id="featureCatalogList" hidden')
    && !html.includes('id="featureGrid"')
    && html.includes('function renderFeatureCatalog')
    && html.includes('function renderCatalogTabs')
    && html.includes('function runCatalogItem')
    && html.includes("pcFeatures: '/v1/mobile/pc-features'")
    && html.includes('renderFeatureCatalog(pcCatalog, status.snapshot || status)')
    && html.includes('data-catalog-tab')
    && html.includes('data-catalog-run'));

assert('renders working app download surface',
  html.includes('id="downloads"')
    && html.includes("downloads: '/v1/downloads'")
    && html.includes("pcDownload: '/download/pc'")
    && html.includes("androidDownload: '/download/android'")
    && html.includes('id="pcDownloadMeta"')
    && html.includes('id="androidDownloadMeta"')
    && html.includes('function loadDownloads()')
    && html.includes('href="/download/pc"')
    && html.includes('href="/download/android"'));

assert('tool settings drive server payloads instead of one generic button',
  html.includes('function collectToolOptions()')
    && html.includes('function selectTool(id)')
    && html.includes('runFeature(feature, options)')
    && html.includes('feature.payload(q, runOptions)')
    && html.includes("feature.method === 'DOWNLOAD'")
    && html.includes('feature.direct')
    && html.includes('includeFreshIssue: options.includeFreshIssue !== false')
    && html.includes('crossReferenceNaver: options.crossReferenceNaver !== false')
    && html.includes('includeVolumeMetrics: options.includeVolumeMetrics !== false'));

assert('blog draft workflow creates a blueprint before requesting a draft',
  html.includes("workflow: 'blueprint-draft'")
    && html.includes("feature.workflow === 'blueprint-draft'")
    && html.includes('apiPost(endpoints.blueprint')
    && html.includes('apiPost(endpoints.blueprintDraft'));

assert('result center can persist, export, and track keyword outcomes',
  html.includes("keywordGroups: '/v1/mobile/keyword-groups'")
    && html.includes("keywordExport: '/v1/mobile/export/keywords'")
    && html.includes("rankTrackingManual: '/v1/mobile/rank-tracking/manual'")
    && html.includes('id="saveKeywordGroup"')
    && html.includes('id="exportKeywordCsv"')
    && html.includes('id="exportKeywordJson"')
    && html.includes('id="trackTopKeyword"')
    && html.includes('id="trackingPostUrl"'));

assert('result center action handlers call server persistence routes',
  html.includes('function saveKeywordGroupFromResult()')
    && html.includes('function exportKeywordResult(format)')
    && html.includes('function trackTopKeywordFromResult()')
    && html.includes('apiPost(endpoints.keywordGroups')
    && html.includes('apiPost(endpoints.keywordExport')
    && html.includes('apiPost(endpoints.rankTrackingManual')
    && html.includes('downloadArtifact(payload.artifact)'));

const fixed = new Date('2026-06-12T00:00:00.000Z').toISOString();
const snapshot: MobileSourceSignalSnapshot = {
  updatedAt: fixed,
  fallbackUsed: false,
  realtime: [
    {
      kind: 'realtime',
      id: 'naver-1',
      keyword: '네이버 여름 원피스',
      title: '네이버 실시간',
      description: '네이버 검색 수요',
      priority: 100,
      source: 'naver',
      createdAt: fixed,
    },
    {
      kind: 'realtime',
      id: 'daum-1',
      keyword: '다음 장마 준비물',
      title: '다음 랭킹',
      description: '다음 생활 이슈',
      priority: 90,
      source: 'daum',
      createdAt: fixed,
    },
    {
      kind: 'realtime',
      id: 'nate-1',
      keyword: '네이트 방송 출연진',
      title: '네이트 이슈',
      description: '네이트 방송 이슈',
      priority: 80,
      source: 'nate',
      createdAt: fixed,
    },
    {
      kind: 'realtime',
      id: 'zum-1',
      keyword: '줌 실시간 이슈',
      title: 'ZUM 실시간',
      description: '줌 포털 이슈',
      priority: 70,
      source: 'zum',
      createdAt: fixed,
    },
  ],
  policy: [
    {
      kind: 'policy',
      id: 'policy-1',
      keyword: '소상공인 지원금 신청',
      title: '정책브리핑',
      description: '정책 지원금 신호',
      priority: 100,
      source: 'policy-briefing',
      categoryId: 'policy',
      createdAt: fixed,
    },
  ],
  issues: [
    {
      kind: 'issue',
      id: 'issue-1',
      keyword: '신작 드라마 출연진',
      title: '방송 이슈',
      description: '방송 이슈 신호',
      priority: 100,
      source: 'issue-radar',
      categoryId: 'broadcast',
      createdAt: fixed,
    },
  ],
};

const payload = buildPublicSourceSignalPayload(snapshot);
assert('public source payload keeps snapshot compatibility', payload.ok === true && payload.snapshot.realtime.length === 4);
assert('public source payload exposes six lanes', payload.lanes.length === 6, String(payload.lanes.length));
assert('public source payload lane order is fixed', payload.lanes.map((lane) => lane.id).join(',') === 'naver,daum,nate,zum,policy,issue');
assert('public source payload splits portal lanes',
  payload.lanes.find((lane) => lane.id === 'naver')?.items[0]?.source === 'naver'
    && payload.lanes.find((lane) => lane.id === 'daum')?.items[0]?.source === 'daum'
    && payload.lanes.find((lane) => lane.id === 'nate')?.items[0]?.source === 'nate'
    && payload.lanes.find((lane) => lane.id === 'zum')?.items[0]?.source === 'zum');
assert('public source payload includes policy and issue lanes',
  payload.lanes.find((lane) => lane.id === 'policy')?.items[0]?.categoryId === 'policy'
    && payload.lanes.find((lane) => lane.id === 'issue')?.items[0]?.categoryId === 'broadcast');

console.log('[pro-web-site-regression] passed');
