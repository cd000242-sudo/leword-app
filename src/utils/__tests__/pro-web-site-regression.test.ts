import {
  buildPublicSourceSignalPayload,
  renderLewordLanding,
} from '../../../apps/api/src/public-site';
import type { MobileSourceSignalSnapshot } from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[pro-web-site-regression] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const html = renderLewordLanding();

assert('renders LEWORD Pro Web shell', html.includes('LEWORD Pro Web'));
assert('does not expose integration-structure subtab copy', !html.includes('연동구조'));
assert('keeps existing id/password login', html.includes('LEWORD Pro 로그인') && html.includes('아이디') && html.includes('비밀번호'));
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
assert('shows six source lanes in requested order',
  html.indexOf('네이버 <span class="lane-count"') < html.indexOf('다음 <span class="lane-count"')
    && html.indexOf('다음 <span class="lane-count"') < html.indexOf('네이트 <span class="lane-count"')
    && html.indexOf('줌 <span class="lane-count"') > html.indexOf('네이트 <span class="lane-count"')
    && html.includes('정책 <span class="lane-count"')
    && html.includes('이슈 <span class="lane-count"'));
assert('keyword lookup table separates PC and mobile',
  html.includes('<th>PC</th>') && html.includes('<th>모바일</th>') && html.includes('<th>전체</th>') && html.includes('<tbody id="keywordRows">'));

for (const label of [
  'PRO 트래픽 폭발 키워드 헌터',
  '내 노출 추적',
  '쇼핑 커넥트',
  '유튜브 황금키워드',
  '애드센스 승인 키워드 헌터',
  '네이버 메이트 키워드 헌터',
  '지식인 황금질문',
]) {
  assert(`feature visible: ${label}`, html.includes(label));
}

assert('ready server-backed routes are wired',
  html.includes("'/v1/pro/hunt'")
    && html.includes("'/v1/home-board/hunt'")
    && html.includes("'/v1/kin/honey'")
    && html.includes("'/v1/shopping/connect'")
    && html.includes("'/v1/youtube/golden'")
    && html.includes("'/v1/naver/mate'")
    && html.includes("'/v1/mindmap/expand'")
    && html.includes("'/v1/keywords/analyze'"));

assert('renders pro operations dashboard for Electron parity',
  html.includes('id="ops"')
    && html.includes('Pro 운영 대시보드')
    && html.includes('내 노출 추적')
    && html.includes('성과 기록')
    && html.includes('워드프레스/발행')
    && html.includes('스케줄/알림')
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
    && html.includes('data-board-action="analyze"')
    && html.includes('renderFeatureResult(feature, result)'));

assert('renders feature-specific tool settings panel',
  html.includes('id="toolConsole"')
    && html.includes('id="toolTabs"')
    && html.includes('id="toolSeedInput"')
    && html.includes('id="toolCategory"')
    && html.includes('id="toolTargetCount"')
    && html.includes('id="toolSort"')
    && html.includes('id="runSelectedTool"')
    && html.includes('선택 도구 실행'));

assert('tool settings drive server payloads instead of one generic button',
  html.includes('function collectToolOptions()')
    && html.includes('function selectTool(id)')
    && html.includes('runFeature(feature, options)')
    && html.includes('feature.payload(q, runOptions)')
    && html.includes('includeFreshIssue: options.includeFreshIssue !== false')
    && html.includes('crossReferenceNaver: options.crossReferenceNaver !== false')
    && html.includes('includeVolumeMetrics: options.includeVolumeMetrics !== false'));

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
