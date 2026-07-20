import {
  buildPublicSourceSignalPayload,
  renderLewordLanding,
} from '../../../apps/api/src/public-site';
import { renderLewordProWeb } from '../../../apps/api/src/pro-web-site';
import type { MobileSourceSignalSnapshot } from '../../mobile/contracts';
import vm from 'vm';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[pro-web-site-regression] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const html = renderLewordLanding();
const proWebHtml = renderLewordProWeb();
const goldenFallbackPayloadStart = proWebHtml.indexOf('function buildClientGoldenFallbackPayload(error)');
const goldenFallbackPayloadEnd = proWebHtml.indexOf('function renderClientGoldenFallback(error)', goldenFallbackPayloadStart);
const goldenFallbackPayloadBlock = proWebHtml.slice(goldenFallbackPayloadStart, goldenFallbackPayloadEnd);
const regularAdminLoginStart = proWebHtml.indexOf('async function submitAdminLogin(event)');
const regularAdminLoginEnd = proWebHtml.indexOf('const reviewBooleanFields', regularAdminLoginStart);
const regularAdminLoginBlock = proWebHtml.slice(regularAdminLoginStart, regularAdminLoginEnd);
const reviewRequestStart = proWebHtml.indexOf('async function liveGoldenReviewRequest(method, body)');
const reviewRequestEnd = proWebHtml.indexOf('function liveGoldenReviewQuestionHtml', reviewRequestStart);
const reviewRequestBlock = proWebHtml.slice(reviewRequestStart, reviewRequestEnd);
const reviewLoginStart = proWebHtml.indexOf('async function submitLiveGoldenReviewLogin(event)');
const reviewLoginEnd = proWebHtml.indexOf('function defaultAdminSiteContent', reviewLoginStart);
const reviewLoginBlock = proWebHtml.slice(reviewLoginStart, reviewLoginEnd);

assert('includes AdSense site verification script',
  html.includes('ca-pub-4008574892672964')
    && html.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));

for (const [index, match] of Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).entries()) {
  try {
    new vm.Script(match[1], { filename: `pro-web-inline-${index}.js` });
  } catch (err) {
    assert(`inline script ${index} is syntactically valid`, false, err instanceof Error ? err.message : String(err));
  }
}

for (const [index, match] of Array.from(proWebHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)).entries()) {
  try {
    new vm.Script(match[1], { filename: `leword-pro-web-inline-${index}.js` });
  } catch (err) {
    assert(`LEWORD pro web inline script ${index} is syntactically valid`, false, err instanceof Error ? err.message : String(err));
  }
}

assert('renders LEWORD Pro Web shell', html.includes('LEWORD Pro Web'));
assert('LEWORD analyzer blocks article-title strings and renders wide analysis cards',
  proWebHtml.includes('function isArticleTitleLikeKeyword')
    && proWebHtml.includes('보도참고자료')
    && proWebHtml.includes('keyword-analysis-card')
    && proWebHtml.includes('keyword-analysis-related')
    && proWebHtml.includes('자연 연관키워드'));
assert('LEWORD analyzer gives natural Naver-style cultural card expansions',
  proWebHtml.includes('문화누리카드 잔액조회')
    && proWebHtml.includes('문화누리카드 온라인 사용처')
    && proWebHtml.includes('문화누리카드 가맹점'));
assert('LEWORD Pro Web uses blue accents instead of yellow copy accents',
  html.includes('--gold: #0EA5E9')
    && !/#ffe|#ffd|#f8c|#f7dc|#b7f|245,197|248,194|yellow/i.test(html));
assert('uses resilient CSS brand mark instead of a fragile logo image',
  html.includes('class="brand-mark" aria-hidden="true">L</span>')
    && !html.includes('<img class="brand-logo"'));
assert('does not expose integration-structure subtab copy', !html.includes('연동구조'));
assert('keeps existing id/password login', html.includes('LEWORD Pro 로그인') && html.includes('아이디') && html.includes('비밀번호'));
assert('keeps license key auth collapsed as optional login path',
  html.includes('<details class="login-license">')
    && html.includes('id="licenseCode"')
    && html.includes('if (licenseCode) loginPayload.licenseCode = licenseCode'));
assert('pro login shows a welcome modal and starts automatic discovery for KIN and shopping',
  html.includes('id="welcomeModal"')
    && html.includes('class="modal welcome-modal"')
    && html.includes('class="dialog welcome-dialog"')
    && html.includes('class="welcome-status-grid"')
    && html.includes('function openWelcomeModal')
    && html.includes("const postLoginAutoFeatureIds = ['kin', 'shopping']")
    && html.includes('function schedulePostLoginAutoDiscovery')
    && html.includes('schedulePostLoginAutoDiscovery()'));
assert('pro web modals use one opaque premium dialog shell',
  html.includes('rgba(4,14,20,.84)')
    && html.includes('border-radius: 18px')
    && html.includes('0 34px 100px rgba(2,12,18,.48)')
    && html.includes('backdrop-filter: blur(16px) saturate(116%)'));
assert('feature execution progress can be minimized and restored from a bottom pill',
  html.includes('id="progressMinimize"')
    && html.includes('id="progressPill"')
    && html.includes('function minimizeProgress')
    && html.includes('function restoreProgress')
    && html.includes('function renderProgressPill')
    && html.includes('openProgress(feature.title +'));
assert('progress dialog and minimized pill stay opaque on bright theme',
  html.includes('--surface-2: #F3F8F4')
    && html.includes('--text-2: #294234')
    && html.includes('.progress-dialog {')
    && html.includes('background: linear-gradient(180deg, #FFFFFF 0%, #F4FAF6 100%)')
    && html.includes('z-index: 130')
    && html.includes('color: #102217'));
assert('progress dialog uses an opaque high-contrast shell and fades away after completion',
  html.includes('#progressModal {')
    && html.includes('rgba(238,246,240,.96)')
    && html.includes('.modal.open.closing { opacity: 0; pointer-events: none; }')
    && html.includes("modal.classList.add('closing')")
    && html.includes('progressCloseTimer = setTimeout(function()')
    && html.includes('if (pct >= 100 && !progressDone)')
    && html.includes('closeProgress(850)')
    && html.includes('closeProgress(1200)'));
assert('pro login does not masquerade as API key setup',
  html.includes("const nextView = pendingViewAfterLogin || 'golden'")
    && html.includes('pendingViewAfterLogin = null')
    && html.includes('setActiveView(nextView, { load: false });')
    && !html.includes("setActiveView('settings', { load: false });\n        log('Pro 로그인 완료"));
assert('api key settings are separate from Pro login credentials',
  html.includes("const userApiSettingsStorageKey = 'leword.pro.userApiSettings.v1'")
    && html.includes("const proLoginIdStorageKey = 'leword.pro.lastLoginId.v1'")
    && html.includes("localStorage.setItem('leword.pro.session'")
    && html.includes('id="proLoginAccountId"')
    && html.includes('id="proLoginAccountPassword"')
    && html.includes('function prepareFreshProLoginFields')
    && html.includes('function clearProLoginAutofillFromApiSettings')
    && html.includes('function apiSettingsCredentialValues')
    && !html.includes('id="userId"')
    && !html.includes('id="password"')
    && html.includes('if (saved.userId) rememberProLoginUserId(saved.userId);')
    && html.includes('if (session && session.userId) rememberProLoginUserId(session.userId);')
    && html.includes('function rememberProLoginUserId')
    && html.includes('function loginLicenseCodeForSubmit')
    && html.includes("if (!details || !input || !details.open) return '';")
    && html.includes("if (qs('loginMessage')) qs('loginMessage').textContent = '';")
    && html.includes("if (qs('licenseCode')) qs('licenseCode').value = '';")
    && html.includes('id="proLoginRemember"')
    && html.includes('아이디/비밀번호 자동기억하기')
    && html.includes('const proLoginCredentialsStorageKey')
    && html.includes('function readRememberedProLoginCredentials')
    && html.includes('function hydrateRememberedProLoginFields')
    && html.includes('function persistCurrentProLoginRememberChoice')
    && html.includes('persistCurrentProLoginRememberChoice(userId, password);')
    && html.includes('let recentLoginCredentialValues = []')
    && html.includes("qs('proLoginAccountId') && qs('proLoginAccountId').value")
    && html.includes("qs('adminUserId') && qs('adminUserId').value")
    && html.includes('session && session.userId')
    && html.includes('function sanitizeUserApiSettings')
    && html.includes('function toggleApiKeyVisibility')
    && html.includes('data-api-reveal="naverClientId"')
    && html.includes("saveSession(Object.assign({}, payload.session, { userId: payload.session.userId || userId }))")
    && html.includes("const requestHeaders = url === endpoints.session ? { 'Content-Type': 'application/json' } : headers(options);")
    && html.includes("const licenseCode = loginLicenseCodeForSubmit();")
    && html.includes("const loginPayload = { userId: userId, password: password };")
    && !html.includes("saveSession(null);\n        const loginPayload = { userId: userId, password: password };")
    && html.includes('아이디 또는 비밀번호가 맞지 않습니다. 자동완성 값이 들어갔다면 지우고 다시 입력하세요.')
    && html.includes('data-api-key-input="true"')
    && html.includes('autocomplete="off" readonly data-lpignore="true"')
    && html.includes('function clearLoginCredentialAutofillFromApiSettings')
    && html.includes('readUserApiSettings();\n        clearLoginCredentialAutofillFromApiSettings(false);')
    && html.includes('Pro 로그인 아이디/비밀번호가 API 키 칸에 자동 입력되어 제거했습니다.'));
assert('pro login network failures explain API connectivity instead of raw fetch errors',
  proWebHtml.includes('function isFetchNetworkError')
    && proWebHtml.includes('function formatNetworkError')
    && proWebHtml.includes('로그인 API 서버에 연결할 수 없습니다.')
    && proWebHtml.includes('아이디/비밀번호 문제가 아니라 서버 전원, 도메인, SSL 또는 배포 연결이 끊긴 상태입니다.')
    && proWebHtml.includes('if (isFetchNetworkError(err)) throw new Error(formatNetworkError(url, err));'));
assert('pro login raw browser fetch errors are allowed to open offline Pro',
  proWebHtml.includes('function shouldUseOfflineProLoginFallback')
    && proWebHtml.includes('function isLoginApiConnectivityError')
    && proWebHtml.includes('if (isLoginApiConnectivityError(message)) return true;')
    && proWebHtml.includes('/v1\\/web\\/session')
    && proWebHtml.includes('shouldUseOfflineProLoginFallback(userId, password, err)')
    && proWebHtml.includes('Failed to connect|Could not connect|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED')
    && proWebHtml.includes('TypeError|NetworkError'));
assert('server-down Pro login opens an offline local Pro session instead of blocking features',
  proWebHtml.includes('function createOfflineProSession')
    && proWebHtml.includes('function isOfflineProSession')
    && proWebHtml.includes('오프라인 Pro 세션이 연결되었습니다.')
    && proWebHtml.includes('서버 미연결 상태라 오프라인 Pro 세션으로 접속합니다.')
    && proWebHtml.includes('saveSession(createOfflineProSession(userId, message))')
    && proWebHtml.includes("if (session && session.accessToken && !isOfflineProSession()) out.Authorization = 'Bearer ' + session.accessToken")
    && proWebHtml.includes("if (isOfflineProSession()) out['X-Leword-Offline-Pro'] = '1'")
    && proWebHtml.includes('if (isAuthErrorMessage(err.message) && !isOfflineProSession())'));
assert('settings exposes a clean API issue modal and integration status check',
  html.includes('id="openApiIssueModal"')
    && html.includes('API 키 발급 모음')
    && html.includes('id="apiIssueModal"')
    && html.includes('id="apiIssueGrid"')
    && html.includes('id="apiIssueCheck"')
    && html.includes('연동상태 확인')
    && html.includes('https://developers.naver.com/apps/#/register')
    && html.includes('https://manage.searchad.naver.com/customers/links')
    && html.includes('https://console.cloud.google.com/apis/library/youtube.googleapis.com')
    && html.includes('https://console.anthropic.com/settings/keys')
    && html.includes('https://open.manus.ai/')
    && html.includes('https://platform.openai.com/api-keys'));
assert('renders live golden keyword board section',
  html.includes('id="golden"')
    && html.includes('LIVE 황금키워드 보드')
    && html.includes('id="goldenBoardList"')
    && html.includes('id="refreshGolden"'));
assert('loads public and pro golden boards',
  html.includes("publicLiveGolden: apiUrl('/v1/public/live-golden')")
    && html.includes("liveGolden: apiUrl('/v1/live-golden/snapshot')")
    && html.includes('function loadGoldenBoard()')
    && html.includes('renderPublicGoldenBoard')
    && html.includes('renderProGoldenBoard'));
assert('authenticated Pro golden board renders the complete server snapshot without browser refiltering',
  proWebHtml.includes('const sourceRows = exact ? (Array.isArray(items) ? items : []) : filterDisplayGoldenItems(items || []);')
    && proWebHtml.includes('return (Array.isArray(raw) ? raw : []).slice(0, target);')
    && proWebHtml.includes("const grade = escapeHtml((exact ? (item && item.grade) : displayGradeForRow(item)) || '');")
    && !proWebHtml.includes(".filter(function(item) { return displayGradeForRow(item) !== 'C'; });"));
assert('keeps Pro sessions during transient auth failures and retries remembered credentials',
  proWebHtml.includes('function promptProRelogin(message)')
    && proWebHtml.includes('function markProSessionAuthPending(message)')
    && proWebHtml.includes('session.authPending = true;')
    && proWebHtml.includes('session.lastAuthError')
    && proWebHtml.includes('function refreshProSessionFromRememberedCredentials(reason)')
    && proWebHtml.includes("refreshProSessionFromRememberedCredentials('restored-session-validation')")
    && proWebHtml.includes("refreshProSessionFromRememberedCredentials('live-golden-snapshot')")
    && proWebHtml.includes("refreshProSessionFromRememberedCredentials('feature-run')")
    && proWebHtml.includes("Object.assign({}, ui, { authRetry: true })")
    && proWebHtml.includes('openLogin();')
    && proWebHtml.includes('Pro session needs re-auth but was kept locally:')
    && !proWebHtml.includes('Pro board failed; session cleared:')
    && !proWebHtml.includes('Pro board failed, trying public board'));
assert('health polling does not overwrite live board counts with missing metrics',
  html.includes('const liveGolden = health && health.liveGolden')
    && html.includes('Number.isFinite(Number(liveGolden.boardCount))')
    && html.includes('Number.isFinite(Number(liveGolden.boardTarget))')
    && !html.includes("(health.liveGolden.boardCount || 0) + '/' + (health.liveGolden.boardTarget || 120)"));
assert('server failure keeps the golden board empty instead of inventing browser candidates',
  html.includes('function buildClientGoldenFallbackPayload')
    && html.includes('function renderClientGoldenFallback')
    && html.includes('function renderClientFeatureFallback')
    && html.includes('function isServerUnavailableError')
    && html.includes('renderClientGoldenFallback(err)')
    && html.includes('renderClientFeatureFallback(feature, displayKeyword, err)')
    && goldenFallbackPayloadBlock.includes('publicPreviewCount: 0')
    && goldenFallbackPayloadBlock.includes('publicPreview: []')
    && !goldenFallbackPayloadBlock.includes('clientFallbackIntentKeywords')
    && !goldenFallbackPayloadBlock.includes('clientFallbackBoardItem')
    && proWebHtml.includes('임시 조합 키워드는 황금키워드로 표시하지 않습니다.')
    && proWebHtml.includes("setGoldenSummary(0, payload.boardTarget, 0, 0, false")
    && !proWebHtml.includes('서버 복구 후 실측'));
assert('golden snapshot failure exposes a useful reason code without confusing auth and server errors',
  proWebHtml.includes('function clientGoldenFailureReason(error)')
    && proWebHtml.includes("return 'AUTH_REQUIRED'")
    && proWebHtml.includes("return 'NETWORK_ERROR'")
    && proWebHtml.includes("return 'HTTP_5XX'")
    && proWebHtml.includes("return 'SNAPSHOT_ROUTE_NOT_FOUND'")
    && proWebHtml.includes("qs('goldenState').textContent = '연결 오류'"));
assert('browser search helpers remain explicitly unmeasured and separate from the golden board',
  proWebHtml.includes('function clientFallbackSeedExpansionKeywords')
    && proWebHtml.includes('for (let tailIndex = 0; tailIndex < maxTailCount; tailIndex += 1)')
    && proWebHtml.includes('clientFallbackSeedExpansionKeywords(displayKeyword || compactKeywordInput(), featureId, 12)')
    && proWebHtml.includes("source: 'browser-helper'")
    && proWebHtml.includes("grade: '미측정'")
    && proWebHtml.includes("{ label: '실측', value: '미측정 · 서버 연결 후 다시 실행' }")
    && proWebHtml.includes("publicDocumentCountLabel: '미측정 · 서버 연결 후 다시 실행'")
    && !proWebHtml.includes('서버 실측 대기'));
assert('keyword lookup button is labeled as direct lookup, not server lookup',
  proWebHtml.includes('<button class="btn primary" type="submit">조회하기</button>')
    && proWebHtml.includes('키워드를 입력하고 조회하기를 실행하세요.')
    && !proWebHtml.includes('<button class="btn primary" type="submit">서버 조회</button>'));
assert('keyword analyzer and mindmap use user API executor before browser-local fallback',
  proWebHtml.includes('function runBrowserLocalApiLookup')
    && proWebHtml.includes('function fetchBrowserSearchAdKeywordTool')
    && proWebHtml.includes('function fetchBrowserSearchAdKeywordToolBatches')
    && proWebHtml.includes('function fetchBrowserNaverBlogDocumentCount')
    && proWebHtml.includes('function maybeRunBrowserLocalApiLookup')
    && proWebHtml.includes('function shouldRunBrowserLocalFirst')
    && proWebHtml.includes('browser-local-api')
    && proWebHtml.includes('shouldRunBrowserLocalFirst(feature, null)')
    && proWebHtml.includes('function runUserApiServerExecutorLookup')
    && proWebHtml.includes('function runUserApiLookupFirst')
    && proWebHtml.includes("runUserApiServerExecutorLookup(feature, seed, mode, 'user-api-primary')")
    && proWebHtml.includes('const localResult = await runUserApiLookupFirst(feature, displayKeyword, localApiLookupModeForFeature(feature, null));')
    && proWebHtml.includes('환경설정에 저장된 사용자 API 키를 실행 요청에만 전달해 PC/모바일 검색량과 문서수를 조회합니다.')
    && proWebHtml.includes('사용자 API 키로 조회하기')
    && proWebHtml.includes('사용자 API 실행 요청')
    && proWebHtml.includes('isEmptyKeywordResult(result)')
    && proWebHtml.includes('empty-job-result')
    && proWebHtml.includes('empty-direct-result')
    && proWebHtml.includes('X-API-KEY')
    && proWebHtml.includes('X-Customer')
    && proWebHtml.includes('X-Naver-Client-Id')
    && proWebHtml.includes('apiPost(feature.route, payloadBody, { userApiCredentials: true })')
    && proWebHtml.includes('서버 결과가 비어 있어 저장된 사용자 API 키로 직접 조회합니다.')
    && proWebHtml.includes('사용자 API 키 직접 조회 결과가 비어 있습니다.'));
assert('browser-local Blog totals keep spaced broad-query identity and response timestamps',
  proWebHtml.includes('function browserBlogBroadQueryKey(keyword)')
    && proWebHtml.includes("normalizeBrowserBlogBroadQuery(keyword).normalize('NFKC').toLowerCase()")
    && proWebHtml.includes('out.set(browserBlogBroadQueryKey(keyword), measurement)')
    && proWebHtml.includes('const documentKey = browserBlogBroadQueryKey(candidate);')
    && proWebHtml.includes('documentCountQueryKey: docs !== null ? browserBlogBroadQueryKey(keyword) : undefined')
    && proWebHtml.includes("typeof payload.total === 'number'")
    && proWebHtml.includes('Number.isFinite(total) && total >= 0')
    && !proWebHtml.includes('const total = Number(payload.total);')
    && proWebHtml.includes('const controller = new AbortController();')
    && proWebHtml.includes('signal: controller.signal')
    && proWebHtml.includes('clearTimeout(timeout)')
    && !proWebHtml.includes('out.set(normalizeSearchAdKey(keyword), count)'));
assert('keyword-analysis UI does not mislabel a requested row as an exact-phrase document query',
  proWebHtml.includes("if (source === 'pc-keyword-analysis-exact') return '요청 키워드 실측';")
    && proWebHtml.includes("return '문서수(네이버 블로그·확장검색)';")
    && proWebHtml.includes('keywordAnalysisSourceLabel(row)'));
assert('keyword graph remeasures with browser-local APIs instead of drawing synthetic bars',
  proWebHtml.includes('function fetchBrowserLocalExactMetric')
    && proWebHtml.includes('function renderMeasuredTrendGraph')
    && proWebHtml.includes('function renderTrendGraphUnavailable')
    && proWebHtml.includes('hasSearchVolumeMetric(row)')
    && proWebHtml.includes('브라우저에 저장된 사용자 API 키로 직접 조회합니다.')
    && proWebHtml.includes('PC/모바일 실측값과 네이버 데이터랩 30일 상대 추이(실측)만 표시합니다. 추정 환산값은 표시하지 않습니다.')
    && proWebHtml.includes('function loadDatalabTrendStrip')
    && proWebHtml.includes('일별 상대값 — 절대 검색량 아님')
    && proWebHtml.includes('showTrendGraph(keyword).catch')
    && !proWebHtml.includes('function trendSeed')
    && !proWebHtml.includes('Math.max(100, seed * 7)')
    && !proWebHtml.includes('Math.sin((index + seed % 11) / 3)'));
assert('browser-local mindmap expands candidates in batches and rejects article-title copy',
  proWebHtml.includes('function allowBrowserLocalCandidate')
    && proWebHtml.includes('function buildBrowserMindmapSeedHints')
    && proWebHtml.includes('function candidateFitsSeedDomain')
    && proWebHtml.includes('function semanticMindmapFallbackRows')
    && proWebHtml.includes('fetchBrowserSearchAdKeywordToolBatches([keyword].concat(mindmapSeedHints), 8)')
    && proWebHtml.includes("const contextKeywords = mode === 'mindmap-expansion'")
    && proWebHtml.includes('buildLookupContextKeywords(keyword, 160)')
    && proWebHtml.includes("const targetCount = mode === 'mindmap-expansion' ? 80")
    && proWebHtml.includes('Math.min(80, candidates.length)')
    && proWebHtml.includes("if (mode === 'mindmap-expansion') return row.totalSearchVolume !== null || row.documentCount !== null;")
    && proWebHtml.includes("runUserApiServerExecutorLookup(feature, seed, mode, 'browser-local-failure-fallback')")
    && proWebHtml.includes('browser-semantic-mindmap')
    && proWebHtml.includes('seedSignals.policy && candidateSignals.sports')
    && proWebHtml.includes('semanticMindmapFallbackRows(seedLabel, 30)')
    && proWebHtml.includes('검색 전 확인')
    && proWebHtml.includes('제목보다'));
assert('browser-local mindmap blocks terminal and product-housing word-salad chains',
  proWebHtml.includes('function isAwkwardMindmapCompound')
    && proWebHtml.includes('TERMINAL_POLICY_CHAIN_RE')
    && proWebHtml.includes('PRODUCT_HOUSING_CONTEXT_CHAIN_RE')
    && proWebHtml.includes('if (isAwkwardMindmapCompound(seed, clean)) return false;')
    && proWebHtml.includes('if (isAwkwardMindmapCompound(seed, candidate)) return true;')
    && proWebHtml.includes('return semanticMindmapCandidateAllowed(clean, candidate) && !isDuplicatedMindmapIntentChain(clean, candidate)'));
assert('live golden cards explain search intent and route shopping keywords away from the main board',
  proWebHtml.includes('function keywordIntentGuide')
    && proWebHtml.includes('function keywordIntentGuideHtml')
    && proWebHtml.includes('function policyExpansionBranches')
    && proWebHtml.includes('function issueExpansionBranches')
    && proWebHtml.includes('function localExpansionBranches')
    && proWebHtml.includes('function localSearchWhy')
    && proWebHtml.includes('function naverAutocompleteLikeBranches')
    && proWebHtml.includes('function songjihoSeaSkyPathProfile')
    && proWebHtml.includes('송지호 바다하늘길은 강원 고성')
    && proWebHtml.includes('송지호 바다하늘길 주차')
    && proWebHtml.includes('지역 명소 롱테일')
    && proWebHtml.includes('방문 전 체크리스트형')
    && proWebHtml.includes("const base = clean.indexOf('예약') >= 0 ? clean : '제주 렌터카 예약';")
    && proWebHtml.includes("push(base + ' 사이트');")
    && proWebHtml.includes("push(base + ' 방법');")
    && proWebHtml.includes('여름휴가/방학 성수기')
    && proWebHtml.includes('function keywordModifiers')
    && proWebHtml.includes('function isShoppingIntentKeywordRow')
    && proWebHtml.includes('function isAdDominatedKeywordRow')
    && proWebHtml.includes('function isCrossDomainNonsenseKeyword')
    && proWebHtml.includes('function hasTrafficNeedIntent')
    && proWebHtml.includes('function liveNeedScore')
    && proWebHtml.includes('function goldenDisplayLane')
    && proWebHtml.includes('function balanceGoldenDisplayItems')
    && proWebHtml.includes('return balanceGoldenDisplayItems(publishableRows);')
    && proWebHtml.includes('최저임금|주휴수당|근로장려금')
    && proWebHtml.includes('광고 장악 제외')
    && proWebHtml.includes('광고 장악 주의')
    && proWebHtml.includes('정보형 재확장')
    && proWebHtml.includes('|| isAdDominatedKeywordRow(row) || isLowTrafficCaptureKeyword(row)')
    && proWebHtml.includes("if (isAdDominatedKeywordRow(row)) return 'C';")
    && proWebHtml.includes("if (isLowTrafficCaptureKeyword(row)) return 'C';")
    && proWebHtml.includes('의도 충돌')
    && proWebHtml.includes('트래픽 약함')
    && proWebHtml.includes('function isAmbiguousCompositeKeyword')
    && proWebHtml.includes('function shouldHideFromLiveGoldenBoard')
    && proWebHtml.includes('function shouldHideFromMindmap')
    && proWebHtml.includes('function filterDisplayGoldenItems')
    && proWebHtml.includes('function domainSafeIntentBranches')
    && proWebHtml.includes('쇼핑커넥트 전용')
    && proWebHtml.includes('의도 불명확')
    && proWebHtml.includes('검색량 이유</em>')
    && proWebHtml.includes('조합 의도/활용</em>')
    && proWebHtml.includes('function enrichKeywordIntentGuide')
    && proWebHtml.includes('function measuredIntentEvidence')
    && proWebHtml.includes('function aiJudgeIntentEvidence')
    && proWebHtml.includes('판정 근거:')
    && proWebHtml.includes('실측 검색량 ')
    && proWebHtml.includes('검색량은 사퇴/선임 기사 자체보다')
    && proWebHtml.includes('월급·실수령액·주휴수당')
    && proWebHtml.includes('내가 대상인지, 언제 얼마가 들어오는지')
    && proWebHtml.includes('class="intent-branches"')
    && proWebHtml.includes('class="intent-branch"')
    && proWebHtml.includes('홍명보 감독 다음 감독 후보')
    && proWebHtml.includes("year + ' 근로장려금 지급일'")
    && proWebHtml.includes("['2026']")
    && proWebHtml.includes('대한축구협회 비리 전말')
    && proWebHtml.includes('쇼핑커넥트로 보기')
    && proWebHtml.includes('순위.*출시일')
    && proWebHtml.includes('금액.*지급일')
    && proWebHtml.includes('정례대화.*(?:지급일|금액|대상|신청|수당)')
    && proWebHtml.includes('“정례대화”는 회담·외교·정치 이슈형 단어이고 “지급일”은 지원금·급여·정책형 행동어입니다.')
    && proWebHtml.includes('정례대화 결과')
    && proWebHtml.includes('const freshRows = filterFreshGoldenItems(items || [])')
    && proWebHtml.includes('제품형, 광고 장악형, 의도 충돌형, 트래픽 확보 가능성이 약한 키워드는 LIVE 보드에서 숨겼습니다')
    && proWebHtml.includes('return !shouldHideFromMindmap(row);')
    && proWebHtml.includes('function keywordAnalysisCardHtml')
    && proWebHtml.includes('keyword-analysis-card')
    && proWebHtml.includes('keyword-analysis-title')
    && proWebHtml.includes('keyword-analysis-metrics')
    && proWebHtml.includes('function measurementProvenanceHtml')
    && proWebHtml.includes("documentCountQueryMode === 'exact-phrase'")
    && proWebHtml.includes('문서수(정확구문·블로그)')
    && proWebHtml.includes('문서수(네이버 블로그·확장검색)')
    && proWebHtml.includes('row && row.documentCountMeasuredAt')
    && proWebHtml.includes('측정시각 미기록')
    && proWebHtml.includes('measurementProvenanceHtml(row)')
    && proWebHtml.includes('measurementProvenanceHtml(item)')
    && proWebHtml.includes('const ratio = exact && measured ? fmt(rowGoldenRatio(item))')
    && proWebHtml.includes('const hasCompleteSearchVolumeSplit = pc !== null && mobile !== null;')
    && proWebHtml.includes('hasCompleteSearchVolumeSplit ? (pc + mobile) : null')
    && proWebHtml.includes('function naturalRelatedKeywords')
    && proWebHtml.includes('data-board-action="analyze"')
    && proWebHtml.includes('function renderKeywordAnalysisInsight')
    && proWebHtml.includes('class="keyword-expansion-table"')
    && proWebHtml.includes('정밀 분석 해석과 자동완성 확장')
    && proWebHtml.includes('정책·여행에 편향되지 않고')
    && proWebHtml.includes('특정 카테고리로 몰리면 스포츠/연예/생활/교육/테크/금융 후보를 재탐색')
    && proWebHtml.includes('keywordAnalysisCardHtml(row, index)'));
assert('live golden board renders as one vertical list instead of cramped card columns',
  proWebHtml.includes('.golden-list { display: flex; flex-direction: column; gap: 10px; }')
    && proWebHtml.includes('grid-template-columns: minmax(0, 1fr) minmax(230px, .42fr);')
    && proWebHtml.includes('.gk-why { grid-column: 1 / -1;')
    && proWebHtml.includes('<div class="gk-main">')
    && proWebHtml.includes('<div class="gk-why">')
    && proWebHtml.includes('<div class="gk-side">')
    && !proWebHtml.includes('.golden-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }'));
assert('keyword analyzer table stays readable on bright theme',
  proWebHtml.includes('td { color: var(--text); }')
    && proWebHtml.includes('.tiny-btn.green { border-color: rgba(53,211,153,.44); color: #047857;')
    && proWebHtml.includes('.publish-decision strong')
    && !proWebHtml.includes('td { color: #edf4ff; }'));
assert('inline keyword scripts preserve whitespace regex escapes',
  proWebHtml.includes('replace(/\\s+/g')
    && !proWebHtml.includes('replace(/s+/g'));
assert('browser-local keyword grades require document-volume fit before A or S',
  proWebHtml.includes('function browserLocalKeywordQualityScore')
    && proWebHtml.includes('ratio >= 0.8 && score >= 55')
    && proWebHtml.includes('docs <= 20000 && ratio >= 2')
    && !proWebHtml.includes("if (total >= 100) return 'A';"));
assert('keyword table downgrades measured red-ocean rows before display',
  proWebHtml.includes('function isMeasuredDemandTooCrowded')
    && proWebHtml.includes("label: '제외 검토'")
    && proWebHtml.includes("displayGradeForRow(row)")
    && proWebHtml.includes("displayGrade = displayGradeForRow(row)"));
assert('live source backfill prefers source-provided keywords before synthetic expansion',
  proWebHtml.includes('const sourceValues = []')
    && proWebHtml.includes('signal && signal.relatedKeywords')
    && proWebHtml.includes('return sourceCandidates;')
    && proWebHtml.indexOf('return sourceCandidates;') < proWebHtml.indexOf('const raw = normalizeText(signal && (signal.keyword || signal.title));'));
assert('client golden guard keeps regex escapes and live backfill',
  html.includes('const lotto = text.match(/(\\d{3,4})\\s*회\\s*로또|로또\\s*(\\d{3,4})\\s*회/)')
    && html.includes('2027\\s*6모')
    && html.includes("publicSources: apiUrl('/v1/public/source-signals')")
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
assert('LEWORD view removes source board from the golden tab',
  html.includes('data-view-target="golden"')
    && !html.includes('data-view-target="sources"')
    && html.includes('data-view-target="features"')
    && html.includes('data-view-target="youtube"')
    && html.includes('data-view-target="downloads"')
    && html.includes('data-view-target="commerce"')
    && !html.includes('id="sources" data-view="golden"')
    && !html.includes('id="refreshSources"')
    && !html.includes('id="lane-naver"')
    && !html.includes('class="source-grid"')
    && !html.includes("proSources: apiUrl('/v1/mobile/source-signals')")
    && !html.includes('function loadSources')
    && !html.includes('function renderSourceError')
    && !html.includes('function normalizeSourceLanes')
    && !html.includes('loadSources().catch')
    && !html.includes('setInterval(loadSources')
    && !html.includes('실시간 소스 보드')
    && html.includes("if (id === 'sources') return 'golden'")
    && html.includes('class="panel main-view" id="lookup" data-view="lookup"')
    && html.includes('class="panel main-view" id="youtube" data-view="youtube"')
    && html.includes('class="panel main-view" id="downloads" data-view="downloads"')
    && html.includes('class="panel main-view" id="commerce" data-view="commerce"')
    && html.includes('function setActiveView')
    && html.includes("document.querySelectorAll('[data-view-target]')"));

assert('home view starts directly with live golden board without intro or outcome cards',
  !html.includes('LEWORD Pro Web: 서버 기반 키워드 분석')
    && !html.includes('id="homeOutcomes"')
    && !html.includes('id="homeOutcomeCards"')
    && !html.includes('id="refreshHomeOutcomes"')
    && !html.includes('function loadHomeOutcomes()')
    && !html.includes('function renderHomeOutcomesSnapshot')
    && !html.includes('loadHomeOutcomes().catch')
    && !html.includes('성과 기록')
    && !html.includes('id="ops" data-view="ops"')
    && !html.includes('id="opsTabs"')
    && !html.includes('data-ops-tab')
    && !html.includes('data-ops-panel')
    && !html.includes('id="refreshOps"'));

assert('anonymous users are gated to login before leaving the live board',
  html.includes('let pendingViewAfterLogin = null')
    && html.includes("next !== 'golden' && !opts.allowAnonymous && (!session || !session.accessToken)")
    && html.includes("pendingViewAfterLogin = feature.id === 'youtube' ? 'youtube' : 'features'")
    && html.includes("const nextView = pendingViewAfterLogin || 'golden'")
    && html.includes("history.replaceState(null, '', '#golden')"));

assert('site content defaults keep LEWORD detail inside the products page',
  html.includes("href: '/products#product-leword'")
    && !html.includes("{ id: 'leword', name: 'LEWORD', status: 'published', href: '/leword' }"));

assert('commerce tab wires editable catalog, Toss checkout, analytics, and admin sales dashboard',
  html.includes('https://js.tosspayments.com/v2/standard')
    && html.includes("adminCommerceDashboard: apiUrl('/v1/admin/commerce/dashboard')")
    && html.includes("publicCommerceCatalog: apiUrl('/v1/public/commerce/catalog')")
    && html.includes("analyticsCollect: apiUrl('/v1/analytics/collect')")
    && html.includes("checkoutOrders: apiUrl('/v1/checkout/orders')")
    && html.includes("tossConfirm: apiUrl('/v1/payments/toss/confirm')")
    && html.includes('id="commerceCatalog"')
    && html.includes('id="commerceDashboard"')
    && html.includes('id="checkoutForm"')
    && html.includes('function loadCommerceCatalog')
    && html.includes('function submitCheckout')
    && html.includes('function handleCheckoutRedirect')
    && html.includes('function loadCommerceDashboard')
    && html.includes('function initialViewId')
    && html.includes("return isAdminSurface() ? 'commerce' : 'golden'")
    && html.includes("sendCommerceAnalytics('pageview', 'pageview'"));

assert('admin site content exposes form-based product and pricing edits',
  html.includes('id="adminProductEditor"')
    && html.includes('id="refreshAdminProductEditor"')
    && html.includes('function renderAdminProductEditor')
    && html.includes('function syncAdminProductEditorToJson')
    && html.includes('data-admin-product-field="name"')
    && html.includes('data-admin-plan-field="price"')
    && html.includes('data-admin-add-plan')
    && html.includes('data-admin-remove-product')
    && html.includes('data-admin-remove-plan'));
assert('mobile Pro Web chrome can collapse above the live board',
  html.includes('<main class="shell mobile-pro-collapsed" id="proShell">')
    && html.includes('id="mobileProShellToggle"')
    && html.includes('aria-controls="proTopNav proSidebar"')
    && html.includes('.shell.mobile-pro-collapsed .nav')
    && html.includes('.shell.mobile-pro-collapsed .sidebar')
    && html.includes('.shell.mobile-pro-collapsed .hero')
    && html.includes('function setMobileProChromeCollapsed')
    && html.includes("localStorage.setItem(mobileProChromeStorageKey, value)"));
assert('public source endpoint remains only as golden preview backfill',
  html.includes("publicSources: apiUrl('/v1/public/source-signals')")
    && html.includes('function liveSignalBackfillItems')
    && html.includes('payload.clientBackfill = liveSignalBackfillItems')
    && html.includes('apiGet(endpoints.publicSources, false)')
    && !html.includes("endpoints.proSources + '?limit=60'")
    && !html.includes('allItems.slice(0, 12)'));
assert('keyword lookup table separates PC and mobile',
  html.includes('<th>PC</th>') && html.includes('<th>모바일</th>') && html.includes('<th>전체</th>') && html.includes('<tbody id="keywordRows">'));

assert('keyword analyzer keeps raw analysis rows and shares them with mindmap expansion',
  html.includes('function keywordResultRows(result)')
    && html.includes('function buildLookupContextKeywords(seed, limit)')
    && html.includes('function withKeywordContextPayload(url, body)')
    && html.includes('payload.contextKeywords = buildLookupContextKeywords(seed')
    && html.includes("payload.engineVersion = 'web-electron-parity-20260616'")
    && html.includes('const rows = keywordResultRows(result);')
    && !html.includes('const rows = filterFreshGoldenItems(Array.isArray(result && result.keywords) ? result.keywords : []);'));
assert('mindmap semantic guard blocks housing launch-date nonsense and keeps measured-only metrics',
  proWebHtml.includes('HOUSING_KEYWORD_RE')
    && proWebHtml.includes('PRODUCT_LAUNCH_INTENT_G')
    && proWebHtml.includes('function semanticMindmapCandidateAllowed')
    && proWebHtml.includes('function repairMindmapCandidate')
    && proWebHtml.includes("if (hadLaunchIntent) clean = base;")
    && proWebHtml.includes('원룸/월세/전세/보증금/관리비 같은 주거 키워드에 출시일/발매일/사전예약/공식영상/스펙을 붙인 조합')
    && proWebHtml.includes('아직 실측되지 않은 확장 후보입니다. 조회하기를 실행하면 PC/모바일/문서수/경쟁비를 채웁니다.'));
assert('mindmap and keyword analyzer retry server executor when browser API yields zero measured rows',
  proWebHtml.includes('browser local API produced zero measured rows; retrying through server executor')
    && proWebHtml.includes("return await runUserApiServerExecutorLookup(feature, seed, mode, 'browser-zero-measured-fallback')")
    && proWebHtml.includes('마인드맵 후보의 PC/모바일 검색량을 추가 실측하고 있습니다.'));

assert('pro traffic hunter shares web analysis context with the PC engine',
  /id:\s*'pro-traffic'[\s\S]{0,520}contextKeywords:\s*buildLookupContextKeywords/.test(html)
    && /id:\s*'pro-traffic'[\s\S]{0,520}autoDiscovery:\s*true/.test(html)
    && /id:\s*'pro-traffic'[\s\S]{0,220}defaultTargetCount:\s*60/.test(html)
    && /id:\s*'pro-traffic'[\s\S]{0,520}targetCount:\s*options\.targetCount\s*\|\|\s*60/.test(html));
assert('pro traffic hunter explains the server prewarmed cache path',
  html.includes('서버가 24시간 prewarm한 PRO 트래픽 후보')
    && html.includes('서버 24시간 prewarm 후보'));

assert('all keyword-discovery subtabs share web analysis context with PC engines',
  /id:\s*'naver-mate'[\s\S]{0,560}contextKeywords:\s*buildLookupContextKeywords/.test(html)
    && /id:\s*'shopping'[\s\S]{0,560}contextKeywords:\s*buildLookupContextKeywords/.test(html)
    && /id:\s*'kin'[\s\S]{0,560}contextKeywords:\s*buildLookupContextKeywords/.test(html));

for (const label of [
  'PRO 트래픽 폭발키워드 헌터',
  '네이버 메이트 황금키워드 헌터',
  '쇼핑커넥트 황금제품키워드',
  '지식인 황금키워드',
  '유튜브 황금키워드 및 쇼츠분석',
  '키워드 분석기',
  '추가 기능',
  'PC 앱 다운로드',
  '모바일 APK 다운로드',
]) {
  assert(`feature visible: ${label}`, html.includes(label));
}

assert('noisy duplicate and non-discovery tool tabs are removed from Pro feature tabs',
  !html.includes('data-tool-shortcut="mindmap"')
    && !html.includes('data-view-shortcut="sources"')
    && !html.includes('황금키워드 정밀 발굴')
    && !html.includes('니치/얼티밋 키워드 발굴')
    && !html.includes('애드센스 승인 키워드 헌터')
    && !html.includes('data-view-target="ops"')
    && !html.includes('data-view-target="workbench"')
    && !/id:\s*'keyword-analysis'[\s\S]{0,120}group:\s*'expand'/.test(html)
    && !/id:\s*'mindmap'[\s\S]{0,120}group:\s*'expand'/.test(html)
    && !/id:\s*'source-radar'[\s\S]{0,120}group:\s*'sources'/.test(html)
    && !/id:\s*'api-status'[\s\S]{0,120}group:\s*'system'/.test(html)
    && html.includes("id=\"lookupMode\"")
    && html.includes("value=\"mindmap-expansion\"")
    && html.includes("data-board-action=\"mindmap\""));

assert('additional feature subtabs are limited to the requested keyword-discovery set',
  html.includes("const toolTabFeatureIds = ['pro-traffic', 'naver-mate', 'shopping', 'kin']")
    && html.includes("id: 'youtube'")
    && !html.includes("id: 'niche'")
    && !html.includes("id: 'golden-discovery'")
    && !html.includes("id: 'content-blueprint'")
    && !html.includes("id: 'exposure'"));

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

assert('shopping connect renders product picks and writing angles in keyword results',
  html.includes('function shoppingProductPickHtml')
    && html.includes('shoppingProductPick')
    && html.includes('추천 제품')
    && html.includes('글감')
    && html.includes('전환 포인트'),
  'shopping connect results must show which product to write and why it can convert');

assert('operations and execution log are not exposed as user navigation tabs',
  !html.includes('data-view-target="ops"')
    && !html.includes('data-view-target="workbench"')
    && !html.includes('id="ops" data-view="ops"')
    && !html.includes('id="opsTabs"')
    && !html.includes('data-ops-tab')
    && !html.includes('data-ops-panel')
    && !html.includes('id="refreshOps"')
    && !html.includes('function loadOpsDashboard')
    && !html.includes('전체 Pro 기능')
    && !html.includes('노출/성과/발행/스케줄')
    && !html.includes('실행 로그</a>')
    && html.includes("const viewIds = ['golden', 'lookup', 'features', 'youtube', 'settings', 'downloads', 'commerce']"));

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
    && html.includes('function renderFeatureResult(feature, result'));

assert('keyword analyzer hides duplicate lookup insight while mindmap renders branches',
  html.includes('function clearLookupInsight')
    && html.includes('function clearResultSummary')
    && html.includes('function renderMindmapLookupInsight')
    && html.includes('class="mindmap-view"')
    && html.includes('class="mindmap-branches"')
    && html.includes('class="mindmap-row"')
    && html.includes('class="mindmap-sections"')
    && html.includes('data-mindmap-kind="')
    && html.includes('renderMindmapSection(')
    && html.includes('mindmapIssueLongtailBranches(')
    && html.includes('mindmapExpansionBranches(')
    && html.includes('mindmapSearchReason(')
    && html.includes('mindmapCombinationIntent(')
    && html.includes('row.isMeasured === true')
    && html.includes('feature && feature.route === endpoints.keywordAnalysis')
    && html.includes('clearResultSummary();')
    && html.includes('clearLookupInsight();')
    && html.includes('feature && feature.route === endpoints.mindmap')
    && html.includes('renderMindmapLookupInsight(compactKeywordInput(), result)'));

assert('renders feature-specific tool settings panel',
  html.includes('id="toolConsole"')
    && !html.includes('id="quickFeatureDock"')
    && !html.includes('data-tool-shortcut=')
    && !html.includes('data-feature-shortcut="youtube"')
    && html.includes('id="toolGroupTabs"')
    && html.includes('[hidden] { display: none !important; }')
    && html.includes('id="toolTabs"')
    && !html.includes('id="toolDetail"')
    && html.includes('id="toolResultPanel"')
    && html.includes('function selectToolGroup')
    && html.includes('function currentGroupFeatures')
    && html.includes('function renderToolFeatureResult')
    && html.includes('type="hidden" id="toolSeedInput"')
    && html.includes('id="toolAutoDiscoveryPanel"')
    && html.includes('id="toolAutoModeTitle"')
    && html.includes('id="toolCategory"')
    && html.includes('id="toolTargetCount"')
    && html.includes('id="toolSort"')
    && html.includes('id="runSelectedTool"')
    && html.includes('자동 발굴 실행')
    && !html.includes('id="copyLookupKeyword"')
    && !html.includes('조회 키워드 가져오기'));

assert('additional features run as automatic discovery subtabs instead of seed-entry tools',
  html.includes('function toolTabDescription')
    && html.includes('function toolAutoModeText')
    && html.includes('function latestSourceKeywordForCategory')
    && html.includes('function autoSeedKeyword')
    && html.includes("seedKeyword: q || options.autoSeedKeyword || '오늘 실시간 이슈'")
    && html.includes("keyword: q || ''")
    && html.includes("options.autoDiscovery = !options.keyword")
    && html.includes('<em>자동 발굴 · 목표 ')
    && html.includes("target.hidden = true")
    && !html.includes('실행 키워드 필수')
    && !html.includes('시드 키워드 선택 입력'));

assert('youtube lives only in the side youtube view, not in additional feature subtabs',
  html.includes("const youtubeFeature = { id: 'youtube'")
    && html.includes('id="runYoutubeTool"')
    && html.includes('id="youtubeResultPanel"')
    && html.includes('function collectYoutubeOptions')
    && html.includes("setActiveView('youtube'")
    && html.includes('유튜브 전용 사이드 화면')
    && !/const features = \[[\s\S]{0,900}id:\s*'youtube'/.test(html));

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

assert('user API key settings are first-class, local-only, and secret-safe',
  html.includes('id="naverApiSettings"')
    && html.includes('data-view-target="settings"')
    && html.includes('id="settings" data-view="settings"')
    && html.includes('환경설정')
    && html.includes('서버 공용 설정으로 저장하지 않으며 실행 요청에만 전달됩니다.')
    && html.includes('id="naverClientId"')
    && /id="naverClientSecret"[^>]*type="password"/.test(html)
    && html.includes('id="naverSearchAdAccessLicense"')
    && /id="naverSearchAdSecretKey"[^>]*type="password"/.test(html)
    && html.includes('id="naverSearchAdCustomerId"')
    && /id="youtubeApiKey"[^>]*type="password"/.test(html)
    && /id="anthropicApiKey"[^>]*type="password"/.test(html)
    && /id="manusApiKey"[^>]*type="password"/.test(html)
    && /id="openaiApiKey"[^>]*type="password"/.test(html)
    && html.includes(' · AI 추론 ')
    && html.includes("AI 추론 ' + aiReadyCount + '/2")
    && html.includes('Manus 키는 현재 Pro Web 추론 보조에서는 사용하지 않습니다.')
    && html.includes('Manus(Pro Web 미연결)')
    && html.includes('id="externalAiInferenceOptIn"')
    && html.includes('id="externalAiInferenceProvider"')
    && html.includes('외부 AI 설명 보강 사용 · 기본 꺼짐(0원)')
    && html.includes('job당 최대 1회 호출')
    && html.includes('상위 8행, 출력 상한 2048 tokens')
    && html.includes('실패 시 다른 provider를 자동 호출하지 않습니다.')
    && html.includes('실제 금액은 공급자 청구서에서 확인하세요.')
    && html.includes('구조화 결과행·검색량·문서수·등급은 바꾸지 않으며, AI가 만든 연관어·확장어는 미실측 제안입니다.')
    && html.includes('구조화 결과행·검색량·문서수·등급은 실측 구조를 유지합니다. AI 생성 연관어·확장어는 미실측 제안입니다.')
    && html.includes('maxAgentRows: 8')
    && html.includes("const externalAiInferenceSettingsStorageKey = 'leword.pro.externalAiInferenceSettings.v1'")
    && html.includes('function resolvedExternalAiInferenceState')
    && html.includes('includeAiInference: externalAi.enabled')
    && html.includes('forceExternalInference: externalAi.enabled')
    && html.includes('externalAi: externalAi.enabled')
    && !html.includes('includeAiInference: true')
    && !html.includes('forceExternalInference: true')
    && !html.includes('externalAi: true')
    && html.includes("{ label: 'AI 보조', value: externalAiStatus }")
    && html.includes('agentInsightExternalAttemptedProviders')
    && html.includes('agentInsightExternalCallCount')
    && html.includes('agentInsightExternalKeyOwner')
    && html.includes("Object.prototype.hasOwnProperty.call(summary, 'agentInsightExternalCallCount')")
    && html.includes('externalAiProvider && (!hasReportedCallCount || reportedCallCountValue > 0)')
    && html.includes('!hasReportedCallCount && /recovered|복구|fallback|anthropic failed/i.test(externalAiError)')
    && html.includes("'외부 AI 꺼짐 · provider 시도 0개 · 호출 0회 · 규칙 보조'")
    && html.includes('id="apiSettingsChecklist"')
    && html.includes('function apiSettingGroups')
    && html.includes('function apiSettingGroupState')
    && html.includes('function renderApiSettingsChecklist')
    && html.includes('function missingApiGroupsForRun')
    && html.includes('function renderApiKeyRequired')
    && html.includes('네이버 API 키 발급')
    && html.includes('네이버 검색광고 API 키 발급')
    && html.includes('id="clearNaverApiSettings"')
    && html.includes("const userApiSettingsStorageKey = 'leword.pro.userApiSettings.v1'")
    && html.includes("out['X-Leword-User-Api-Credentials']")
    && html.includes("{ userApiCredentials: true }")
    && html.includes('function saveNaverApiSettings')
    && html.includes('function checkNaverApiSettings')
    && html.includes('function clearNaverApiSettings')
    && html.includes('필수 API 키 누락')
    && html.includes('API 키 필요')
    && html.includes('서버 공용 저장 아님')
    && !html.includes("naverApiSettings: apiUrl('/v1/mobile/api-settings/naver')"));

assert('Naver document-count connection check performs a real read-only OpenAPI probe',
  proWebHtml.includes("fetchBrowserNaverBlogDocumentCount('네이버')")
    && proWebHtml.includes('openApiProbeError')
    && proWebHtml.includes("openApiCheck.status = 'verified'")
    && proWebHtml.includes("openApiCheck.status = 'error'")
    && proWebHtml.includes("'저장됨·미검증'")
    && proWebHtml.includes("'실호출 실패'")
    && proWebHtml.includes("'실호출 정상(문서 '"),
  'stored keys and a successful document-count API call must not be reported as the same state');

const settingsHydrateIndex = html.indexOf("if (next === 'settings') {\n        hydrateNaverApiSettingsForm();\n        startApiAutofillGuard(30000);");
const loadFalseIndex = html.indexOf('if (opts.load === false) return;');
assert('API settings resist credential autofill and hydrate even when opened without view loading',
  settingsHydrateIndex >= 0
    && loadFalseIndex >= 0
    && settingsHydrateIndex < loadFalseIndex
    && html.includes('function lockApiInputAgainstCredentialAutofill')
    && html.includes('input.setAttribute(\'readonly\', \'readonly\')')
    && html.includes('function unlockApiInputForTyping')
    && html.includes("document.querySelectorAll('[data-api-key-input]')")
    && html.includes('startApiAutofillGuard(30000)'));

assert('admin-only AI settings report Codex and Claude Code readiness without claiming inference execution',
  html.includes('id="adminAiWorkerSettings"')
    && html.includes('관리자 AI 실행 준비 상태')
    && html.includes('name="adminAiWorkerProvider" value="codex"')
    && html.includes('name="adminAiWorkerProvider" value="claude-code"')
    && html.includes('name="adminAiWorkerProvider" value="api"')
    && html.includes('id="codexCliLoggedIn"')
    && html.includes('id="claudeCodeCliLoggedIn"')
    && !html.includes('id="adminAiFiveHourWindow"')
    && !html.includes('5시간 사용 창 안에서 추론')
    && html.includes('id="adminAiMindmapAssist"')
    && html.includes('id="adminAiKeywordResearchAssist"')
    && html.includes('id="saveAdminAiWorkerSettings"')
    && html.includes('id="checkAdminAiWorkerSettings"')
    && html.includes('id="adminPasswordModal"')
    && html.includes('id="adminSettingsPassword"')
    && html.includes('id="adminPasswordConfirm"')
    && html.includes("adminSettingsUnlock: apiUrl('/v1/admin/settings/unlock')")
    && html.includes("adminAiWorkerStatus: apiUrl('/v1/admin/ai-worker/status')")
    && html.includes("const adminAiWorkerSettingsStorageKey = 'leword.pro.adminAiWorkerSettings.v1'")
    && html.includes("const adminSettingsUnlockStorageKey = 'leword.pro.adminSettingsUnlocked.v1'")
    && !html.includes('adminSettingsPasswordHash')
    && html.includes('function isAdminSession')
    && html.includes('function isAdminSettingsUnlocked')
    && html.includes('function openAdminPasswordModal')
    && html.includes('function adminAiWorkerServerWorker')
    && html.includes("session.tier === 'admin'")
    && html.includes('function adminAiWorkerRequestPayload')
    && html.includes("mode: 'admin-readiness-status'")
    && html.includes('statusOnly: true')
    && html.includes('inferenceDispatched: false')
    && html.includes('serverVerified: !!settings.lastServerStatus')
    && html.includes("storage: 'server-verified-admin'")
    && html.includes('서버에서 Codex/Claude Code CLI 설치와 로그인 상태를 확인합니다.')
    && !html.includes('usageWindowHours: settings.fiveHourWindow === false ? null : 5')
    && html.includes('mindmapAssist: settings.mindmapAssist !== false')
    && html.includes('keywordResearchAssist: settings.keywordResearchAssist !== false')
    && html.includes('payload.adminAiWorker = adminAiWorker')
    && !html.includes('@Qkrtjdgus12')
    && html.includes('관리자 전용 readiness/status 설정입니다. Codex/Claude Code 추론은 실행하지 않습니다.')
    && html.includes('Codex CLI 설치·로그인 상태만 확인합니다. 키워드 리서치나 추론을 실행하지 않습니다.')
    && html.includes('Claude Code CLI 설치·로그인 상태만 확인합니다. 선택값은 추론 provider로 사용되지 않습니다.')
    && !html.includes('id="userId" name="leword-api-naver-client-id"')
    && !html.includes('id="password" name="leword-api-naver-client-secret"')
    && !html.includes('id="userId" name="leword-local-api-naver-client-id"')
    && !html.includes('id="password" name="leword-local-api-naver-client-secret"'));

assert('Phase 2 blind review requires an isolated in-memory reviewer session and a complete irreversible cohort submission',
  proWebHtml.includes('id="liveGoldenReviewPanel"')
    && proWebHtml.includes('id="liveGoldenReviewLoginModal"')
    && proWebHtml.includes('id="liveGoldenReviewLoginForm"')
    && proWebHtml.includes("liveGoldenReview: apiUrl('/v1/admin/live-golden/review')")
    && proWebHtml.includes("sessionPurpose: 'live-golden-review'")
    && proWebHtml.includes('let liveGoldenReviewSession = null;')
    && proWebHtml.includes('let liveGoldenReviewPacket = null;')
    && proWebHtml.includes('function reviewSessionHeaders')
    && proWebHtml.includes("Authorization: 'Bearer ' + liveGoldenReviewSession.accessToken")
    && proWebHtml.includes('function sameLiveGoldenReviewBinding')
    && proWebHtml.includes('const preserveDecisions = sameLiveGoldenReviewBinding(liveGoldenReviewPacket, nextPacket);')
    && proWebHtml.includes('liveGoldenReviewSession = null;')
    && proWebHtml.includes('검수 전용 세션이 만료되었습니다. 입력한 판정은 유지됩니다. 재인증하세요.')
    && proWebHtml.includes('코호트가 변경되어 기존 판정을 폐기했습니다. 새 코호트를 처음부터 전수 검수하세요.')
    && proWebHtml.includes("schemaVersion: 'live-golden-blind-review-submission-v2'")
    && proWebHtml.includes("const reviewBooleanFields = ['naturalKeyword', 'intentMatch', 'hiddenKnown', 'malformed', 'semanticDuplicate', 'platformResidue', 'sentenceResidue'];")
    && proWebHtml.includes("hiddenKnown: classification === 'hiddenKnown'")
    && proWebHtml.includes("const confirmation = '코호트 ' + liveGoldenReviewPacket.cohortId + ' / ' + rows.length + '개 행을 제출합니다.")
    && proWebHtml.includes('이 제출은 되돌릴 수 없으며, 한 행이라도 실패하면 코호트가 불변 종료됩니다.')
    && proWebHtml.includes('if (!window.confirm(confirmation)) return;')
    && regularAdminLoginBlock.includes('adminLogin: true')
    && !regularAdminLoginBlock.includes('sessionPurpose')
    && reviewRequestBlock.includes('headers: reviewSessionHeaders()')
    && !reviewRequestBlock.includes('session.accessToken')
    && !reviewLoginBlock.includes('saveSession(')
    && !reviewLoginBlock.includes('localStorage')
    && !reviewLoginBlock.includes('sessionStorage')
    && !proWebHtml.includes('saveSession(liveGoldenReviewSession)')
    && !proWebHtml.includes('localStorage.setItem(\'leword.pro.liveGoldenReviewSession\'')
    && !proWebHtml.includes('sessionStorage.setItem(\'leword.pro.liveGoldenReviewSession\'')
    && !proWebHtml.includes('obviousHead: classification'));

assert('Phase 2 blind review renders only the server packet and starts every decision unselected',
  proWebHtml.includes('function renderLiveGoldenReviewPacket')
    && proWebHtml.includes("const rows = Array.isArray(packet && packet.rows) ? packet.rows : [];")
    && proWebHtml.includes("escapeHtml(row.keyword || '')")
    && proWebHtml.includes("escapeHtml(row.category || '')")
    && proWebHtml.includes("escapeHtml(row.intent || '')")
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'naturalKeyword'")
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'intentMatch'")
    && proWebHtml.includes('data-review-field="discoveryClass"')
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'malformed'")
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'semanticDuplicate'")
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'platformResidue'")
    && proWebHtml.includes("liveGoldenReviewQuestionHtml(index, 'sentenceResidue'")
    && !proWebHtml.includes('value="true" checked')
    && !proWebHtml.includes('value="false" checked')
    && !proWebHtml.includes('value="hiddenKnown" checked')
    && !proWebHtml.includes('value="obviousHead" checked')
    && !proWebHtml.includes('bulkPassLiveGoldenReview')
    && !proWebHtml.includes('liveGoldenReviewPacket.rows.map(function(row) { return Object.assign'));

assert('all keyword tools attach agent assist instructions to every execution payload',
  html.includes('function agentAssistRequestPayload')
    && html.includes('function agentAssistFeatureId')
    && html.includes('web-agent-assist-v1')
    && html.includes('reject-nonsense-composite')
    && html.includes('explain-real-search-demand')
    && html.includes('validate-golden-keyword-fit')
    && html.includes('find-beginner-monetizable-hidden-needs')
    && html.includes('mustFind: charter.mustFind')
    && html.includes('rejectIf: charter.rejectIf')
    && html.includes('rankingRubric: charter.rankingRubric')
    && html.includes('researchChecklist: charter.researchChecklist')
    && html.includes('hunterCharter: charter')
    && html.includes('expand-autocomplete-keywords')
    && html.includes('pick-sellable-products')
    && html.includes('rank-actionable-traffic-keywords')
    && html.includes('includeBeginnerPublishingAngle: true')
    && html.includes('includeMonetizationRoute: true')
    && html.includes('outputFields: [')
    && html.includes("'searchVolumeReason'")
    && html.includes("'combinationIntent'")
    && html.includes("'autocompleteKeywords'")
    && html.includes("'expandedKeywords'")
    && html.includes("explanationStyle: externalAi.enabled ? 'opt-in-external-explanation' : 'server-rule-explanation'")
    && html.includes("generatedKeywordMeasurement: 'unmeasured-suggestion'")
    && html.includes('preserveStructuredResultRows: true')
    && html.includes('function agentInferredKeywordGuide')
    && html.includes('function agentObjectCandidates')
    && html.includes("source: 'mindmap-agent-inference'")
    && html.includes('payload.agentAssist = agentAssist')
    && html.includes('payload.includeAiInference = agentAssist.includeAiInference === true')
    && html.includes("agentAssist: agentAssistRequestPayload(feature.route, { keyword: keyword, seedKeyword: keyword })"));

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
    && html.includes("pcFeatures: apiUrl('/v1/mobile/pc-features')")
    && html.includes('renderFeatureCatalog(pcCatalog, status.snapshot || status)')
    && html.includes('data-catalog-tab')
    && html.includes('data-catalog-run'));

assert('renders working app download surface',
  html.includes('id="downloads"')
    && html.includes("downloads: apiUrl('/v1/downloads')")
    && html.includes('pcDownload: pcReleaseUrl')
    && html.includes('androidDownload: androidReleaseUrl')
    && html.includes('id="pcDownloadButton"')
    && html.includes('id="androidDownloadButton"')
    && html.includes('id="pcDownloadMeta"')
    && html.includes('id="androidDownloadMeta"')
    && html.includes('function loadDownloads()')
    && !html.includes('github.com/cd000242-sudo/leword-app/releases/download'));

const downloadsStart = html.indexOf('<section class="panel main-view" id="downloads" data-view="downloads">');
const downloadsEnd = html.indexOf('<section class="panel main-view" id="commerce" data-view="commerce">', downloadsStart);
const downloadsHtml = downloadsStart >= 0 && downloadsEnd > downloadsStart ? html.slice(downloadsStart, downloadsEnd) : '';
const adminContentStart = html.indexOf('id="adminSiteContentSettings"');
const adminContentEnd = html.indexOf('<section class="panel main-view" id="downloads" data-view="downloads">', adminContentStart);
const adminContentHtml = adminContentStart >= 0 && adminContentEnd > adminContentStart ? html.slice(adminContentStart, adminContentEnd) : '';

assert('download upload controls are not exposed inside LEWORD Pro Web',
  !html.includes("adminDownloadUpload: apiUrl('/v1/admin/downloads/upload')")
    && !html.includes('function uploadDownloadFile(kind, file)')
    && !html.includes('id="adminDownloadUploadPanel"')
    && !html.includes('id="downloadAdminLogin"')
    && !html.includes('data-download-upload-kind')
    && !downloadsHtml.includes('download-upload-panel')
    && !adminContentHtml.includes('download-upload-panel'));

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

assert('feature runner separates auth expiry from missing server deployment',
  html.includes('function formatApiError')
    && html.includes('status === 404')
    && html.includes('API 경로 또는 job 상태를 찾지 못했습니다')
    && html.includes('function resolveApiLink')
    && html.includes('apiGet(resolveApiLink(jobPayload.links.self), true)')
    && html.includes('function isRouteMissingMessage')
    && html.includes('openLogin();')
    && html.includes("const statusLabel = isRouteMissingMessage(err.message) ? 'API 경로 확인' : '오류'"));

assert('blog draft workflow is not exposed in keyword-discovery-only tabs',
  !html.includes("id: 'blueprint-draft'")
    && !html.includes('블로그 초안 생성'));

assert('result center can persist, export, and track keyword outcomes',
  html.includes("keywordGroups: apiUrl('/v1/mobile/keyword-groups')")
    && html.includes("keywordExport: apiUrl('/v1/mobile/export/keywords')")
    && html.includes("rankTrackingManual: apiUrl('/v1/mobile/rank-tracking/manual')")
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
assert('public source payload does not synthesize source lane items',
  payload.lanes.every((lane) => lane.items.length === 1),
  payload.lanes.map((lane) => `${lane.id}:${lane.items.length}`).join(','));
assert('public source payload splits portal lanes',
  payload.lanes.find((lane) => lane.id === 'naver')?.items[0]?.source === 'naver'
    && payload.lanes.find((lane) => lane.id === 'daum')?.items[0]?.source === 'daum'
    && payload.lanes.find((lane) => lane.id === 'nate')?.items[0]?.source === 'nate'
    && payload.lanes.find((lane) => lane.id === 'zum')?.items[0]?.source === 'zum');
assert('public source payload includes policy and issue lanes',
  payload.lanes.find((lane) => lane.id === 'policy')?.items[0]?.categoryId === 'policy'
    && payload.lanes.find((lane) => lane.id === 'issue')?.items[0]?.categoryId === 'broadcast');

const emptySourcePayload = buildPublicSourceSignalPayload({
  updatedAt: fixed,
  realtime: [],
  policy: [],
  issues: [],
  fallbackUsed: true,
});
assert('public source payload keeps empty source lanes empty',
  emptySourcePayload.lanes.every((lane) => lane.items.length === 0),
  emptySourcePayload.lanes.map((lane) => `${lane.id}:${lane.items.length}`).join(','));

assert('LEWORD pro web renders measured extra-field flags (C4 web port)',
  proWebHtml.includes('function goldenMeasuredFlagsHtml')
    && proWebHtml.includes('gk-flags')
    && proWebHtml.includes('가치게이트')
    && proWebHtml.includes('실측 SERP 진입'));
assert('display-grade C rows are blocked from public/client-derived board paths only',
  /filterFreshGoldenItems\(items \|\| \[\]\)\.filter\(function\(item\) \{\s*return !shouldHideFromLiveGoldenBoard\(item\) && displayGradeForRow\(item\) !== 'C';/.test(proWebHtml)
    && !/proGoldenBoardItems[\s\S]{0,600}\.filter\(function\(item\) \{ return displayGradeForRow\(item\) !== 'C'; \}\)/.test(proWebHtml));
assert('preview policy label is honest (no lower-five wording)',
  proWebHtml.includes('실측 검증 5선 공개') && !proWebHtml.includes('하위 5개 공개'));
assert('golden board renders category tabs with counts and click filter',
  proWebHtml.includes('id="goldenCategoryTabs"')
    && proWebHtml.includes('function renderGoldenCategoryTabs')
    && proWebHtml.includes('data-golden-category')
    && proWebHtml.includes('GOLDEN_CATEGORY_LABELS'));
assert('golden board exposes the traffic-surge lane tab with opportunity-index sorting',
  proWebHtml.includes("'traffic-surge': '🔥 실시간 급등'")
    && proWebHtml.includes("if (item && item.lane === 'traffic-surge') return 'traffic-surge';")
    && proWebHtml.includes("if (goldenCategoryFilter === 'traffic-surge') {"));
assert('traffic-surge rows render lane and new-entry fact badges',
  proWebHtml.includes('🔥 실시간 급등</span>')
    && proWebHtml.includes('🆕 자동완성 신규 진입')
    && proWebHtml.includes("item.surgeNewEntry === true"));
assert('search-volume reason is keyword-semantic, not category boilerplate only',
  proWebHtml.includes('function keywordSemanticMeaning')
    && proWebHtml.includes('KEYWORD_NEED_TOKENS')
    && /const semantic = \['policy', 'issue', 'need'\]\.indexOf\(guide\.kind\) >= 0 \? keywordSemanticMeaning\(row\) : '';/.test(proWebHtml));

console.log('[pro-web-site-regression] passed');
