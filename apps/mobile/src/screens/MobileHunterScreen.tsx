import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Share } from 'react-native/Libraries/Share/Share';
import {
  MOBILE_PC_PARITY_SLA,
  type MobileAuthSession,
  type MobileApiStatusSnapshot,
  type MobileDashboardSnapshot,
  type MobileJobEnvelope,
  type MobileKeywordExportArtifact,
  type MobileKeywordExportFormat,
  type MobileKeywordGroupSnapshot,
  type MobileKeywordMetric,
  type MobileKeywordResult,
  type MobileLiveGoldenRadarSnapshot,
  type MobileKeywordScheduleItem,
  type MobileNotificationSnapshot,
  type MobilePcFeatureCatalog,
  type MobilePcFeatureCatalogItem,
  type MobilePrewarmSnapshot,
  type MobileProBlueprintActionResult,
  type MobileProOutcomeSnapshot,
  type MobilePushSubscription,
  type MobileRankTrackingSnapshot,
  type MobileScheduleDashboardSnapshot,
  type MobileSignalItem,
  type MobileSourceSignalSnapshot,
  type MobileWordPressPublishResult,
  type MobileWordPressSnapshot,
} from '../contracts';
import { LewordMobileClient } from '../api/lewordClient';
import {
  getDefaultLewordApiUrl,
  getLewordApiUrlWarning,
  getDefaultPrivacyUrl,
} from '../config/runtime';
import { registerLeWordPushNotifications } from '../services/pushRegistration';
import { clearMobileSession, loadMobileSession, saveMobileSession } from '../services/sessionStore';

type HunterMode = 'golden' | 'pro' | 'analysis' | 'mindmap' | 'home' | 'kin';
type GoldenRunMode = 'precision' | 'bulk';
type DashboardLane = 'realtime' | 'policy' | 'issues';
type PcFeatureTab = 'today' | 'discovery' | 'analysis' | 'expansion' | 'premium' | 'schedule' | 'settings';

interface PcFeatureItem {
  id: string;
  title: string;
  description: string;
  badge: string;
  mode?: HunterMode;
  lane?: DashboardLane;
  categoryId?: string;
  seedKeyword?: string;
  status: 'ready' | 'linked' | 'pc';
}

const CATEGORIES = [
  { id: 'policy', label: '지원금/정책' },
  { id: 'celebrity', label: '스타/연예' },
  { id: 'finance', label: '금융/재테크' },
  { id: 'education', label: '교육/자격증' },
  { id: 'health', label: '건강/운동' },
  { id: 'it', label: 'IT/디지털' },
  { id: 'living', label: '생활/쇼핑' },
  { id: 'travel', label: '여행/숙박' },
];

const MODES: Array<{
  id: HunterMode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: 'golden',
    label: '황금',
    title: '카테고리 황금키워드',
    description: 'PC 엔진이 검색량, 문서수, 비율을 함께 검증합니다.',
  },
  {
    id: 'pro',
    label: 'PRO',
    title: 'PRO 트래픽 헌터',
    description: '실시간 수요와 수익 의도가 있는 후보를 넓게 모읍니다.',
  },
  {
    id: 'analysis',
    label: '분석',
    title: '키워드 정밀 분석',
    description: '입력 키워드의 검색량, 문서수, 확장 후보를 확인합니다.',
  },
  {
    id: 'mindmap',
    label: '확장',
    title: '마인드맵 확장',
    description: '상위노출 가능한 하위 의도와 롱테일을 펼칩니다.',
  },
  {
    id: 'home',
    label: '홈판',
    title: '네이버 홈판 후보',
    description: '오늘 발행하기 좋은 홈판형 글감을 뽑습니다.',
  },
  {
    id: 'kin',
    label: '지식인',
    title: '지식인 숨은 질문',
    description: '답변은 적고 블로그 글감으로 확장하기 좋은 질문을 찾습니다.',
  },
];

const DASHBOARD_LANES: Array<{ id: DashboardLane; label: string; title: string }> = [
  { id: 'realtime', label: '실시간', title: '실시간 검색어' },
  { id: 'policy', label: '정책', title: '정책 브리핑' },
  { id: 'issues', label: '이슈', title: '오늘 이슈' },
];

const PC_FEATURE_TABS: Array<{ id: PcFeatureTab; label: string; title: string }> = [
  { id: 'today', label: '오늘', title: '실시간·정책·이슈' },
  { id: 'discovery', label: '발굴', title: '황금키워드 발굴' },
  { id: 'analysis', label: '분석', title: '키워드 분석' },
  { id: 'expansion', label: '확장', title: '마인드맵·연관 확장' },
  { id: 'premium', label: 'PRO', title: 'PRO·RPM 수익형' },
  { id: 'schedule', label: '예약', title: '스케줄·알림' },
  { id: 'settings', label: '설정', title: '계정·API·내보내기' },
];

const PC_FEATURES: Record<PcFeatureTab, PcFeatureItem[]> = {
  today: [
    { id: 'today-realtime', title: '실시간 검색어', description: '지금 움직이는 검색 수요를 먼저 보고 분석으로 넘깁니다.', badge: 'LIVE', lane: 'realtime', mode: 'analysis', status: 'ready' },
    { id: 'today-policy', title: '정책 브리핑', description: '지원금, 정부24, 복지로 계열 글감을 홈판 후보로 연결합니다.', badge: '정책', lane: 'policy', mode: 'home', categoryId: 'policy', status: 'ready' },
    { id: 'today-issue', title: '오늘 이슈', description: '사건, 생활 이슈, 반복 수요를 정밀 분석으로 보냅니다.', badge: '이슈', lane: 'issues', mode: 'analysis', status: 'ready' },
    { id: 'today-inbox', title: '오늘 추천 인박스', description: 'PC 서버가 미리 예열한 SSS/S 후보와 푸시 알림을 확인합니다.', badge: '푸시', status: 'linked' },
  ],
  discovery: [
    { id: 'discovery-mdp', title: 'MDP v3 황금키워드', description: '5차원 점수와 문서수 게이트를 통과한 정밀 후보를 찾습니다.', badge: 'SSS', mode: 'golden', status: 'ready' },
    { id: 'discovery-category', title: '카테고리 롱테일 발굴', description: '선택 카테고리의 계절성, 신선도, 검색량을 함께 봅니다.', badge: '롱테일', mode: 'golden', status: 'ready' },
    { id: 'discovery-rising', title: '급상승 키워드 감지', description: '최근 수요가 튄 후보를 PC 엔진의 신호로 정리합니다.', badge: '급상승', mode: 'pro', status: 'ready' },
    { id: 'discovery-home', title: '네이버 홈판 후보', description: '홈판형 제목 각도와 발행 적합도를 뽑습니다.', badge: '홈판', mode: 'home', categoryId: 'policy', status: 'ready' },
    { id: 'discovery-kin', title: '지식인 숨은 질문', description: '답변은 적고 블로그 글감으로 확장하기 좋은 질문을 찾습니다.', badge: '질문', mode: 'kin', status: 'ready' },
  ],
  analysis: [
    { id: 'analysis-keyword', title: '키워드 정밀 분석', description: '검색량, 문서수, 황금비율, 연관 후보를 한 번에 확인합니다.', badge: '분석', mode: 'analysis', status: 'ready' },
    { id: 'analysis-competition', title: '경쟁 분석', description: '상위 문서량과 블로그 작성 난이도를 PC 기준으로 해석합니다.', badge: '경쟁', mode: 'analysis', status: 'ready' },
    { id: 'analysis-blog-index', title: '블로그 지수', description: '발행 가능성과 문서 경쟁도를 함께 판단합니다.', badge: '지수', mode: 'analysis', status: 'linked' },
    { id: 'analysis-autocomplete', title: '자동완성/연관어', description: '네이버 자동완성과 연관 신호를 확장 후보로 정리합니다.', badge: '연관', mode: 'mindmap', status: 'ready' },
    { id: 'analysis-rank', title: '순위 추적', description: 'PC 대시보드의 추적 결과와 히트율을 모바일에서 확인합니다.', badge: '추적', status: 'linked' },
  ],
  expansion: [
    { id: 'expansion-mindmap', title: '마인드맵 확장', description: '제품명보다 의도와 조건이 살아있는 롱테일로 확장합니다.', badge: '확장', mode: 'mindmap', status: 'ready' },
    { id: 'expansion-related-golden', title: '연관 황금 후보', description: '연관어 중 문서수와 검색량이 맞는 후보만 추립니다.', badge: '황금', mode: 'mindmap', status: 'ready' },
    { id: 'expansion-realtime', title: '실시간 이슈 확장', description: '오늘 뜨는 단어를 글감 가능한 하위 의도로 쪼갭니다.', badge: 'LIVE', mode: 'pro', status: 'ready' },
    { id: 'expansion-category', title: '카테고리+타겟 확장', description: '정책, 생활, 여행처럼 카테고리별 타겟 롱테일을 만듭니다.', badge: '타겟', mode: 'golden', status: 'ready' },
  ],
  premium: [
    { id: 'premium-pro', title: 'PRO 트래픽 헌터', description: '대량 수요와 신선도를 묶어 프리미엄 후보를 찾습니다.', badge: 'PRO', mode: 'pro', status: 'ready' },
    { id: 'premium-rpm', title: 'RPM 분석', description: '고수익 주제, CPC, CVI 기반으로 발행 우선순위를 봅니다.', badge: 'RPM', mode: 'pro', status: 'linked' },
    { id: 'premium-profit', title: '고수익 키워드 발굴', description: 'Profit Engine 기준으로 수익성과 블루오션을 함께 봅니다.', badge: '수익', mode: 'pro', status: 'ready' },
    { id: 'premium-cpc', title: 'CPC/CVI 단일 소스', description: 'PC Profit Engine의 CPC DB를 기준으로 수익 추정을 통일합니다.', badge: 'CPC', status: 'pc' },
  ],
  schedule: [
    { id: 'schedule-dashboard', title: '스케줄 대시보드', description: 'PC 예약, 그룹, 알림 흐름을 모바일에서 바로 확인합니다.', badge: '예약', status: 'linked' },
    { id: 'schedule-prewarm', title: '서버 예열 추천', description: 'PC가 미리 찾은 후보를 인박스와 푸시로 받습니다.', badge: '예열', status: 'linked' },
    { id: 'schedule-push', title: '푸시 알림', description: '오늘 뜬 후보를 휴대전화 알림으로 연결합니다.', badge: '푸시', status: 'linked' },
    { id: 'schedule-groups', title: '키워드 그룹', description: 'PC 그룹 관리와 모바일 인박스를 같은 저장소로 연결합니다.', badge: '그룹', status: 'linked' },
  ],
  settings: [
    { id: 'settings-login', title: '패널 로그인/라이선스', description: '내 패널 계정으로 모바일 권한과 PC API를 자동 연동합니다.', badge: '계정', status: 'linked' },
    { id: 'settings-api', title: 'API 키 상태', description: '네이버 OpenAPI, SearchAd, DataLab 키 상태를 확인합니다.', badge: 'API', status: 'pc' },
    { id: 'settings-export', title: '내보내기', description: 'PC 엑셀 내보내기와 같은 키워드 결과를 CSV, 텍스트, JSON 공유로 연결합니다.', badge: '내보내기', status: 'linked' },
    { id: 'settings-wordpress', title: '워드프레스 연동', description: 'PC 공유 저장소의 사이트, 카테고리, 발행 초안 큐를 모바일에서 연결합니다.', badge: 'WP', status: 'linked' },
  ],
};

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('ko-KR');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR');
}

function formatRank(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}위` : '미검출';
}

function formatRankChange(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return '변동 없음';
  return value < 0 ? `${Math.abs(value)}단계 상승` : `${value}단계 하락`;
}

function parseScheduleDateInput(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalNumberInput(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scheduleInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function evidenceTitle(item: MobileKeywordMetric): string {
  const title = item.evidence.find((entry) => entry.startsWith('title: '));
  return title ? title.replace(/^title:\s*/, '') : item.evidence[0] || item.source;
}

function summarizeJob(job: MobileJobEnvelope<unknown, MobileKeywordResult> | null): string {
  if (!job) return '대기 중';
  if (job.state === 'completed') return '완료';
  if (job.state === 'failed') return '실패';
  if (job.state === 'cancelled') return '취소됨';
  if (job.state === 'running' || job.state === 'streaming') return '분석 중';
  return '대기열';
}

function laneItems(dashboard: MobileDashboardSnapshot | null, lane: DashboardLane): MobileSignalItem[] {
  if (!dashboard) return [];
  if (lane === 'realtime') return dashboard.realtime;
  if (lane === 'policy') return dashboard.policy;
  return dashboard.issues;
}

function modeSeedPlaceholder(mode: HunterMode): string {
  if (mode === 'analysis') return '예: 원피스 추천';
  if (mode === 'mindmap') return '예: 근로장려금 신청기간';
  if (mode === 'home') return '선택 입력: 지원금, 건강검진, 자격증';
  if (mode === 'kin') return '선택 입력: 대출, 자격증, 환급금';
  return '선택 입력: 지원금, 여행, 쇼핑';
}

function catalogStatusLabel(item: MobilePcFeatureCatalogItem): string {
  if (item.status === 'ready') return '실행';
  if (item.status === 'linked') return '연동';
  if (item.status === 'pc-only') return 'PC';
  return '예정';
}

function apiDiagnosticStatusLabel(status: MobileApiStatusSnapshot['overallStatus']): string {
  if (status === 'ready') return 'READY';
  if (status === 'partial') return 'PARTIAL';
  return 'MISSING';
}

function mergeSourceSignals(
  dashboard: MobileDashboardSnapshot | null,
  apiUrl: string,
  snapshot: MobileSourceSignalSnapshot,
): MobileDashboardSnapshot {
  return {
    updatedAt: snapshot.updatedAt,
    apiBaseUrl: dashboard?.apiBaseUrl || apiUrl,
    pcLinked: dashboard?.pcLinked ?? true,
    realtime: snapshot.realtime,
    policy: snapshot.policy,
    issues: snapshot.issues,
    notifications: dashboard?.notifications || null,
    prewarm: dashboard?.prewarm || null,
    liveGolden: dashboard?.liveGolden || null,
  };
}

export function MobileHunterScreen() {
  const [apiUrl, setApiUrl] = useState(() => getDefaultLewordApiUrl());
  const [accessToken, setAccessToken] = useState('');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [licenseCode, setLicenseCode] = useState('');
  const [session, setSession] = useState<MobileAuthSession | null>(null);
  const [dashboard, setDashboard] = useState<MobileDashboardSnapshot | null>(null);
  const [pcCatalog, setPcCatalog] = useState<MobilePcFeatureCatalog | null>(null);
  const [dashboardLane, setDashboardLane] = useState<DashboardLane>('realtime');
  const [featureTab, setFeatureTab] = useState<PcFeatureTab>('today');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [seedKeyword, setSeedKeyword] = useState('');
  const [mode, setMode] = useState<HunterMode>('golden');
  const [goldenRunMode, setGoldenRunMode] = useState<GoldenRunMode>('precision');
  const [job, setJob] = useState<MobileJobEnvelope<unknown, MobileKeywordResult> | null>(null);
  const [result, setResult] = useState<MobileKeywordResult | null>(null);
  const [prewarm, setPrewarm] = useState<MobilePrewarmSnapshot | null>(null);
  const [liveGolden, setLiveGolden] = useState<MobileLiveGoldenRadarSnapshot | null>(null);
  const [notifications, setNotifications] = useState<MobileNotificationSnapshot | null>(null);
  const [pushSubscription, setPushSubscription] = useState<MobilePushSubscription | null>(null);
  const [apiStatus, setApiStatus] = useState<MobileApiStatusSnapshot | null>(null);
  const [lastExportArtifact, setLastExportArtifact] = useState<MobileKeywordExportArtifact | null>(null);
  const [keywordGroups, setKeywordGroups] = useState<MobileKeywordGroupSnapshot | null>(null);
  const [scheduleDashboard, setScheduleDashboard] = useState<MobileScheduleDashboardSnapshot | null>(null);
  const [rankTracking, setRankTracking] = useState<MobileRankTrackingSnapshot | null>(null);
  const [proOutcomes, setProOutcomes] = useState<MobileProOutcomeSnapshot | null>(null);
  const [proBlueprintKeyword, setProBlueprintKeyword] = useState('');
  const [proBlueprintSearchVolume, setProBlueprintSearchVolume] = useState('');
  const [proBlueprintResult, setProBlueprintResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proDraftResult, setProDraftResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proRevenueViews, setProRevenueViews] = useState('');
  const [proRevenueCategory, setProRevenueCategory] = useState('');
  const [proRevenueResult, setProRevenueResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proRevenueConfigResult, setProRevenueConfigResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proCategoryRpmResult, setProCategoryRpmResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proPortfolioResult, setProPortfolioResult] = useState<MobileProBlueprintActionResult | null>(null);
  const [proAdpostEnabled, setProAdpostEnabled] = useState(true);
  const [proAdpostAvgRpm, setProAdpostAvgRpm] = useState('');
  const [proCoupangEnabled, setProCoupangEnabled] = useState(false);
  const [proCoupangAvgCommission, setProCoupangAvgCommission] = useState('');
  const [proCoupangCtr, setProCoupangCtr] = useState('');
  const [proRevenueMultiplier, setProRevenueMultiplier] = useState('');
  const [proPortfolioItemsInput, setProPortfolioItemsInput] = useState('');
  const [rankKeyword, setRankKeyword] = useState('');
  const [rankPostUrl, setRankPostUrl] = useState('');
  const [rankPostTitle, setRankPostTitle] = useState('');
  const [rankPredictedRank, setRankPredictedRank] = useState('');
  const [rankExtraKeywords, setRankExtraKeywords] = useState('');
  const [outcomePostUrl, setOutcomePostUrl] = useState('');
  const [outcomeKeyword, setOutcomeKeyword] = useState('');
  const [outcomeCategory, setOutcomeCategory] = useState('');
  const [outcomePredictedRank, setOutcomePredictedRank] = useState('');
  const [outcomePredictedTraffic, setOutcomePredictedTraffic] = useState('');
  const [outcomeActualRank, setOutcomeActualRank] = useState('');
  const [outcomeMonthlyViews, setOutcomeMonthlyViews] = useState('');
  const [outcomeMonthlyRevenue, setOutcomeMonthlyRevenue] = useState('');
  const [outcomeFirstExposureDays, setOutcomeFirstExposureDays] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [wordpressPublishing, setWordpressPublishing] = useState<MobileWordPressSnapshot | null>(null);
  const [groupName, setGroupName] = useState('');
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState('');
  const [wordpressSiteUrl, setWordpressSiteUrl] = useState('');
  const [wordpressUsername, setWordpressUsername] = useState('');
  const [wordpressPassword, setWordpressPassword] = useState('');
  const [wordpressCategoryId, setWordpressCategoryId] = useState('');
  const [wordpressCategoryName, setWordpressCategoryName] = useState('');
  const [wordpressPostStatus, setWordpressPostStatus] = useState('draft');
  const [lastWordPressPublish, setLastWordPressPublish] = useState<MobileWordPressPublishResult | null>(null);
  const [pushStatus, setPushStatus] = useState('푸시 등록 전');
  const [apiHealth, setApiHealth] = useState('연동 전');
  const [error, setError] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [isCheckingApi, setIsCheckingApi] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isRankActionRunning, setIsRankActionRunning] = useState(false);
  const [isProBlueprintActionRunning, setIsProBlueprintActionRunning] = useState(false);
  const [isProOutcomeActionRunning, setIsProOutcomeActionRunning] = useState(false);

  const client = useMemo(
    () => new LewordMobileClient({
      baseUrl: apiUrl,
      accessToken: accessToken.trim() || undefined,
    }),
    [accessToken, apiUrl],
  );
  const selectedMode = useMemo(
    () => MODES.find((item) => item.id === mode) || MODES[0],
    [mode],
  );
  const selectedCategory = useMemo(
    () => CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0],
    [categoryId],
  );
  const apiUrlWarning = useMemo(() => getLewordApiUrlWarning(apiUrl), [apiUrl]);
  const privacyUrl = useMemo(() => getDefaultPrivacyUrl(), []);

  const targetText = useMemo(() => {
    if (mode === 'pro') {
      return `PRO 후보 최대 ${MOBILE_PC_PARITY_SLA.qualityFloors.proTrafficMaxSssTarget}개`;
    }
    if (mode === 'analysis') {
      return `연관 후보 기본 ${MOBILE_PC_PARITY_SLA.qualityFloors.keywordAnalysisDefaultRelated}개`;
    }
    if (mode === 'mindmap') {
      return `마인드맵 측정 후보 ${MOBILE_PC_PARITY_SLA.qualityFloors.mindmapDefaultMeasuredKeywords}개`;
    }
    if (mode === 'home') return '홈판 S+ 후보 30개 목표';
    if (mode === 'kin') return '지식인 질문 후보 15개 기본';
    return goldenRunMode === 'bulk'
      ? `대량 ${MOBILE_PC_PARITY_SLA.qualityFloors.goldenBulkSss}개 목표`
      : `정밀 SSS ${MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss}개 이상`;
  }, [goldenRunMode, mode]);

  const dashboardItems = useMemo(
    () => laneItems(dashboard, dashboardLane),
    [dashboard, dashboardLane],
  );
  const selectedFeatureTab = useMemo(
    () => PC_FEATURE_TABS.find((item) => item.id === featureTab) || PC_FEATURE_TABS[0],
    [featureTab],
  );
  const selectedFeatures = useMemo(
    () => PC_FEATURES[featureTab] || PC_FEATURES.today,
    [featureTab],
  );
  const selectedCatalogItems = useMemo(
    () => (pcCatalog?.items || []).filter((item) => item.tab === featureTab),
    [featureTab, pcCatalog],
  );

  const rememberWordPressSnapshot = useCallback((snapshot: MobileWordPressSnapshot) => {
    setWordpressPublishing(snapshot);
    const site = snapshot.sites.items[0];
    if (!site) return;
    setWordpressSiteUrl((current) => current || site.siteUrl);
    setWordpressCategoryId((current) => current || site.defaultCategoryId || '');
    setWordpressCategoryName((current) => current || site.defaultCategoryName || '');
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadMobileSession()
      .then(async (stored) => {
        if (cancelled || !stored) return;
        const restored = stored.session;
        const restoredApiUrl = restored.apiBaseUrl || apiUrl;
        setApiUrl(restoredApiUrl);
        setAccessToken(restored.accessToken);
        setUserId(restored.userId);
        setSession(restored);
        setDashboard(restored.dashboard);
        setNotifications(restored.dashboard.notifications);
        setPrewarm(restored.dashboard.prewarm);
        setLiveGolden(restored.dashboard.liveGolden);
        setApiHealth('저장된 패널 세션으로 PC API 자동 복원');

        const restoreClient = new LewordMobileClient({
          baseUrl: restoredApiUrl,
          accessToken: restored.accessToken,
        });
        const nextDashboard = await restoreClient.getDashboard().catch(() => null);
        if (cancelled || !nextDashboard) return;
        setDashboard(nextDashboard);
        setNotifications(nextDashboard.notifications);
        setPrewarm(nextDashboard.prewarm);
        setLiveGolden(nextDashboard.liveGolden);
        const restoredGroups = await restoreClient.getKeywordGroups().catch(() => null);
        if (restoredGroups && !cancelled) setKeywordGroups(restoredGroups);
        const restoredSchedule = await restoreClient.getScheduleDashboard().catch(() => null);
        if (restoredSchedule && !cancelled) setScheduleDashboard(restoredSchedule);
        const restoredRankTracking = await restoreClient.getRankTrackingSnapshot().catch(() => null);
        if (restoredRankTracking && !cancelled) setRankTracking(restoredRankTracking);
        const restoredProOutcomes = await restoreClient.getProOutcomeSnapshot().catch(() => null);
        if (restoredProOutcomes && !cancelled) setProOutcomes(restoredProOutcomes);
        const restoredWordPress = await restoreClient.getWordPressPublishing().catch(() => null);
        if (restoredWordPress && !cancelled) rememberWordPressSnapshot(restoredWordPress);
        setApiHealth('PC API 자동 복원 완료');
      })
      .catch(() => {
        if (!cancelled) setApiHealth('연동 대기');
      })
      .finally(() => {
        if (!cancelled) setIsRestoringSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [rememberWordPressSnapshot]);

  useEffect(() => {
    let cancelled = false;
    client.getPcFeatureCatalog()
      .then((catalog) => {
        if (!cancelled) setPcCatalog(catalog);
      })
      .catch(() => {
        if (!cancelled) setPcCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const checkApiHealth = useCallback(async () => {
    setError('');
    setIsCheckingApi(true);
    try {
      const health = await client.getHealth();
      const queue = health?.jobs ? `작업 ${health.jobs.running}/${health.jobs.queued}` : '작업 상태 확인';
      setApiHealth(`연결됨: ${health?.service || 'leword-api'} · ${queue}`);
      const nextDashboard = await client.getDashboard().catch(() => dashboard);
      setDashboard(nextDashboard);
      setNotifications(nextDashboard?.notifications || notifications);
      setPrewarm(nextDashboard?.prewarm || prewarm);
      setLiveGolden(nextDashboard?.liveGolden || liveGolden);
      setApiStatus(await client.getApiStatus().catch(() => apiStatus));
      const groups = await client.getKeywordGroups().catch(() => null);
      if (groups) setKeywordGroups(groups);
      const schedule = await client.getScheduleDashboard().catch(() => null);
      if (schedule) setScheduleDashboard(schedule);
      const ranks = await client.getRankTrackingSnapshot().catch(() => null);
      if (ranks) setRankTracking(ranks);
      const outcomes = await client.getProOutcomeSnapshot().catch(() => null);
      if (outcomes) setProOutcomes(outcomes);
      const wordpress = await client.getWordPressPublishing().catch(() => null);
      if (wordpress) rememberWordPressSnapshot(wordpress);
    } catch (err) {
      const message = (err as Error).message || 'PC API와 연결하지 못했습니다.';
      setApiHealth('연결 실패');
      setError(message);
    } finally {
      setIsCheckingApi(false);
    }
  }, [apiStatus, client, dashboard, liveGolden, notifications, prewarm, rememberWordPressSnapshot]);

  const loginAndLinkPc = useCallback(async () => {
    setError('');
    setIsLoggingIn(true);
    try {
      const loginClient = new LewordMobileClient({ baseUrl: apiUrl });
      const nextSession = await loginClient.login({
        userId: userId.trim(),
        password: password.trim(),
        licenseCode: licenseCode.trim() || undefined,
      });
      await saveMobileSession(nextSession);
      setSession(nextSession);
      setAccessToken(nextSession.accessToken);
      setApiUrl(nextSession.apiBaseUrl || apiUrl);
      setDashboard(nextSession.dashboard);
      setNotifications(nextSession.dashboard.notifications);
      setPrewarm(nextSession.dashboard.prewarm);
      setLiveGolden(nextSession.dashboard.liveGolden);
      const linkedClient = new LewordMobileClient({
        baseUrl: nextSession.apiBaseUrl || apiUrl,
        accessToken: nextSession.accessToken,
      });
      const groups = await linkedClient.getKeywordGroups().catch(() => null);
      if (groups) setKeywordGroups(groups);
      const schedule = await linkedClient.getScheduleDashboard().catch(() => null);
      if (schedule) setScheduleDashboard(schedule);
      const ranks = await linkedClient.getRankTrackingSnapshot().catch(() => null);
      if (ranks) setRankTracking(ranks);
      const outcomes = await linkedClient.getProOutcomeSnapshot().catch(() => null);
      if (outcomes) setProOutcomes(outcomes);
      const wordpress = await linkedClient.getWordPressPublishing().catch(() => null);
      if (wordpress) rememberWordPressSnapshot(wordpress);
      setPassword('');
      setApiHealth(nextSession.pcLinked ? 'PC API 자동 연동됨' : nextSession.message);
    } catch (err) {
      setError((err as Error).message || '로그인 또는 PC 자동 연동에 실패했습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  }, [apiUrl, licenseCode, password, rememberWordPressSnapshot, userId]);

  const unlinkLocalSession = useCallback(async () => {
    setError('');
    await clearMobileSession();
    setSession(null);
    setAccessToken('');
    setPassword('');
    setDashboard(null);
    setNotifications(null);
    setPrewarm(null);
    setLiveGolden(null);
    setKeywordGroups(null);
    setScheduleDashboard(null);
    setRankTracking(null);
    setProOutcomes(null);
    setProBlueprintKeyword('');
    setProBlueprintSearchVolume('');
    setProBlueprintResult(null);
    setProDraftResult(null);
    setProRevenueViews('');
    setProRevenueCategory('');
    setProRevenueResult(null);
    setProRevenueConfigResult(null);
    setProCategoryRpmResult(null);
    setProPortfolioResult(null);
    setProAdpostEnabled(true);
    setProAdpostAvgRpm('');
    setProCoupangEnabled(false);
    setProCoupangAvgCommission('');
    setProCoupangCtr('');
    setProRevenueMultiplier('');
    setProPortfolioItemsInput('');
    setWordpressPublishing(null);
    setLastExportArtifact(null);
    setGroupName('');
    setScheduleDateTime('');
    setEditingScheduleId('');
    setWordpressSiteUrl('');
    setWordpressUsername('');
    setWordpressPassword('');
    setWordpressCategoryId('');
    setWordpressCategoryName('');
    setWordpressPostStatus('draft');
    setLastWordPressPublish(null);
    setRankKeyword('');
    setRankPostUrl('');
    setRankPostTitle('');
    setRankPredictedRank('');
    setRankExtraKeywords('');
    setOutcomePostUrl('');
    setOutcomeKeyword('');
    setOutcomeCategory('');
    setOutcomePredictedRank('');
    setOutcomePredictedTraffic('');
    setOutcomeActualRank('');
    setOutcomeMonthlyViews('');
    setOutcomeMonthlyRevenue('');
    setOutcomeFirstExposureDays('');
    setOutcomeNotes('');
    setPushSubscription(null);
    setApiHealth('모바일 저장 세션 해제됨');
  }, []);

  const refreshDashboard = useCallback(async () => {
    setError('');
    try {
      const nextDashboard = await client.getDashboard();
      const sourceSignals = await client.getSourceSignals('all', 6).catch(() => null);
      const mergedDashboard = sourceSignals
        ? mergeSourceSignals(nextDashboard, apiUrl, sourceSignals)
        : nextDashboard;
      setDashboard(mergedDashboard);
      setNotifications(nextDashboard.notifications);
      setPrewarm(nextDashboard.prewarm);
      setLiveGolden(nextDashboard.liveGolden);
    } catch (err) {
      setError((err as Error).message || '홈 피드를 새로고침하지 못했습니다.');
    }
  }, [apiUrl, client]);

  const refreshSourceSignals = useCallback(async () => {
    setError('');
    try {
      const sourceSignals = await client.getSourceSignals('all', 8);
      setDashboard((current) => mergeSourceSignals(current, apiUrl, sourceSignals));
      setApiHealth(sourceSignals.fallbackUsed ? '소스 갱신됨: 일부 기본 신호 사용' : '소스 갱신됨: PC 실시간 신호');
    } catch (err) {
      setError((err as Error).message || '실시간 소스 신호를 새로고침하지 못했습니다.');
    }
  }, [apiUrl, client]);

  const refreshApiStatus = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getApiStatus();
      setApiStatus(snapshot);
      setApiHealth(`API 진단 ${apiDiagnosticStatusLabel(snapshot.overallStatus)} · 준비 ${snapshot.summary.ready}/${snapshot.summary.total}`);
    } catch (err) {
      setError((err as Error).message || 'API 상태 진단을 불러오지 못했습니다.');
    }
  }, [client]);

  const refreshScheduleDashboard = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getScheduleDashboard();
      setScheduleDashboard(snapshot);
      setApiHealth(`스케줄 ${snapshot.schedules.total}개 · 다음 ${snapshot.schedules.nextRunAt || '없음'}`);
    } catch (err) {
      setError((err as Error).message || '스케줄 대시보드를 불러오지 못했습니다.');
    }
  }, [client]);

  const refreshRankTracking = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getRankTrackingSnapshot();
      setRankTracking(snapshot);
      setApiHealth(`순위 추적 ${snapshot.totals.trackedPairs}개 · 30위권 ${snapshot.totals.hitRate30}%`);
    } catch (err) {
      setError((err as Error).message || '순위 추적 데이터를 불러오지 못했습니다.');
    }
  }, [client]);

  const refreshProOutcomes = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getProOutcomeSnapshot();
      setProOutcomes(snapshot);
      setApiHealth(`PRO 성과 ${snapshot.measuredPosts}/${snapshot.totalRecords}개 · 예측 정확도 ${snapshot.benchmark.avgPredictionAccuracy}%`);
    } catch (err) {
      setError((err as Error).message || 'PRO 성과 로그를 불러오지 못했습니다.');
    }
  }, [client]);

  const resolveProBlueprintKeyword = useCallback(() => (
    proBlueprintKeyword.trim()
      || seedKeyword.trim()
      || result?.keywords?.[0]?.keyword
      || ''
  ), [proBlueprintKeyword, result, seedKeyword]);

  const generateProBlueprint = useCallback(async () => {
    setError('');
    const keyword = resolveProBlueprintKeyword();
    const searchVolume = parseOptionalNumberInput(proBlueprintSearchVolume);
    if (!keyword) {
      setError('PRO 청사진을 만들 키워드가 필요합니다.');
      return;
    }
    if (proBlueprintSearchVolume.trim() && searchVolume === undefined) {
      setError('검색량은 숫자로 입력해야 합니다.');
      return;
    }

    setIsProBlueprintActionRunning(true);
    try {
      const action = await client.generateProBlueprint({
        keyword,
        force: true,
        searchVolume: searchVolume ?? null,
      });
      setProBlueprintResult(action);
      setProDraftResult(null);
      setProBlueprintKeyword(keyword);
      if (!proRevenueCategory.trim()) setProRevenueCategory(selectedCategory.label);
      if (!action.success) {
        setError(action.error || 'PRO 청사진 생성에 실패했습니다.');
        return;
      }
      const recommendedWords = action.analysis?.recommendedWordCount || action.blueprint?.recommendedWordCount;
      setApiHealth(`PRO 청사진 생성 완료 · 권장 ${formatNumber(recommendedWords)}자`);
    } catch (err) {
      setError((err as Error).message || 'PRO 청사진 생성에 실패했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [
    client,
    proBlueprintSearchVolume,
    proRevenueCategory,
    resolveProBlueprintKeyword,
    selectedCategory.label,
  ]);

  const generateProDraft = useCallback(async () => {
    setError('');
    if (!proBlueprintResult?.blueprint) {
      setError('초안을 만들 PRO 청사진이 필요합니다.');
      return;
    }

    setIsProBlueprintActionRunning(true);
    try {
      const action = await client.generateProDraft({ blueprint: proBlueprintResult.blueprint });
      setProDraftResult(action);
      if (!action.success) {
        setError(action.error || 'PRO 초안 생성에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 초안 생성 완료 · ${formatNumber(action.draft?.wordCount)}자`);
    } catch (err) {
      setError((err as Error).message || 'PRO 초안 생성에 실패했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [client, proBlueprintResult]);

  const estimateProRevenue = useCallback(async () => {
    setError('');
    const keyword = resolveProBlueprintKeyword();
    const monthlyViews = parseOptionalNumberInput(proRevenueViews);
    if (!keyword || monthlyViews === undefined) {
      setError('수익 추정에는 키워드와 월 조회수가 필요합니다.');
      return;
    }

    setIsProBlueprintActionRunning(true);
    try {
      const action = await client.estimateProRevenue({
        keyword,
        monthlyViews,
        category: proRevenueCategory.trim() || selectedCategory.label,
      });
      setProRevenueResult(action);
      if (!action.success) {
        setError(action.error || 'PRO 수익 추정에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 수익 추정 완료 · 월 ${formatNumber(action.estimate?.totalMonthlyRevenue)}원`);
    } catch (err) {
      setError((err as Error).message || 'PRO 수익 추정에 실패했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [client, proRevenueCategory, proRevenueViews, resolveProBlueprintKeyword, selectedCategory.label]);

  const refreshProRevenueConfig = useCallback(async () => {
    setError('');
    setIsProBlueprintActionRunning(true);
    try {
      const [configAction, rpmAction] = await Promise.all([
        client.getProRevenueConfig(),
        client.getProCategoryRpmTable(),
      ]);
      setProRevenueConfigResult(configAction);
      setProCategoryRpmResult(rpmAction);
      if (configAction.config) {
        setProAdpostEnabled(configAction.config.adpostEnabled);
        setProAdpostAvgRpm(String(configAction.config.adpostAvgRpm));
        setProCoupangEnabled(configAction.config.coupangEnabled);
        setProCoupangAvgCommission(String(configAction.config.coupangAvgCommission));
        setProCoupangCtr(String(configAction.config.coupangCtr));
        setProRevenueMultiplier(String(configAction.config.customMultiplier));
      }
      if (!configAction.success) {
        setError(configAction.error || 'PRO 수익 설정을 불러오지 못했습니다.');
        return;
      }
      setApiHealth(`PRO 수익 설정 동기화 · RPM ${formatNumber(configAction.config?.adpostAvgRpm)}`);
    } catch (err) {
      setError((err as Error).message || 'PRO 수익 설정을 불러오지 못했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [client]);

  const saveProRevenueConfig = useCallback(async () => {
    setError('');
    const adpostAvgRpm = parseOptionalNumberInput(proAdpostAvgRpm);
    const coupangAvgCommission = parseOptionalNumberInput(proCoupangAvgCommission);
    const coupangCtr = parseOptionalNumberInput(proCoupangCtr);
    const customMultiplier = parseOptionalNumberInput(proRevenueMultiplier);
    const numericInputs = [
      ['애드포스트 RPM', proAdpostAvgRpm, adpostAvgRpm],
      ['쿠팡 평균 커미션', proCoupangAvgCommission, coupangAvgCommission],
      ['쿠팡 CTR', proCoupangCtr, coupangCtr],
      ['보정 배수', proRevenueMultiplier, customMultiplier],
    ] as const;
    const invalid = numericInputs.find(([, raw, parsed]) => raw.trim() && parsed === undefined);
    if (invalid) {
      setError(`${invalid[0]}은 숫자로 입력해야 합니다.`);
      return;
    }

    setIsProBlueprintActionRunning(true);
    try {
      const action = await client.saveProRevenueConfig({
        adpostEnabled: proAdpostEnabled,
        ...(adpostAvgRpm !== undefined ? { adpostAvgRpm } : {}),
        coupangEnabled: proCoupangEnabled,
        ...(coupangAvgCommission !== undefined ? { coupangAvgCommission } : {}),
        ...(coupangCtr !== undefined ? { coupangCtr } : {}),
        ...(customMultiplier !== undefined ? { customMultiplier } : {}),
      });
      setProRevenueConfigResult(action);
      if (!action.success) {
        setError(action.error || 'PRO 수익 설정 저장에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 수익 설정 저장 · 배수 ${formatNumber(action.config?.customMultiplier)}`);
    } catch (err) {
      setError((err as Error).message || 'PRO 수익 설정 저장에 실패했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [
    client,
    proAdpostAvgRpm,
    proAdpostEnabled,
    proCoupangAvgCommission,
    proCoupangCtr,
    proCoupangEnabled,
    proRevenueMultiplier,
  ]);

  const estimateProPortfolioRevenue = useCallback(async () => {
    setError('');
    const lines = proPortfolioItemsInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const items = lines.map((line) => {
      const [keywordRaw, viewsRaw, categoryRaw] = line.split(/[,\t]/).map((part) => part.trim());
      return {
        keyword: keywordRaw,
        monthlyViews: parseOptionalNumberInput(viewsRaw || ''),
        category: categoryRaw || undefined,
      };
    });

    if (!items.length) {
      const keyword = resolveProBlueprintKeyword();
      const monthlyViews = parseOptionalNumberInput(proRevenueViews);
      if (keyword && monthlyViews !== undefined) {
        items.push({
          keyword,
          monthlyViews,
          category: proRevenueCategory.trim() || selectedCategory.label,
        });
      }
    }

    const invalid = items.find((item) => !item.keyword || item.monthlyViews === undefined);
    if (!items.length || invalid) {
      setError('포트폴리오는 `키워드,월조회수,카테고리` 형식으로 입력해야 합니다.');
      return;
    }

    setIsProBlueprintActionRunning(true);
    try {
      const action = await client.estimateProPortfolioRevenue({
        items: items.map((item) => ({
          keyword: item.keyword,
          monthlyViews: item.monthlyViews as number,
          category: item.category,
        })),
      });
      setProPortfolioResult(action);
      if (!action.success) {
        setError(action.error || 'PRO 포트폴리오 수익 추정에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 포트폴리오 수익 · 월 ${formatNumber(action.result?.totalMonthly)}원`);
    } catch (err) {
      setError((err as Error).message || 'PRO 포트폴리오 수익 추정에 실패했습니다.');
    } finally {
      setIsProBlueprintActionRunning(false);
    }
  }, [
    client,
    proPortfolioItemsInput,
    proRevenueCategory,
    proRevenueViews,
    resolveProBlueprintKeyword,
    selectedCategory.label,
  ]);

  const recordProOutcome = useCallback(async () => {
    setError('');
    const postUrl = outcomePostUrl.trim();
    const keyword = outcomeKeyword.trim();
    const predictedRank = parseOptionalNumberInput(outcomePredictedRank);
    const predictedTraffic = parseOptionalNumberInput(outcomePredictedTraffic);
    const actualRank = parseOptionalNumberInput(outcomeActualRank);
    const actualMonthlyViews = parseOptionalNumberInput(outcomeMonthlyViews);
    const actualMonthlyRevenue = parseOptionalNumberInput(outcomeMonthlyRevenue);
    const firstExposureDays = parseOptionalNumberInput(outcomeFirstExposureDays);
    const numericInputs = [
      ['예상 순위', outcomePredictedRank, predictedRank],
      ['예상 트래픽', outcomePredictedTraffic, predictedTraffic],
      ['실제 순위', outcomeActualRank, actualRank],
      ['월 조회수', outcomeMonthlyViews, actualMonthlyViews],
      ['월 수익', outcomeMonthlyRevenue, actualMonthlyRevenue],
      ['첫 노출 일수', outcomeFirstExposureDays, firstExposureDays],
    ] as const;

    if (!postUrl || !keyword) {
      setError('성과 기록에는 글 URL과 키워드가 필요합니다.');
      return;
    }
    const invalid = numericInputs.find(([, raw, parsed]) => raw.trim() && parsed === undefined);
    if (invalid) {
      setError(`${invalid[0]}은 숫자로 입력해야 합니다.`);
      return;
    }

    setIsProOutcomeActionRunning(true);
    try {
      const result = await client.recordProOutcome({
        postUrl,
        keyword,
        category: outcomeCategory.trim() || undefined,
        predictedRank,
        predictedTraffic,
        actualRank,
        actualMonthlyViews,
        actualMonthlyRevenue,
        firstExposureDays,
        notes: outcomeNotes.trim() || undefined,
      });
      setProOutcomes(result.snapshot);
      if (!result.success) {
        setError('PRO 성과 기록에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 성과 기록 완료 · 측정 ${result.snapshot.measuredPosts}/${result.snapshot.totalRecords}개`);
      setOutcomePostUrl('');
      setOutcomeKeyword('');
      setOutcomeCategory('');
      setOutcomePredictedRank('');
      setOutcomePredictedTraffic('');
      setOutcomeActualRank('');
      setOutcomeMonthlyViews('');
      setOutcomeMonthlyRevenue('');
      setOutcomeFirstExposureDays('');
      setOutcomeNotes('');
    } catch (err) {
      setError((err as Error).message || 'PRO 성과 기록에 실패했습니다.');
    } finally {
      setIsProOutcomeActionRunning(false);
    }
  }, [
    client,
    outcomeActualRank,
    outcomeCategory,
    outcomeFirstExposureDays,
    outcomeKeyword,
    outcomeMonthlyRevenue,
    outcomeMonthlyViews,
    outcomeNotes,
    outcomePostUrl,
    outcomePredictedRank,
    outcomePredictedTraffic,
  ]);

  const deleteProOutcome = useCallback(async (postUrl: string) => {
    setError('');
    setIsProOutcomeActionRunning(true);
    try {
      const result = await client.deleteProOutcome({ postUrl });
      setProOutcomes(result.snapshot);
      setApiHealth(`PRO 성과 삭제 ${result.removed ?? 0}개 · 기록 ${result.snapshot.totalRecords}개`);
    } catch (err) {
      setError((err as Error).message || 'PRO 성과 삭제에 실패했습니다.');
    } finally {
      setIsProOutcomeActionRunning(false);
    }
  }, [client]);

  const syncProOutcomes = useCallback(async () => {
    setError('');
    setIsProOutcomeActionRunning(true);
    try {
      const result = await client.syncProOutcomes();
      setProOutcomes(result.snapshot);
      setApiHealth(`PRO 성과 동기화 ${result.synced ?? 0}개 · 기록 ${result.snapshot.totalRecords}개`);
    } catch (err) {
      setError((err as Error).message || 'PRO 성과 동기화에 실패했습니다.');
    } finally {
      setIsProOutcomeActionRunning(false);
    }
  }, [client]);

  const addRankTrackingPair = useCallback(async () => {
    setError('');
    const keyword = rankKeyword.trim();
    const postUrl = rankPostUrl.trim();
    if (!keyword || !postUrl) {
      setError('추적할 키워드와 네이버 블로그 글 URL이 필요합니다.');
      return;
    }

    setIsRankActionRunning(true);
    try {
      const result = await client.addRankTrackingPair({
        keyword,
        postUrl,
        postTitle: rankPostTitle.trim(),
        category: 'mobile-manual',
      });
      setRankTracking(result.snapshot);
      if (!result.success) {
        setError(result.error === 'already-tracked' ? '이미 추적 중인 키워드/글입니다.' : '순위 추적 등록에 실패했습니다.');
        return;
      }
      setApiHealth(`순위 추적 등록 완료 · PC 추적 ${result.snapshot.totals.trackedPairs}개`);
      setRankKeyword('');
      setRankPostUrl('');
      setRankPostTitle('');
    } catch (err) {
      setError((err as Error).message || '순위 추적 등록에 실패했습니다.');
    } finally {
      setIsRankActionRunning(false);
    }
  }, [client, rankKeyword, rankPostTitle, rankPostUrl]);

  const addProTrackedPost = useCallback(async () => {
    setError('');
    const keyword = rankKeyword.trim();
    const postUrl = rankPostUrl.trim();
    const predictedRank = parseOptionalNumberInput(rankPredictedRank);
    if (!keyword || !postUrl) {
      setError('PRO 글 추적에는 키워드와 네이버 블로그 글 URL이 필요합니다.');
      return;
    }
    if (rankPredictedRank.trim() && predictedRank === undefined) {
      setError('예상 순위는 숫자로 입력해야 합니다.');
      return;
    }

    setIsRankActionRunning(true);
    try {
      const keywords = rankExtraKeywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const result = await client.addProTrackedPost({
        keyword,
        postUrl,
        predictedRank,
        keywords,
      });
      setRankTracking(result.snapshot);
      if (!result.success) {
        setError('PRO 글 추적 등록에 실패했습니다.');
        return;
      }
      setApiHealth(`PRO 글 추적 등록 완료 · PRO 추적 ${result.snapshot.totals.proTrackedPosts}개`);
      setRankKeyword('');
      setRankPostUrl('');
      setRankPostTitle('');
      setRankPredictedRank('');
      setRankExtraKeywords('');
    } catch (err) {
      setError((err as Error).message || 'PRO 글 추적 등록에 실패했습니다.');
    } finally {
      setIsRankActionRunning(false);
    }
  }, [client, rankExtraKeywords, rankKeyword, rankPostUrl, rankPredictedRank]);

  const runRankTrackingCheck = useCallback(async () => {
    setError('');
    setIsRankActionRunning(true);
    try {
      const result = await client.runRankTrackingCheck({ maxItems: 5 });
      setRankTracking(result.snapshot);
      setApiHealth(`순위 점검 ${result.checked ?? 0}개 · 30위 노출 ${result.exposed ?? 0}개 · 차단 ${result.blocked ?? 0}개`);
      if (result.message) setError(result.message);
    } catch (err) {
      setError((err as Error).message || '순위 점검 실행에 실패했습니다.');
    } finally {
      setIsRankActionRunning(false);
    }
  }, [client]);

  const removeRankTrackingPair = useCallback(async (keyword: string, postUrl: string) => {
    setError('');
    setIsRankActionRunning(true);
    try {
      const result = await client.removeRankTrackingPair({ keyword, postUrl });
      setRankTracking(result.snapshot);
      setApiHealth(`순위 추적 삭제 ${result.removed ?? 0}개 · PC 추적 ${result.snapshot.totals.trackedPairs}개`);
    } catch (err) {
      setError((err as Error).message || '순위 추적 삭제에 실패했습니다.');
    } finally {
      setIsRankActionRunning(false);
    }
  }, [client]);

  const createScheduleFromSeed = useCallback(async () => {
    setError('');
    const keyword = seedKeyword.trim();
    const rawDate = scheduleDateTime.trim();
    if (!keyword) {
      setError('예약할 시드 키워드가 필요합니다.');
      return;
    }
    if (!rawDate) {
      setError('예약 시각이 필요합니다. 예: 2026-06-09 09:30');
      return;
    }
    const parsedDate = parseScheduleDateInput(rawDate);
    if (!parsedDate) {
      setError('예약 시각 형식이 올바르지 않습니다. 예: 2026-06-09 09:30');
      return;
    }

    try {
      const created = await client.createKeywordSchedule({
        keyword,
        topic: keyword,
        keywords: [keyword],
        scheduleDateTime: parsedDate.toISOString(),
        platform: 'blogger',
        publishType: 'schedule',
      });
      setScheduleDashboard(created.snapshot);
      setScheduleDateTime('');
      setEditingScheduleId('');
      setApiHealth(`예약 저장됨 · ${created.schedule.keyword}`);
    } catch (err) {
      setError((err as Error).message || '키워드 예약을 저장하지 못했습니다.');
    }
  }, [client, scheduleDateTime, seedKeyword]);

  const startScheduleEdit = useCallback((item: MobileKeywordScheduleItem) => {
    setError('');
    setEditingScheduleId(item.id);
    setSeedKeyword(item.keyword);
    setScheduleDateTime(scheduleInputValue(item.scheduleDateTime));
    setApiHealth(`예약 편집 중 · ${item.keyword}`);
  }, []);

  const cancelScheduleEdit = useCallback(() => {
    setEditingScheduleId('');
    setScheduleDateTime('');
    setApiHealth('예약 편집을 취소했습니다.');
  }, []);

  const saveScheduleDetails = useCallback(async () => {
    setError('');
    if (!editingScheduleId) {
      await createScheduleFromSeed();
      return;
    }
    const keyword = seedKeyword.trim();
    const rawDate = scheduleDateTime.trim();
    if (!keyword) {
      setError('수정할 예약 키워드가 필요합니다.');
      return;
    }
    if (!rawDate) {
      setError('예약 시각이 필요합니다. 예: 2026-06-09 09:30');
      return;
    }
    const parsedDate = parseScheduleDateInput(rawDate);
    if (!parsedDate) {
      setError('예약 시각 형식이 올바르지 않습니다. 예: 2026-06-09 09:30');
      return;
    }

    try {
      const updated = await client.updateKeywordSchedule(editingScheduleId, {
        keyword,
        topic: keyword,
        keywords: [keyword],
        scheduleDateTime: parsedDate.toISOString(),
        platform: 'blogger',
        publishType: 'schedule',
        enabled: true,
      });
      setScheduleDashboard(updated.snapshot);
      setEditingScheduleId('');
      setScheduleDateTime('');
      setApiHealth(`예약 상세 저장됨 · ${updated.schedule.keyword}`);
    } catch (err) {
      setError((err as Error).message || '키워드 예약 상세를 저장하지 못했습니다.');
    }
  }, [client, createScheduleFromSeed, editingScheduleId, scheduleDateTime, seedKeyword]);

  const toggleSchedule = useCallback(async (id: string, enabled: boolean) => {
    setError('');
    try {
      const toggled = await client.toggleKeywordSchedule(id, enabled);
      setScheduleDashboard(toggled.snapshot);
      setApiHealth(enabled ? '예약을 활성화했습니다.' : '예약을 비활성화했습니다.');
    } catch (err) {
      setError((err as Error).message || '키워드 예약 상태를 바꾸지 못했습니다.');
    }
  }, [client]);

  const deleteSchedule = useCallback(async (id: string) => {
    setError('');
    try {
      const deleted = await client.deleteKeywordSchedule(id);
      setScheduleDashboard(deleted.snapshot);
      if (editingScheduleId === id) {
        setEditingScheduleId('');
        setScheduleDateTime('');
      }
      setApiHealth(`예약 삭제됨 · ${deleted.schedule.keyword}`);
    } catch (err) {
      setError((err as Error).message || '키워드 예약을 삭제하지 못했습니다.');
    }
  }, [client, editingScheduleId]);

  const refreshKeywordGroups = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getKeywordGroups();
      setKeywordGroups(snapshot);
      setApiHealth(`키워드 그룹 ${snapshot.total}개 동기화`);
    } catch (err) {
      setError((err as Error).message || '키워드 그룹을 불러오지 못했습니다.');
    }
  }, [client]);

  const createKeywordGroupFromSeed = useCallback(async () => {
    setError('');
    const seed = seedKeyword.trim();
    const name = groupName.trim() || seed || `${selectedCategory.label} 후보`;
    if (!name && !seed) {
      setError('그룹 이름이나 시드 키워드가 필요합니다.');
      return;
    }

    try {
      const created = await client.createKeywordGroup({
        name,
        seedKeyword: seed || undefined,
        keywords: seed ? [seed] : [],
      });
      setKeywordGroups(created.snapshot);
      setGroupName('');
      setApiHealth(`키워드 그룹 저장됨 · ${created.group.name}`);
    } catch (err) {
      setError((err as Error).message || '키워드 그룹을 저장하지 못했습니다.');
    }
  }, [client, groupName, seedKeyword, selectedCategory.label]);

  const removeKeywordGroup = useCallback(async (id: string) => {
    setError('');
    try {
      const snapshot = await client.deleteKeywordGroup(id);
      setKeywordGroups(snapshot);
      setApiHealth(`키워드 그룹 ${snapshot.total}개 동기화`);
    } catch (err) {
      setError((err as Error).message || '키워드 그룹을 삭제하지 못했습니다.');
    }
  }, [client]);

  const refreshWordPressPublishing = useCallback(async () => {
    setError('');
    try {
      const snapshot = await client.getWordPressPublishing();
      rememberWordPressSnapshot(snapshot);
      setApiHealth(`워드프레스 ${snapshot.configured ? '연동됨' : '설정 필요'} · 초안 ${snapshot.drafts.total}개`);
    } catch (err) {
      setError((err as Error).message || '워드프레스 발행 상태를 불러오지 못했습니다.');
    }
  }, [client, rememberWordPressSnapshot]);

  const saveWordPressSite = useCallback(async () => {
    setError('');
    const siteUrl = wordpressSiteUrl.trim();
    if (!siteUrl) {
      setError('워드프레스 사이트 주소가 필요합니다.');
      return;
    }

    try {
      const saved = await client.saveWordPressSite({
        siteUrl,
        username: wordpressUsername.trim() || undefined,
        applicationPassword: wordpressPassword.trim() || undefined,
        defaultCategoryId: wordpressCategoryId.trim() || undefined,
        defaultCategoryName: wordpressCategoryName.trim() || undefined,
        categories: wordpressCategoryId.trim() && wordpressCategoryName.trim()
          ? [{
            id: wordpressCategoryId.trim(),
            name: wordpressCategoryName.trim(),
          }]
          : undefined,
      });
      rememberWordPressSnapshot(saved.snapshot);
      setWordpressPassword('');
      setApiHealth(`워드프레스 사이트 저장됨 · ${saved.site.siteUrl}`);
    } catch (err) {
      setError((err as Error).message || '워드프레스 사이트를 저장하지 못했습니다.');
    }
  }, [
    client,
    rememberWordPressSnapshot,
    wordpressCategoryId,
    wordpressCategoryName,
    wordpressPassword,
    wordpressSiteUrl,
    wordpressUsername,
  ]);

  const createWordPressDraftFromResult = useCallback(async () => {
    setError('');
    const site = wordpressPublishing?.sites.items[0];
    if (!site) {
      setError('워드프레스 사이트를 먼저 저장하거나 PC 저장소와 동기화해 주세요.');
      return;
    }

    const items = (result?.keywords || []).slice(0, 8);
    const keyword = seedKeyword.trim() || items[0]?.keyword || selectedMode.title;
    const title = `${keyword} 키워드 발행 초안`;
    const metricLines = items.length > 0
      ? items.map((item, index) => (
        `${index + 1}. ${item.keyword} · ${item.grade} · 검색 ${formatNumber(item.totalSearchVolume)} · 문서 ${formatNumber(item.documentCount)} · 비율 ${item.goldenRatio ?? '-'}`
      ))
      : [`1. ${keyword} · ${selectedCategory.label} 기준으로 본문을 작성하세요.`];
    const content = [
      title,
      '',
      `대표 키워드: ${keyword}`,
      `카테고리: ${wordpressCategoryName.trim() || site.defaultCategoryName || selectedCategory.label}`,
      '',
      ...metricLines,
      '',
      '모바일에서 등록한 초안입니다. PC 발행 화면에서 최종 제목, 본문, CTA를 확인한 뒤 발행하세요.',
    ].join('\n');

    try {
      const created = await client.createWordPressDraft({
        siteId: site.id,
        title,
        keyword,
        content,
        categoryId: wordpressCategoryId.trim() || site.defaultCategoryId || undefined,
        categoryName: wordpressCategoryName.trim() || site.defaultCategoryName || selectedCategory.label,
        tags: [keyword, selectedCategory.label].filter(Boolean),
      });
      rememberWordPressSnapshot(created.snapshot);
      setApiHealth(`워드프레스 초안 등록됨 · ${created.draft.title}`);
    } catch (err) {
      setError((err as Error).message || '워드프레스 초안을 등록하지 못했습니다.');
    }
  }, [
    client,
    rememberWordPressSnapshot,
    result,
    seedKeyword,
    selectedCategory.label,
    selectedMode.title,
    wordpressCategoryId,
    wordpressCategoryName,
    wordpressPublishing,
  ]);

  const refreshWordPressCategories = useCallback(async () => {
    setError('');
    const site = wordpressPublishing?.sites.items[0];
    if (!site) {
      setError('워드프레스 사이트를 먼저 저장하거나 PC 저장소와 동기화해 주세요.');
      return;
    }

    try {
      const refreshed = await client.refreshWordPressCategories(site.id);
      rememberWordPressSnapshot(refreshed.snapshot);
      setApiHealth(`WP 카테고리 ${refreshed.categories.length}개 동기화`);
    } catch (err) {
      setError((err as Error).message || '워드프레스 카테고리를 불러오지 못했습니다.');
    }
  }, [client, rememberWordPressSnapshot, wordpressPublishing]);

  const publishLatestWordPressDraft = useCallback(async () => {
    setError('');
    const site = wordpressPublishing?.sites.items[0];
    const drafts = wordpressPublishing?.drafts.items || [];
    const draft = drafts[drafts.length - 1];
    if (!site) {
      setError('워드프레스 사이트를 먼저 저장하거나 PC 저장소와 동기화해 주세요.');
      return;
    }
    if (!draft) {
      setError('먼저 WP 초안을 등록해 주세요.');
      return;
    }

    try {
      const published = await client.publishWordPressDraft({
        siteId: site.id,
        draftId: draft.id,
        status: wordpressPostStatus.trim() || 'draft',
      });
      rememberWordPressSnapshot(published.snapshot);
      setLastWordPressPublish(published.result);
      setApiHealth(`WP REST 전송 완료 · ${published.result.postId || published.result.status}`);
    } catch (err) {
      setError((err as Error).message || '워드프레스 REST 전송에 실패했습니다.');
    }
  }, [
    client,
    rememberWordPressSnapshot,
    wordpressPostStatus,
    wordpressPublishing,
  ]);

  const selectPcFeature = useCallback((item: PcFeatureItem) => {
    setError('');
    if (item.lane) setDashboardLane(item.lane);
    if (item.mode) setMode(item.mode);
    if (item.categoryId) setCategoryId(item.categoryId);
    if (item.seedKeyword) setSeedKeyword(item.seedKeyword);
    if (!item.mode && item.status === 'pc') {
      setError(`${item.title}은 PC 기능 목록에 포함되어 있고, 모바일 실행 API는 다음 단계에서 연결합니다.`);
    }
  }, []);

  const startJob = useCallback(async () => {
    setError('');
    setResult(null);
    setJob(null);
    setIsRunning(true);

    try {
      const seed = seedKeyword.trim();
      let created: MobileJobEnvelope<unknown, MobileKeywordResult>;

      if ((mode === 'analysis' || mode === 'mindmap') && !seed) {
        setError('키워드 분석과 마인드맵 확장은 시드 키워드가 필요합니다.');
        return;
      }

      if (mode === 'golden') {
        const targetCount = goldenRunMode === 'bulk'
          ? MOBILE_PC_PARITY_SLA.qualityFloors.goldenBulkSss
          : MOBILE_PC_PARITY_SLA.qualityFloors.goldenPrecisionSss;
        created = await client.createGoldenDiscoveryJob({
          categoryId,
          mode: goldenRunMode,
          seedKeyword: seed || undefined,
          targetCount,
          requireSssFloor: true,
        });
      } else if (mode === 'pro') {
        created = await client.createProTrafficJob({
          categoryId,
          seedKeyword: seed || undefined,
          targetCount: MOBILE_PC_PARITY_SLA.qualityFloors.proTrafficMaxSssTarget,
          includeSeasonal: true,
          includeEvergreen: true,
          includeFreshIssue: true,
        });
      } else if (mode === 'analysis') {
        created = await client.createKeywordAnalysisJob({
          keyword: seed,
          categoryId,
          maxRelatedCount: MOBILE_PC_PARITY_SLA.qualityFloors.keywordAnalysisDefaultRelated,
          includeMindmapPreview: true,
        });
      } else if (mode === 'mindmap') {
        created = await client.createMindmapExpansionJob({
          seedKeyword: seed,
          depth: 2,
          targetCount: MOBILE_PC_PARITY_SLA.qualityFloors.mindmapDefaultMeasuredKeywords,
          includeVolumeMetrics: true,
        });
      } else if (mode === 'home') {
        created = await client.createHomeBoardJob({
          categoryId,
          seedKeyword: seed || undefined,
          targetCount: 30,
          requireSplusFloor: true,
        });
      } else {
        created = await client.createKinHiddenHoneyJob({
          tabType: 'hidden',
          targetCount: 15,
          isPremiumRequest: true,
        });
      }

      setJob(created as MobileJobEnvelope<unknown, MobileKeywordResult>);

      const finalJob = await client.pollJobUntilTerminal(
        created.id,
        (nextJob) => setJob(nextJob as MobileJobEnvelope<unknown, MobileKeywordResult>),
        { intervalMs: 1000, timeoutMs: mode === 'pro' ? 300000 : 180000 },
      );

      setJob(finalJob as MobileJobEnvelope<unknown, MobileKeywordResult>);
      if (finalJob.state === 'completed' && finalJob.result) {
        setResult(finalJob.result);
        await refreshDashboard();
      } else {
        setError(`작업이 ${finalJob.state} 상태로 끝났습니다.`);
      }
    } catch (err) {
      setError((err as Error).message || '작업을 시작하지 못했습니다.');
    } finally {
      setIsRunning(false);
    }
  }, [categoryId, client, goldenRunMode, mode, refreshDashboard, seedKeyword]);

  const cancelJob = useCallback(async () => {
    if (!job?.id) return;
    try {
      const cancelled = await client.cancelJob(job.id);
      setJob(cancelled as MobileJobEnvelope<unknown, MobileKeywordResult>);
      setIsRunning(false);
    } catch (err) {
      setError((err as Error).message || '작업을 취소하지 못했습니다.');
    }
  }, [client, job?.id]);

  const refreshPrewarm = useCallback(async () => {
    setError('');
    try {
      setPrewarm(await client.getPrewarmSnapshot());
    } catch (err) {
      setError((err as Error).message || '서버 예열 상태를 가져오지 못했습니다.');
    }
  }, [client]);

  const refreshLiveGolden = useCallback(async () => {
    setError('');
    try {
      setLiveGolden(await client.getLiveGoldenSnapshot());
      setNotifications(await client.getNotifications(8).catch(() => notifications));
    } catch (err) {
      setError((err as Error).message || '실시간 황금 발굴 상태를 가져오지 못했습니다.');
    }
  }, [client, notifications]);

  const runLiveGoldenNow = useCallback(async () => {
    setError('');
    try {
      setLiveGolden(await client.runLiveGoldenOnce());
      setNotifications(await client.getNotifications(8).catch(() => notifications));
    } catch (err) {
      setError((err as Error).message || '실시간 황금 발굴을 실행하지 못했습니다.');
    }
  }, [client, notifications]);

  const refreshNotifications = useCallback(async () => {
    setError('');
    try {
      setNotifications(await client.getNotifications(8));
    } catch (err) {
      setError((err as Error).message || '추천 인박스를 가져오지 못했습니다.');
    }
  }, [client]);

  const markNotificationRead = useCallback(async (id: string) => {
    setError('');
    try {
      await client.markNotificationRead(id);
      setNotifications(await client.getNotifications(8));
    } catch (err) {
      setError((err as Error).message || '추천 항목을 읽음 처리하지 못했습니다.');
    }
  }, [client]);

  const registerPushNotifications = useCallback(async () => {
    setError('');
    setIsRegisteringPush(true);
    try {
      const response = await registerLeWordPushNotifications(client);
      setPushStatus(response.message);
      if (response.subscription) setPushSubscription(response.subscription);
      if (response.status !== 'registered') setError(response.message);
    } catch (err) {
      const message = (err as Error).message || '푸시 등록에 실패했습니다.';
      setPushStatus(message);
      setError(message);
    } finally {
      setIsRegisteringPush(false);
    }
  }, [client]);

  const unregisterPushNotifications = useCallback(async () => {
    if (!pushSubscription) return;
    setError('');
    setIsRegisteringPush(true);
    try {
      const response = await client.unregisterPushSubscription(pushSubscription.id);
      setPushSubscription(response.subscription.enabled ? response.subscription : null);
      setPushStatus('이 기기의 푸시 등록을 해제했습니다.');
    } catch (err) {
      const message = (err as Error).message || '푸시 해제에 실패했습니다.';
      setPushStatus(message);
      setError(message);
    } finally {
      setIsRegisteringPush(false);
    }
  }, [client, pushSubscription]);

  const shareKeywordExport = useCallback(async (format: MobileKeywordExportFormat) => {
    setError('');
    const keywords = result?.keywords || [];
    if (keywords.length === 0) {
      setError('공유할 키워드 결과가 없습니다. 먼저 분석이나 발굴을 실행해 주세요.');
      return;
    }

    try {
      const artifact = await client.exportKeywords({
        format,
        title: seedKeyword.trim() || selectedMode.title,
        keywords,
      });
      setLastExportArtifact(artifact);
      await Share.share({
        title: artifact.filename,
        message: format === 'text'
          ? artifact.content
          : `${artifact.shareText}\n\n${artifact.content}`,
      });
      setApiHealth(`내보내기 준비됨 · ${artifact.filename}`);
    } catch (err) {
      setError((err as Error).message || '키워드 결과를 공유하지 못했습니다.');
    }
  }, [client, result, seedKeyword, selectedMode.title]);

  const openPrivacyPolicy = useCallback(async () => {
    try {
      await Linking.openURL(privacyUrl);
    } catch (err) {
      setError((err as Error).message || 'Privacy Policy를 열지 못했습니다.');
    }
  }, [privacyUrl]);

  const progressPercent = Math.max(0, Math.min(100, job?.progressPercent || 0));
  const resultItems = result?.keywords || [];
  const connected = !!session || /연결됨|연동/.test(apiHealth);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.kicker}>LEWORD MOBILE</Text>
          <Text style={[styles.linkBadge, connected && styles.linkBadgeOn]}>
            {connected ? 'PC 연동됨' : '연동 필요'}
          </Text>
        </View>
        <Text style={styles.title}>오늘 쓸 키워드만 바로 보기</Text>
        <Text style={styles.subtitle}>
          로그인하면 패널 계정과 PC 엔진을 자동으로 연결하고, 실시간 검색어·정책·이슈를 한 화면에서 봅니다.
        </Text>
      </View>

      <View style={styles.loginBox}>
        <Text style={styles.cardTitle}>내 패널 로그인</Text>
        <Text style={styles.cardText}>
          모바일 설정을 따로 맞추지 않고 계정 기준으로 PC API와 자동 연동합니다.
        </Text>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="아이디"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="비밀번호 또는 모바일 토큰"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <TextInput
          value={licenseCode}
          onChangeText={setLicenseCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="라이선스 코드 선택 입력"
          placeholderTextColor="#64748b"
          style={styles.input}
        />
        <Pressable
          style={[styles.primaryButton, isLoggingIn && styles.disabledButton]}
          onPress={loginAndLinkPc}
          disabled={isLoggingIn}
        >
          <Text style={styles.primaryButtonText}>
            {isLoggingIn ? '연동 중' : '로그인하고 PC 자동 연동'}
          </Text>
        </Pressable>
        <View style={styles.inlineActions}>
          <Pressable
            style={[styles.secondaryButton, isCheckingApi && styles.disabledButton]}
            onPress={checkApiHealth}
            disabled={isCheckingApi}
          >
            <Text style={styles.secondaryButtonText}>
              {isCheckingApi ? '확인 중' : 'PC 연결 확인'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={refreshApiStatus}>
            <Text style={styles.secondaryButtonText}>API 진단</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => setShowAdvanced(!showAdvanced)}>
            <Text style={styles.secondaryButtonText}>{showAdvanced ? '설정 닫기' : '고급 연결'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={unlinkLocalSession}>
            <Text style={styles.secondaryButtonText}>연동 해제</Text>
          </Pressable>
        </View>
        <Text style={styles.statusText}>
          {isRestoringSession ? '저장된 패널 세션 확인 중' : session?.message || apiHealth}
        </Text>
      </View>

      {showAdvanced ? (
        <View style={styles.advancedBox}>
          <Text style={styles.sectionLabel}>PC API 주소</Text>
          <TextInput
            value={apiUrl}
            onChangeText={setApiUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://PC_IP:34983"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
          {apiUrlWarning ? <Text style={styles.warningText}>{apiUrlWarning}</Text> : null}
          <Text style={styles.sectionLabel}>API 토큰</Text>
          <TextInput
            value={accessToken}
            onChangeText={setAccessToken}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="자동 연동 시 입력 불필요"
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>
      ) : null}

      <View style={styles.dashboardBox}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>오늘의 흐름</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.smallButton} onPress={refreshSourceSignals}>
              <Text style={styles.smallButtonText}>소스 갱신</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={refreshDashboard}>
              <Text style={styles.smallButtonText}>새로고침</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.tabRow}>
          {DASHBOARD_LANES.map((lane) => (
            <Pressable
              key={lane.id}
              style={[styles.tabButton, dashboardLane === lane.id && styles.tabButtonActive]}
              onPress={() => setDashboardLane(lane.id)}
            >
              <Text style={[styles.tabText, dashboardLane === lane.id && styles.tabTextActive]}>
                {lane.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {dashboardItems.length > 0 ? dashboardItems.map((item) => (
          <Pressable
            key={item.id}
            style={styles.signalRow}
            onPress={() => {
              setSeedKeyword(item.keyword);
              setCategoryId(item.categoryId || categoryId);
              setMode(item.kind === 'policy' ? 'home' : 'analysis');
            }}
          >
            <View style={styles.signalRank}>
              <Text style={styles.signalRankText}>{item.priority}</Text>
            </View>
            <View style={styles.signalBody}>
              <Text style={styles.signalKeyword}>{item.keyword}</Text>
              <Text style={styles.signalTitle}>{item.title}</Text>
              <Text style={styles.signalDescription}>{item.description}</Text>
            </View>
          </Pressable>
        )) : (
          <Text style={styles.emptyText}>로그인하거나 PC 연결 확인을 누르면 오늘 피드가 표시됩니다.</Text>
        )}
      </View>

      <View style={styles.pcWorkspace}>
        <View style={styles.leftRail}>
          {PC_FEATURE_TABS.map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.railTab, featureTab === tab.id && styles.railTabActive]}
              onPress={() => setFeatureTab(tab.id)}
            >
              <Text style={[styles.railTabText, featureTab === tab.id && styles.railTabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.featurePanel}>
          <Text style={styles.featurePanelTitle}>{selectedFeatureTab.title}</Text>
          <Text style={styles.featurePanelText}>
            PC 기능을 모바일에서 한눈에 보고, 실행 가능한 항목은 바로 PC 엔진 작업으로 연결합니다.
          </Text>
          {pcCatalog ? (
            <View style={styles.catalogSummary}>
              <Text style={styles.catalogSummaryText}>
                PC 전체 {pcCatalog.totalHandlers}개 · 즉시실행 {pcCatalog.ready} · 연동 {pcCatalog.linked}
              </Text>
              <Text style={styles.catalogSummaryText}>
                이 탭 {pcCatalog.tabs[featureTab]}개 · 예정 {pcCatalog.planned} · PC전용 {pcCatalog.pcOnly}
              </Text>
            </View>
          ) : (
            <Text style={styles.catalogEmptyText}>PC 전체 기능 카탈로그를 불러오는 중입니다.</Text>
          )}
          {featureTab === 'analysis' ? (
            <View style={styles.scheduleDashboardBox}>
              <View style={styles.progressHeader}>
                <Text style={styles.cardTitle}>순위 추적</Text>
                <Pressable style={styles.smallButton} onPress={refreshRankTracking}>
                  <Text style={styles.smallButtonText}>순위 추적 갱신</Text>
                </Pressable>
              </View>
              <Text style={styles.cardText}>
                {rankTracking
                  ? `PC 추적 ${rankTracking.totals.trackedPairs}개 · 10위권 ${rankTracking.totals.currentlyInTop10}개 · 30위권 ${rankTracking.totals.hitRate30}%`
                  : 'PC 순위 추적 대시보드의 글/키워드 결과를 아직 불러오지 않았습니다.'}
              </Text>
              <View style={styles.catalogRow}>
                <Text style={styles.sectionLabel}>수동 추적 등록</Text>
                <TextInput
                  placeholder="키워드"
                  placeholderTextColor="#64748b"
                  value={rankKeyword}
                  onChangeText={setRankKeyword}
                  style={styles.input}
                />
                <TextInput
                  placeholder="네이버 블로그 글 URL"
                  placeholderTextColor="#64748b"
                  value={rankPostUrl}
                  onChangeText={setRankPostUrl}
                  autoCapitalize="none"
                  style={styles.input}
                />
                <TextInput
                  placeholder="글 제목"
                  placeholderTextColor="#64748b"
                  value={rankPostTitle}
                  onChangeText={setRankPostTitle}
                  style={styles.input}
                />
                <TextInput
                  placeholder="PRO 예상 순위"
                  placeholderTextColor="#64748b"
                  value={rankPredictedRank}
                  onChangeText={setRankPredictedRank}
                  keyboardType="numeric"
                  style={styles.input}
                />
                <TextInput
                  placeholder="PRO 추가 키워드, 쉼표로 구분"
                  placeholderTextColor="#64748b"
                  value={rankExtraKeywords}
                  onChangeText={setRankExtraKeywords}
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <Pressable
                    style={[styles.secondaryButton, isRankActionRunning && styles.disabledButton]}
                    onPress={addRankTrackingPair}
                    disabled={isRankActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>추적 등록</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, isRankActionRunning && styles.disabledButton]}
                    onPress={addProTrackedPost}
                    disabled={isRankActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>PRO 글 추적 등록</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallButton, isRankActionRunning && styles.disabledButton]}
                    onPress={runRankTrackingCheck}
                    disabled={isRankActionRunning}
                  >
                    <Text style={styles.smallButtonText}>{isRankActionRunning ? '처리 중' : '빠른 점검'}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.scheduleMetricGrid}>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{rankTracking?.totals.trackedPairs ?? '-'}</Text>
                  <Text style={styles.scheduleMetricLabel}>추적 글</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{rankTracking?.totals.currentlyInTop10 ?? '-'}</Text>
                  <Text style={styles.scheduleMetricLabel}>10위권</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{rankTracking?.totals.hitRate30 ?? '-'}</Text>
                  <Text style={styles.scheduleMetricLabel}>30위율</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{rankTracking?.totals.alerts ?? '-'}</Text>
                  <Text style={styles.scheduleMetricLabel}>알림</Text>
                </View>
              </View>
              <Text style={styles.catalogMeta}>
                RSS {rankTracking?.rssUrl || '미설정'} · 키워드 이력 {rankTracking?.totals.keywordHistorySize ?? '-'}개
              </Text>
              {(rankTracking?.posts.items || []).slice(0, 4).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.scheduleRow}
                  onPress={() => {
                    setSeedKeyword(item.keyword);
                    setMode('analysis');
                  }}
                >
                  <View style={styles.scheduleRowBody}>
                    <View style={styles.scheduleInfo}>
                      <View style={styles.scheduleRowTop}>
                        <Text style={styles.scheduleKeyword}>{item.keyword}</Text>
                        <Text style={[
                          styles.scheduleStatusPill,
                          item.currentInTop10 && styles.scheduleStatusCompleted,
                          !item.currentInTop10 && item.currentInTop30 && styles.scheduleStatusPending,
                        ]}>
                          {formatRank(item.currentRank)}
                        </Text>
                      </View>
                      <Text style={styles.catalogMeta}>
                        {formatRankChange(item.rankChange)} · {item.source} · 검사 {item.totalChecks}회 · {formatDateTime(item.lastCheckedAt)}
                      </Text>
                      <Text style={styles.catalogMeta} numberOfLines={1}>
                        {item.postTitle || item.postUrl}
                      </Text>
                      <Pressable
                        style={[styles.scheduleDeleteButton, isRankActionRunning && styles.disabledButton]}
                        onPress={() => removeRankTrackingPair(item.keyword, item.postUrl)}
                        disabled={isRankActionRunning}
                      >
                        <Text style={styles.scheduleDeleteText}>추적 삭제</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              ))}
              {(rankTracking?.keywords.items || []).slice(0, 3).map((item) => (
                <View key={item.keyword} style={styles.catalogRow}>
                  <View style={styles.catalogRowHeader}>
                    <Text style={styles.featureBadge}>LIFE</Text>
                    <Text style={styles.catalogTitle}>{item.keyword}</Text>
                  </View>
                  <Text style={styles.catalogMeta}>
                    문서 {formatNumber(item.latestDocCount)} · 증가 {formatNumber(item.docDelta)} · 검색량 {formatNumber(item.latestSearchVolume)} · 알림 {item.alertCount}
                  </Text>
                  {item.latestAlert ? (
                    <Text style={styles.catalogMeta}>{item.latestAlert}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {featureTab === 'premium' ? (
            <>
              <View style={styles.proBlueprintBox}>
                <View style={styles.progressHeader}>
                  <Text style={styles.cardTitle}>PRO 청사진</Text>
                  <Text style={[styles.catalogStatus, styles.catalogStatusLinked]}>PC 연동</Text>
                </View>
                <Text style={styles.cardText}>
                  {proBlueprintResult?.success
                    ? `최근 ${proBlueprintResult.blueprint?.keyword || proBlueprintKeyword} · ${proBlueprintResult.prediction?.rankRange || '예측 대기'}`
                    : 'PC PRO v12 · 청사진 · 초안 · 수익 추정'}
                </Text>
                <TextInput
                  placeholder="키워드"
                  placeholderTextColor="#64748b"
                  value={proBlueprintKeyword}
                  onChangeText={setProBlueprintKeyword}
                  style={styles.input}
                />
                <View style={styles.compactInputGrid}>
                  <TextInput
                    placeholder="검색량"
                    placeholderTextColor="#64748b"
                    value={proBlueprintSearchVolume}
                    onChangeText={setProBlueprintSearchVolume}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="월 조회수"
                    placeholderTextColor="#64748b"
                    value={proRevenueViews}
                    onChangeText={setProRevenueViews}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="카테고리"
                    placeholderTextColor="#64748b"
                    value={proRevenueCategory}
                    onChangeText={setProRevenueCategory}
                    style={[styles.input, styles.compactInput]}
                  />
                </View>
                <View style={styles.inlineActions}>
                  <Pressable
                    style={[styles.secondaryButton, isProBlueprintActionRunning && styles.disabledButton]}
                    onPress={generateProBlueprint}
                    disabled={isProBlueprintActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>청사진 생성</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      (!proBlueprintResult?.blueprint || isProBlueprintActionRunning) && styles.disabledButton,
                    ]}
                    onPress={generateProDraft}
                    disabled={!proBlueprintResult?.blueprint || isProBlueprintActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>초안 생성</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallButton, isProBlueprintActionRunning && styles.disabledButton]}
                    onPress={estimateProRevenue}
                    disabled={isProBlueprintActionRunning}
                  >
                    <Text style={styles.smallButtonText}>수익 추정</Text>
                  </Pressable>
                </View>
                {proBlueprintResult?.blueprint ? (
                  <View style={styles.catalogRow}>
                    <View style={styles.catalogRowHeader}>
                      <Text style={styles.featureBadge}>청사진</Text>
                      <Text style={styles.catalogTitle}>
                        {proBlueprintResult.blueprint.strategicTitle || proBlueprintResult.blueprint.keyword}
                      </Text>
                    </View>
                    <Text style={styles.catalogMeta}>
                      권장 {formatNumber(proBlueprintResult.analysis?.recommendedWordCount || proBlueprintResult.blueprint.recommendedWordCount)}자 · 이미지 {formatNumber(proBlueprintResult.analysis?.avgImageCount || proBlueprintResult.blueprint.recommendedImages)} · H2 {formatNumber(proBlueprintResult.analysis?.avgH2Count || proBlueprintResult.blueprint.recommendedH2Count)}
                    </Text>
                    <Text style={styles.catalogMeta}>
                      예측 {proBlueprintResult.prediction?.rankRange || '-'} · 승률 {formatNumber(proBlueprintResult.prediction?.winProbability)}%
                    </Text>
                  </View>
                ) : null}
                {proDraftResult?.draft ? (
                  <View style={styles.catalogRow}>
                    <View style={styles.catalogRowHeader}>
                      <Text style={styles.featureBadge}>초안</Text>
                      <Text style={styles.catalogTitle}>{proDraftResult.draft.title || proDraftResult.draft.keyword}</Text>
                    </View>
                    <Text style={styles.catalogMeta}>
                      {formatNumber(proDraftResult.draft.wordCount)}자 · {proDraftResult.draft.source || 'PC generator'}
                    </Text>
                    <Text style={styles.catalogMeta} numberOfLines={5}>
                      {proDraftResult.draft.markdown || proDraftResult.draft.content || ''}
                    </Text>
                  </View>
                ) : null}
                {proRevenueResult?.estimate ? (
                  <View style={styles.scheduleMetricGrid}>
                    <View style={styles.scheduleMetricCell}>
                      <Text style={styles.scheduleMetricValue}>{formatNumber(proRevenueResult.estimate.totalMonthlyRevenue)}</Text>
                      <Text style={styles.scheduleMetricLabel}>월 수익</Text>
                    </View>
                    <View style={styles.scheduleMetricCell}>
                      <Text style={styles.scheduleMetricValue}>{formatNumber(proRevenueResult.estimate.yearlyProjection)}</Text>
                      <Text style={styles.scheduleMetricLabel}>연 수익</Text>
                    </View>
                    <View style={styles.scheduleMetricCell}>
                      <Text style={styles.scheduleMetricValue}>{formatNumber(proRevenueResult.estimate.effectiveRpm)}</Text>
                      <Text style={styles.scheduleMetricLabel}>RPM</Text>
                    </View>
                    <View style={styles.scheduleMetricCell}>
                      <Text style={styles.scheduleMetricValue}>{formatNumber(proRevenueResult.estimate.coupangRevenue)}</Text>
                      <Text style={styles.scheduleMetricLabel}>쿠팡</Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.catalogRow}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.sectionLabel}>PRO 수익 설정</Text>
                    <Pressable
                      style={[styles.smallButton, isProBlueprintActionRunning && styles.disabledButton]}
                      onPress={refreshProRevenueConfig}
                      disabled={isProBlueprintActionRunning}
                    >
                      <Text style={styles.smallButtonText}>수익 설정 불러오기</Text>
                    </Pressable>
                  </View>
                  <View style={styles.catalogRowHeader}>
                    <Text style={styles.catalogTitle}>애드포스트</Text>
                    <Pressable
                      style={[styles.scheduleToggleButton, proAdpostEnabled && styles.scheduleToggleOnButton]}
                      onPress={() => setProAdpostEnabled(!proAdpostEnabled)}
                    >
                      <Text style={styles.scheduleToggleText}>{proAdpostEnabled ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.catalogRowHeader}>
                    <Text style={styles.catalogTitle}>쿠팡 파트너스</Text>
                    <Pressable
                      style={[styles.scheduleToggleButton, proCoupangEnabled && styles.scheduleToggleOnButton]}
                      onPress={() => setProCoupangEnabled(!proCoupangEnabled)}
                    >
                      <Text style={styles.scheduleToggleText}>{proCoupangEnabled ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.compactInputGrid}>
                    <TextInput
                      placeholder="애드포스트 RPM"
                      placeholderTextColor="#64748b"
                      value={proAdpostAvgRpm}
                      onChangeText={setProAdpostAvgRpm}
                      keyboardType="numeric"
                      style={[styles.input, styles.compactInput]}
                    />
                    <TextInput
                      placeholder="쿠팡 평균 커미션"
                      placeholderTextColor="#64748b"
                      value={proCoupangAvgCommission}
                      onChangeText={setProCoupangAvgCommission}
                      keyboardType="numeric"
                      style={[styles.input, styles.compactInput]}
                    />
                    <TextInput
                      placeholder="쿠팡 CTR 예: 0.02"
                      placeholderTextColor="#64748b"
                      value={proCoupangCtr}
                      onChangeText={setProCoupangCtr}
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.compactInput]}
                    />
                    <TextInput
                      placeholder="보정 배수"
                      placeholderTextColor="#64748b"
                      value={proRevenueMultiplier}
                      onChangeText={setProRevenueMultiplier}
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.compactInput]}
                    />
                  </View>
                  <View style={styles.inlineActions}>
                    <Pressable
                      style={[styles.secondaryButton, isProBlueprintActionRunning && styles.disabledButton]}
                      onPress={saveProRevenueConfig}
                      disabled={isProBlueprintActionRunning}
                    >
                      <Text style={styles.secondaryButtonText}>수익 설정 저장</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, isProBlueprintActionRunning && styles.disabledButton]}
                      onPress={refreshProRevenueConfig}
                      disabled={isProBlueprintActionRunning}
                    >
                      <Text style={styles.smallButtonText}>RPM 표 조회</Text>
                    </Pressable>
                  </View>
                  {proRevenueConfigResult?.config ? (
                    <Text style={styles.catalogMeta}>
                      PC 저장값 · RPM {formatNumber(proRevenueConfigResult.config.adpostAvgRpm)} · 쿠팡 {proRevenueConfigResult.config.coupangEnabled ? 'ON' : 'OFF'} · 배수 {formatNumber(proRevenueConfigResult.config.customMultiplier)}
                    </Text>
                  ) : null}
                  {proCategoryRpmResult?.table?.length ? (
                    <Text style={styles.catalogMeta}>
                      RPM 상위 {proCategoryRpmResult.table.slice(0, 5).map((item) => `${item.category} ${formatNumber(item.rpm)}`).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.catalogRow}>
                  <Text style={styles.sectionLabel}>PRO 포트폴리오 수익</Text>
                  <TextInput
                    placeholder={'키워드,월조회수,카테고리\n예: 원피스 추천,10000,패션'}
                    placeholderTextColor="#64748b"
                    value={proPortfolioItemsInput}
                    onChangeText={setProPortfolioItemsInput}
                    multiline
                    style={[styles.input, styles.multiLineInput]}
                  />
                  <Pressable
                    style={[styles.secondaryButton, isProBlueprintActionRunning && styles.disabledButton]}
                    onPress={estimateProPortfolioRevenue}
                    disabled={isProBlueprintActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>포트폴리오 수익 추정</Text>
                  </Pressable>
                  {proPortfolioResult?.result ? (
                    <>
                      <View style={styles.scheduleMetricGrid}>
                        <View style={styles.scheduleMetricCell}>
                          <Text style={styles.scheduleMetricValue}>{formatNumber(proPortfolioResult.result.totalMonthly)}</Text>
                          <Text style={styles.scheduleMetricLabel}>월 합계</Text>
                        </View>
                        <View style={styles.scheduleMetricCell}>
                          <Text style={styles.scheduleMetricValue}>{formatNumber(proPortfolioResult.result.totalYearly)}</Text>
                          <Text style={styles.scheduleMetricLabel}>연 합계</Text>
                        </View>
                        <View style={styles.scheduleMetricCell}>
                          <Text style={styles.scheduleMetricValue}>{formatNumber(proPortfolioResult.result.averagePerPost)}</Text>
                          <Text style={styles.scheduleMetricLabel}>글당 평균</Text>
                        </View>
                      </View>
                      {proPortfolioResult.result.topEarners.slice(0, 3).map((item) => (
                        <Text key={item.keyword} style={styles.catalogMeta}>
                          {item.keyword} · 월 {formatNumber(item.revenue)}원
                        </Text>
                      ))}
                    </>
                  ) : null}
                </View>
              </View>
            <View style={styles.apiStatusBox}>
              <View style={styles.progressHeader}>
                <Text style={styles.cardTitle}>PRO 성과 로그</Text>
                <Pressable style={styles.smallButton} onPress={refreshProOutcomes}>
                  <Text style={styles.smallButtonText}>성과 갱신</Text>
                </Pressable>
              </View>
              <Text style={styles.cardText}>
                {proOutcomes
                  ? `측정 ${proOutcomes.measuredPosts}/${proOutcomes.totalRecords}개 · 예측 정확도 ${proOutcomes.benchmark.avgPredictionAccuracy}% · 평균 오차 ${proOutcomes.benchmark.avgRankError}`
                  : 'PC PRO 청사진 성과 로그와 벤치마크를 아직 불러오지 않았습니다.'}
              </Text>
              <View style={styles.catalogRow}>
                <Text style={styles.sectionLabel}>PRO 성과 기록</Text>
                <TextInput
                  placeholder="글 URL"
                  placeholderTextColor="#64748b"
                  value={outcomePostUrl}
                  onChangeText={setOutcomePostUrl}
                  autoCapitalize="none"
                  style={styles.input}
                />
                <TextInput
                  placeholder="키워드"
                  placeholderTextColor="#64748b"
                  value={outcomeKeyword}
                  onChangeText={setOutcomeKeyword}
                  style={styles.input}
                />
                <TextInput
                  placeholder="카테고리"
                  placeholderTextColor="#64748b"
                  value={outcomeCategory}
                  onChangeText={setOutcomeCategory}
                  style={styles.input}
                />
                <View style={styles.compactInputGrid}>
                  <TextInput
                    placeholder="예상 순위"
                    placeholderTextColor="#64748b"
                    value={outcomePredictedRank}
                    onChangeText={setOutcomePredictedRank}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="예상 트래픽"
                    placeholderTextColor="#64748b"
                    value={outcomePredictedTraffic}
                    onChangeText={setOutcomePredictedTraffic}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="실제 순위"
                    placeholderTextColor="#64748b"
                    value={outcomeActualRank}
                    onChangeText={setOutcomeActualRank}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="월 조회수"
                    placeholderTextColor="#64748b"
                    value={outcomeMonthlyViews}
                    onChangeText={setOutcomeMonthlyViews}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="월 수익"
                    placeholderTextColor="#64748b"
                    value={outcomeMonthlyRevenue}
                    onChangeText={setOutcomeMonthlyRevenue}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    placeholder="첫 노출 일수"
                    placeholderTextColor="#64748b"
                    value={outcomeFirstExposureDays}
                    onChangeText={setOutcomeFirstExposureDays}
                    keyboardType="numeric"
                    style={[styles.input, styles.compactInput]}
                  />
                </View>
                <TextInput
                  placeholder="메모"
                  placeholderTextColor="#64748b"
                  value={outcomeNotes}
                  onChangeText={setOutcomeNotes}
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <Pressable
                    style={[styles.secondaryButton, isProOutcomeActionRunning && styles.disabledButton]}
                    onPress={recordProOutcome}
                    disabled={isProOutcomeActionRunning}
                  >
                    <Text style={styles.secondaryButtonText}>성과 기록</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.smallButton, isProOutcomeActionRunning && styles.disabledButton]}
                    onPress={syncProOutcomes}
                    disabled={isProOutcomeActionRunning}
                  >
                    <Text style={styles.smallButtonText}>성과 동기화</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.scheduleMetricGrid}>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{formatNumber(proOutcomes?.benchmark.totalMonthlyViews)}</Text>
                  <Text style={styles.scheduleMetricLabel}>월 조회</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{formatNumber(proOutcomes?.benchmark.totalMonthlyRevenue)}</Text>
                  <Text style={styles.scheduleMetricLabel}>월 수익</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{formatNumber(proOutcomes?.benchmark.avgRevenuePerPost)}</Text>
                  <Text style={styles.scheduleMetricLabel}>글당 수익</Text>
                </View>
                <View style={styles.scheduleMetricCell}>
                  <Text style={styles.scheduleMetricValue}>{formatNumber(proOutcomes?.benchmark.avgRevenuePerView)}</Text>
                  <Text style={styles.scheduleMetricLabel}>RPM</Text>
                </View>
              </View>
              {(proOutcomes?.items || []).slice(0, 4).map((item) => (
                <View key={item.postUrl} style={styles.catalogRow}>
                  <View style={styles.catalogRowHeader}>
                    <Text style={styles.featureBadge}>성과</Text>
                    <Text style={styles.catalogTitle}>{item.keyword}</Text>
                  </View>
                  <Text style={styles.catalogMeta}>
                    예측 {formatRank(item.predictedRank)} · 실제 {formatRank(item.actualRank)} · 오차 {formatNumber(item.rankError)} · 첫 노출 {formatNumber(item.firstExposureDays)}일
                  </Text>
                  <Text style={styles.catalogMeta}>
                    조회 {formatNumber(item.actualMonthlyViews)} · 수익 {formatNumber(item.actualMonthlyRevenue)} · 뷰당 {formatNumber(item.revenuePerView)}
                  </Text>
                  {item.notes ? <Text style={styles.catalogMeta}>{item.notes}</Text> : null}
                  <Pressable
                    style={[styles.scheduleDeleteButton, isProOutcomeActionRunning && styles.disabledButton]}
                    onPress={() => deleteProOutcome(item.postUrl)}
                    disabled={isProOutcomeActionRunning}
                  >
                    <Text style={styles.scheduleDeleteText}>성과 삭제</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            </>
          ) : null}
          {featureTab === 'settings' ? (
            <>
              <View style={styles.apiStatusBox}>
                <View style={styles.progressHeader}>
                  <Text style={styles.cardTitle}>API 상태 진단</Text>
                  <Pressable style={styles.smallButton} onPress={refreshApiStatus}>
                    <Text style={styles.smallButtonText}>진단 갱신</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardText}>
                  {apiStatus
                    ? `${apiDiagnosticStatusLabel(apiStatus.overallStatus)} · 준비 ${apiStatus.summary.ready}/${apiStatus.summary.total} · ${apiStatus.apiBaseUrl || apiUrl}`
                    : 'PC API 키와 모바일 런타임 상태를 아직 불러오지 않았습니다.'}
                </Text>
                {apiStatus ? apiStatus.items.map((item) => (
                  <View key={item.id} style={styles.apiStatusRow}>
                    <View style={styles.catalogRowHeader}>
                      <Text style={[
                        styles.apiStatusPill,
                        item.status === 'ready' && styles.apiStatusReady,
                        item.status === 'partial' && styles.apiStatusPartial,
                        item.status === 'missing' && styles.apiStatusMissing,
                      ]}>
                        {apiDiagnosticStatusLabel(item.status)}
                      </Text>
                      <Text style={styles.catalogTitle}>{item.label}</Text>
                    </View>
                    <Text style={styles.catalogMeta}>
                      keys {item.presentKeys.length}/{item.requiredKeys.length} · affects {item.affects.join(', ')}
                    </Text>
                    {item.missingKeys.length > 0 ? (
                      <Text style={styles.warningText}>missing: {item.missingKeys.join(', ')}</Text>
                    ) : null}
                    <Text style={styles.featureDescription}>{item.recommendation}</Text>
                  </View>
                )) : null}
              </View>
              <View style={styles.apiStatusBox}>
                <Text style={styles.cardTitle}>내보내기/공유</Text>
                <Text style={styles.cardText}>
                  PC 엑셀 내보내기와 같은 키워드 결과를 모바일 공유용 CSV, 텍스트, JSON으로 변환합니다.
                </Text>
                <View style={styles.inlineActions}>
                  <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('csv')}>
                    <Text style={styles.secondaryButtonText}>CSV 공유</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('text')}>
                    <Text style={styles.secondaryButtonText}>텍스트 공유</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('json')}>
                    <Text style={styles.secondaryButtonText}>JSON 공유</Text>
                  </Pressable>
                </View>
                <Text style={styles.catalogMeta}>
                  {lastExportArtifact
                    ? `${lastExportArtifact.filename} · ${lastExportArtifact.itemCount}개 · ${formatNumber(lastExportArtifact.byteLength)} bytes`
                    : '분석 결과가 생기면 공유 파일을 바로 만들 수 있습니다.'}
                </Text>
              </View>
              <View style={styles.apiStatusBox}>
                <View style={styles.progressHeader}>
                  <Text style={styles.cardTitle}>워드프레스 발행 연동</Text>
                  <Pressable style={styles.smallButton} onPress={refreshWordPressPublishing}>
                    <Text style={styles.smallButtonText}>WP 상태 동기화</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardText}>
                  {wordpressPublishing
                    ? `PC 공유 저장소 · 사이트 ${wordpressPublishing.sites.total}개 · 초안 ${wordpressPublishing.drafts.total}개 · ${wordpressPublishing.configured ? '발행 계정 준비' : '사이트 설정 필요'}`
                    : 'PC 공유 저장소의 워드프레스 사이트, 카테고리, 발행 초안 큐를 아직 불러오지 않았습니다.'}
                </Text>
                {wordpressPublishing?.sites.items[0] ? (
                  <Text style={styles.catalogMeta}>
                    {wordpressPublishing.sites.items[0].siteUrl} · {wordpressPublishing.sites.items[0].usernameMasked || '사용자 미지정'} · {wordpressPublishing.sites.items[0].defaultCategoryName || '기본 카테고리 없음'}
                  </Text>
                ) : null}
                <TextInput
                  value={wordpressSiteUrl}
                  onChangeText={setWordpressSiteUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="워드프레스 사이트 URL"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <TextInput
                  value={wordpressUsername}
                  onChangeText={setWordpressUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="워드프레스 사용자명"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <TextInput
                  value={wordpressPassword}
                  onChangeText={setWordpressPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="애플리케이션 비밀번호"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <TextInput
                    value={wordpressCategoryId}
                    onChangeText={setWordpressCategoryId}
                    placeholder="카테고리 ID"
                    placeholderTextColor="#64748b"
                    style={[styles.input, styles.compactInput]}
                  />
                  <TextInput
                    value={wordpressCategoryName}
                    onChangeText={setWordpressCategoryName}
                    placeholder="카테고리명"
                    placeholderTextColor="#64748b"
                    style={[styles.input, styles.compactInput]}
                  />
                </View>
                <TextInput
                  value={wordpressPostStatus}
                  onChangeText={setWordpressPostStatus}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="WP 발행 상태 draft/publish"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <Pressable style={styles.secondaryButton} onPress={saveWordPressSite}>
                    <Text style={styles.secondaryButtonText}>WP 사이트 저장</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={createWordPressDraftFromResult}>
                    <Text style={styles.secondaryButtonText}>WP 초안 등록</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={refreshWordPressCategories}>
                    <Text style={styles.secondaryButtonText}>WP 카테고리 조회</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={publishLatestWordPressDraft}>
                    <Text style={styles.primaryButtonText}>WP REST 전송</Text>
                  </Pressable>
                </View>
                {lastWordPressPublish ? (
                  <Text style={styles.catalogMeta}>
                    WP 전송 결과 · {lastWordPressPublish.postId || '-'} · {lastWordPressPublish.status} · {lastWordPressPublish.postUrl || 'URL 없음'}
                  </Text>
                ) : null}
                {wordpressPublishing?.drafts.items[0] ? (
                  <Text style={styles.catalogMeta}>
                    최근 초안 · {wordpressPublishing.drafts.items[0].title} · {wordpressPublishing.drafts.items[0].status}
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}
          {featureTab === 'schedule' ? (
            <>
              <View style={styles.scheduleDashboardBox}>
                <View style={styles.progressHeader}>
                  <Text style={styles.cardTitle}>스케줄 대시보드</Text>
                  <Pressable style={styles.smallButton} onPress={refreshScheduleDashboard}>
                    <Text style={styles.smallButtonText}>스케줄 갱신</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardText}>
                  {scheduleDashboard
                    ? `PC 예약 ${scheduleDashboard.schedules.total}개 · 다음 ${formatDateTime(scheduleDashboard.schedules.nextRunAt)}`
                    : 'PC 예약/알림/최근 활동 상태를 아직 불러오지 않았습니다.'}
                </Text>
                <View style={styles.scheduleMetricGrid}>
                  <View style={styles.scheduleMetricCell}>
                    <Text style={styles.scheduleMetricValue}>{scheduleDashboard?.schedules.pending ?? '-'}</Text>
                    <Text style={styles.scheduleMetricLabel}>대기</Text>
                  </View>
                  <View style={styles.scheduleMetricCell}>
                    <Text style={styles.scheduleMetricValue}>{scheduleDashboard?.schedules.completed ?? '-'}</Text>
                    <Text style={styles.scheduleMetricLabel}>완료</Text>
                  </View>
                  <View style={styles.scheduleMetricCell}>
                    <Text style={styles.scheduleMetricValue}>{scheduleDashboard?.schedules.failed ?? '-'}</Text>
                    <Text style={styles.scheduleMetricLabel}>실패</Text>
                  </View>
                  <View style={styles.scheduleMetricCell}>
                    <Text style={styles.scheduleMetricValue}>{scheduleDashboard?.notifications.keywordCount ?? '-'}</Text>
                    <Text style={styles.scheduleMetricLabel}>알림 키워드</Text>
                  </View>
                </View>
                <Text style={styles.catalogMeta}>
                  알림 {scheduleDashboard?.notifications.enabled ? 'ON' : 'OFF'} · 분석 이력 {scheduleDashboard?.keywords.totalAnalyzed ?? '-'} · 그룹 {scheduleDashboard?.groups.total ?? '-'}
                </Text>
                <TextInput
                  value={scheduleDateTime}
                  onChangeText={setScheduleDateTime}
                  placeholder="예약 시각 예: 2026-06-09 09:30"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={editingScheduleId ? saveScheduleDetails : createScheduleFromSeed}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {editingScheduleId ? '예약 상세 저장' : '현재 키워드 예약'}
                    </Text>
                  </Pressable>
                  {editingScheduleId ? (
                    <Pressable style={styles.secondaryButton} onPress={cancelScheduleEdit}>
                      <Text style={styles.secondaryButtonText}>편집 취소</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={styles.secondaryButton} onPress={refreshScheduleDashboard}>
                    <Text style={styles.secondaryButtonText}>PC 예약 동기화</Text>
                  </Pressable>
                </View>
                {(scheduleDashboard?.schedules.items || []).slice(0, 4).map((item) => (
                  <View
                    key={item.id}
                    style={styles.scheduleRow}
                  >
                    <View style={styles.scheduleRowBody}>
                      <Pressable
                        style={styles.scheduleInfo}
                        onPress={() => {
                          if (item.keyword) setSeedKeyword(item.keyword);
                          setMode('analysis');
                        }}
                      >
                        <View style={styles.scheduleRowTop}>
                          <Text style={styles.scheduleKeyword}>{item.keyword}</Text>
                          <Text style={[
                            styles.scheduleStatusPill,
                            item.status === 'pending' && styles.scheduleStatusPending,
                            item.status === 'completed' && styles.scheduleStatusCompleted,
                            item.status === 'failed' && styles.scheduleStatusFailed,
                            item.status === 'cancelled' && styles.scheduleStatusCancelled,
                          ]}>
                            {item.status}
                          </Text>
                        </View>
                        <Text style={styles.keywordGroupKeywords}>
                          {formatDateTime(item.scheduleDateTime)} · {item.platform} · {item.keywords.slice(0, 3).join(', ')}
                        </Text>
                      </Pressable>
                      <View style={styles.scheduleActionColumn}>
                        <Pressable
                          style={[styles.scheduleToggleButton, !item.enabled && styles.scheduleToggleOnButton]}
                          onPress={() => toggleSchedule(item.id, !item.enabled)}
                        >
                          <Text style={styles.scheduleToggleText}>{item.enabled ? '비활성' : '활성'}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.scheduleEditButton}
                          onPress={() => startScheduleEdit(item)}
                        >
                          <Text style={styles.scheduleToggleText}>편집</Text>
                        </Pressable>
                        <Pressable
                          style={styles.scheduleDeleteButton}
                          onPress={() => deleteSchedule(item.id)}
                        >
                          <Text style={styles.scheduleDeleteText}>삭제</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.keywordGroupBox}>
                <View style={styles.progressHeader}>
                  <Text style={styles.cardTitle}>키워드 그룹</Text>
                  <Pressable style={styles.smallButton} onPress={refreshKeywordGroups}>
                    <Text style={styles.smallButtonText}>그룹 갱신</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardText}>
                  {keywordGroups
                    ? `PC 저장소 ${keywordGroups.total}개 · ${keywordGroups.storage}`
                    : 'PC 키워드 그룹 저장소를 아직 불러오지 않았습니다.'}
                </Text>
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder="새 그룹 이름"
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
                <View style={styles.inlineActions}>
                  <Pressable style={styles.secondaryButton} onPress={createKeywordGroupFromSeed}>
                    <Text style={styles.secondaryButtonText}>현재 키워드로 등록</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={refreshKeywordGroups}>
                    <Text style={styles.secondaryButtonText}>PC 그룹 동기화</Text>
                  </Pressable>
                </View>
                {(keywordGroups?.groups || []).slice(0, 6).map((group) => (
                  <View key={group.id} style={styles.keywordGroupRow}>
                    <Pressable
                      style={styles.keywordGroupInfo}
                      onPress={() => {
                        if (group.keywords[0]) setSeedKeyword(group.keywords[0]);
                        setMode('analysis');
                      }}
                    >
                      <Text style={styles.keywordGroupName}>{group.name}</Text>
                      <Text style={styles.keywordGroupKeywords}>
                        {group.keywordCount}개 · {group.keywords.slice(0, 3).join(', ') || '키워드 없음'}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.groupDeleteButton} onPress={() => removeKeywordGroup(group.id)}>
                      <Text style={styles.groupDeleteText}>삭제</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}
          {selectedFeatures.map((item) => (
            <Pressable
              key={item.id}
              style={styles.featureCard}
              onPress={() => selectPcFeature(item)}
            >
              <View style={styles.featureCardHeader}>
                <Text style={styles.featureBadge}>{item.badge}</Text>
                <Text style={styles.featureTitle}>{item.title}</Text>
              </View>
              <Text style={styles.featureDescription}>{item.description}</Text>
              <Text style={[
                styles.featureStatus,
                item.status === 'ready' && styles.featureStatusReady,
                item.status === 'linked' && styles.featureStatusLinked,
              ]}>
                {item.status === 'ready' ? '모바일 실행 가능' : item.status === 'linked' ? 'PC 연동 보기' : 'PC 기능 정리됨'}
              </Text>
            </Pressable>
          ))}
          {selectedCatalogItems.slice(0, 14).map((item) => (
            <View key={item.id} style={styles.catalogRow}>
              <View style={styles.catalogRowHeader}>
                <Text style={[
                  styles.catalogStatus,
                  item.status === 'ready' && styles.catalogStatusReady,
                  item.status === 'linked' && styles.catalogStatusLinked,
                  item.status === 'pc-only' && styles.catalogStatusPcOnly,
                ]}>
                  {catalogStatusLabel(item)}
                </Text>
                <Text style={styles.catalogTitle}>{item.title}</Text>
              </View>
              <Text style={styles.catalogMeta}>
                {item.module} · {item.handler}{item.mobileRoute ? ` · ${item.mobileRoute}` : ''}
              </Text>
            </View>
          ))}
          {selectedCatalogItems.length > 14 ? (
            <Text style={styles.catalogMoreText}>
              이 탭의 PC 기능 {selectedCatalogItems.length - 14}개는 다음 단계에서 이어서 연결합니다.
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.quickBox}>
        <Text style={styles.cardTitle}>선택 기능 실행</Text>
        <Text style={styles.cardText}>
          {selectedCategory.label} · {selectedMode.title} · {targetText}
        </Text>
        {mode === 'golden' ? (
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentButton, goldenRunMode === 'precision' && styles.segmentButtonActive]}
              onPress={() => setGoldenRunMode('precision')}
              disabled={isRunning}
            >
              <Text style={[styles.segmentText, goldenRunMode === 'precision' && styles.segmentTextActive]}>
                정밀 30
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentButton, goldenRunMode === 'bulk' && styles.segmentButtonActive]}
              onPress={() => setGoldenRunMode('bulk')}
              disabled={isRunning}
            >
              <Text style={[styles.segmentText, goldenRunMode === 'bulk' && styles.segmentTextActive]}>
                대량 60
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.modeGrid}>
          {MODES.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.modeButton, mode === item.id && styles.modeButtonActive]}
              onPress={() => setMode(item.id)}
              disabled={isRunning}
            >
              <Text style={[styles.modeLabel, mode === item.id && styles.modeLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <Pressable
              key={category.id}
              style={[styles.categoryChip, categoryId === category.id && styles.categoryChipActive]}
              onPress={() => setCategoryId(category.id)}
              disabled={isRunning}
            >
              <Text style={[styles.categoryText, categoryId === category.id && styles.categoryTextActive]}>
                {category.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={seedKeyword}
          onChangeText={setSeedKeyword}
          placeholder={modeSeedPlaceholder(mode)}
          placeholderTextColor="#64748b"
          style={styles.input}
          editable={!isRunning}
        />
        <Pressable
          style={[styles.primaryButton, isRunning && styles.disabledButton]}
          onPress={startJob}
          disabled={isRunning}
        >
          <Text style={styles.primaryButtonText}>{selectedMode.title} 시작</Text>
        </Pressable>
      </View>

      <View style={styles.prewarmBox}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>서버 추천</Text>
          <Text style={styles.counterText}>
            {prewarm ? `${prewarm.completed + prewarm.cacheHits}/${prewarm.targets.length}` : '-'}
          </Text>
        </View>
        <Text style={styles.cardText}>PC가 미리 찾은 후보와 실시간 황금키워드를 모바일에서 바로 확인합니다.</Text>
        <View style={styles.liveGoldenStatus}>
          <View style={[styles.progressPulse, !liveGolden?.running && styles.liveGoldenIdlePulse]} />
          <View style={styles.liveGoldenStatusBody}>
            <Text style={styles.pushStatusText}>
              {liveGolden?.running ? '실시간 황금 발굴 중' : liveGolden?.enabled ? '실시간 황금 발굴 대기' : '실시간 황금 발굴 꺼짐'}
            </Text>
            <Text style={styles.metricText}>
              {liveGolden
                ? `발행 ${liveGolden.publishedCount}개 · 주기 ${Math.round(liveGolden.intervalMs / 60000)}분 · 다음 ${liveGolden.nextCategoryId}`
                : 'PC 서버가 켜지면 저부하로 자동 발굴을 준비합니다.'}
            </Text>
          </View>
        </View>
        <View style={styles.inlineActions}>
          <Pressable style={styles.secondaryButton} onPress={refreshPrewarm}>
            <Text style={styles.secondaryButtonText}>예열 상태</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={refreshLiveGolden}>
            <Text style={styles.secondaryButtonText}>라이브 상태</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={runLiveGoldenNow}>
            <Text style={styles.secondaryButtonText}>지금 1회</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={refreshNotifications}>
            <Text style={styles.secondaryButtonText}>인박스</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, isRegisteringPush && styles.disabledButton]}
            onPress={pushSubscription ? unregisterPushNotifications : registerPushNotifications}
            disabled={isRegisteringPush}
          >
            <Text style={styles.secondaryButtonText}>{pushSubscription ? '푸시 해제' : '푸시 등록'}</Text>
          </Pressable>
        </View>
        <Text style={styles.pushStatusText}>
          {pushSubscription ? `등록됨: ${pushSubscription.platform}` : pushStatus}
        </Text>
        {notifications ? (
          <View style={styles.notificationList}>
            {notifications.items.slice(0, 5).map((item) => (
              <Pressable
                key={item.id}
                style={[styles.notificationRow, item.read && styles.notificationRowRead]}
                onPress={() => markNotificationRead(item.id)}
              >
                <View style={styles.notificationHeader}>
                  <Text style={styles.gradePill}>{item.grade}</Text>
                  <Text style={styles.notificationKeyword}>{item.keyword}</Text>
                </View>
                <Text style={styles.resultEvidence}>{item.title}</Text>
                <View style={styles.metricRow}>
                  <Text style={styles.metricText}>검색 {formatNumber(item.totalSearchVolume)}</Text>
                  <Text style={styles.metricText}>문서 {formatNumber(item.documentCount)}</Text>
                  <Text style={styles.metricText}>비율 {item.goldenRatio ?? '-'}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {job ? (
        <View style={styles.progressBox}>
          <View style={styles.progressHeader}>
            <View style={styles.progressState}>
              {isRunning ? <View style={styles.progressPulse} /> : null}
              <Text style={styles.progressTitle}>{summarizeJob(job)}</Text>
            </View>
            <Text style={styles.counterText}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressMessage}>{job.progressMessage}</Text>
          {isRunning ? (
            <Pressable style={styles.secondaryButton} onPress={cancelJob}>
              <Text style={styles.secondaryButtonText}>취소</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>결과 {result.summary.total}개</Text>
          <Text style={styles.resultMeta}>
            SSS {result.summary.sss} · 측정 {result.summary.measured} · {result.summary.elapsedMs}ms
          </Text>
          <View style={styles.inlineActions}>
            <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('csv')}>
              <Text style={styles.secondaryButtonText}>CSV 공유</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('text')}>
              <Text style={styles.secondaryButtonText}>텍스트 공유</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => shareKeywordExport('json')}>
              <Text style={styles.secondaryButtonText}>JSON 공유</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {resultItems.map((item, index) => (
        <View key={`${item.keyword}-${index}`} style={styles.resultCard}>
          <View style={styles.resultCardHeader}>
            <Text style={styles.gradePill}>{item.grade}</Text>
            <Text style={styles.resultKeyword}>{item.keyword}</Text>
          </View>
          <Text style={styles.resultEvidence}>{evidenceTitle(item)}</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricText}>검색 {formatNumber(item.totalSearchVolume)}</Text>
            <Text style={styles.metricText}>문서 {formatNumber(item.documentCount)}</Text>
            <Text style={styles.metricText}>비율 {item.goldenRatio ?? '-'}</Text>
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Pressable style={styles.footerLink} onPress={openPrivacyPolicy}>
          <Text style={styles.footerLinkText}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.footerText}>
          LEWORD Mobile은 키워드 작업과 푸시 토큰을 LEWORD API로 전송해 분석 결과와 알림을 제공합니다.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 14,
  },
  header: {
    gap: 8,
    paddingTop: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  kicker: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  linkBadge: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    color: '#cbd5e1',
    textAlignVertical: 'center',
    fontSize: 12,
    fontWeight: '900',
  },
  linkBadgeOn: {
    backgroundColor: '#064e3b',
    color: '#d1fae5',
  },
  title: {
    color: '#f8fafc',
    fontSize: 27,
    fontWeight: '900',
    lineHeight: 34,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 21,
  },
  loginBox: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dashboardBox: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#171a12',
    borderWidth: 1,
    borderColor: '#b88a1f',
  },
  quickBox: {
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#101827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pcWorkspace: {
    minHeight: 360,
    flexDirection: 'row',
    gap: 10,
  },
  leftRail: {
    width: 76,
    gap: 8,
  },
  railTab: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#121a12',
    borderWidth: 1,
    borderColor: '#2f3b24',
  },
  railTabActive: {
    backgroundColor: '#facc15',
    borderColor: '#fde047',
  },
  railTabText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '900',
  },
  railTabTextActive: {
    color: '#1a1a0b',
  },
  featurePanel: {
    flex: 1,
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0f1720',
    borderWidth: 1,
    borderColor: '#365314',
  },
  featurePanelTitle: {
    color: '#fef3c7',
    fontSize: 20,
    fontWeight: '900',
  },
  featurePanelText: {
    color: '#bbf7d0',
    fontSize: 12,
    lineHeight: 18,
  },
  catalogSummary: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#17210d',
    borderWidth: 1,
    borderColor: '#4d7c0f',
  },
  catalogSummaryText: {
    color: '#ecfccb',
    fontSize: 12,
    fontWeight: '900',
  },
  catalogEmptyText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  featureCard: {
    gap: 7,
    padding: 11,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#2f3b24',
  },
  featureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureBadge: {
    minWidth: 44,
    minHeight: 36,
    paddingHorizontal: 7,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 8,
    backgroundColor: '#365314',
    color: '#ecfccb',
    fontSize: 11,
    fontWeight: '900',
  },
  featureTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
  },
  featureDescription: {
    color: '#a7b68d',
    fontSize: 12,
    lineHeight: 17,
  },
  featureStatus: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '900',
  },
  featureStatusReady: {
    color: '#bef264',
  },
  featureStatusLinked: {
    color: '#fde047',
  },
  proBlueprintBox: {
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#171809',
    borderWidth: 1,
    borderColor: '#facc15',
  },
  apiStatusBox: {
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#102015',
    borderWidth: 1,
    borderColor: '#84cc16',
  },
  apiStatusRow: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#263244',
  },
  apiStatusPill: {
    minWidth: 70,
    minHeight: 36,
    paddingHorizontal: 7,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 8,
    backgroundColor: '#1f2937',
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '900',
  },
  apiStatusReady: {
    backgroundColor: '#166534',
    color: '#dcfce7',
  },
  apiStatusPartial: {
    backgroundColor: '#713f12',
    color: '#fef3c7',
  },
  apiStatusMissing: {
    backgroundColor: '#7f1d1d',
    color: '#fee2e2',
  },
  scheduleDashboardBox: {
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#171809',
    borderWidth: 1,
    borderColor: '#facc15',
  },
  scheduleMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scheduleMetricCell: {
    flexBasis: '45%',
    flexGrow: 1,
    minHeight: 56,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  scheduleMetricValue: {
    color: '#fef08a',
    fontSize: 18,
    fontWeight: '900',
  },
  scheduleMetricLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  scheduleRow: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#253244',
  },
  scheduleRowBody: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  scheduleInfo: {
    flex: 1,
    gap: 6,
    minHeight: 48,
    justifyContent: 'center',
  },
  scheduleRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scheduleKeyword: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
  },
  scheduleStatusPill: {
    minWidth: 74,
    minHeight: 36,
    paddingHorizontal: 7,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 8,
    backgroundColor: '#1f2937',
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '900',
  },
  scheduleStatusPending: {
    backgroundColor: '#1d4ed8',
    color: '#dbeafe',
  },
  scheduleStatusCompleted: {
    backgroundColor: '#166534',
    color: '#dcfce7',
  },
  scheduleStatusFailed: {
    backgroundColor: '#7f1d1d',
    color: '#fee2e2',
  },
  scheduleStatusCancelled: {
    backgroundColor: '#374151',
    color: '#d1d5db',
  },
  scheduleToggleButton: {
    minWidth: 58,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2a1720',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  scheduleToggleOnButton: {
    backgroundColor: '#102015',
    borderColor: '#84cc16',
  },
  scheduleToggleText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
  },
  scheduleActionColumn: {
    width: 64,
    gap: 6,
  },
  scheduleEditButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#172033',
    borderWidth: 1,
    borderColor: '#475569',
  },
  scheduleDeleteButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2a1720',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  scheduleDeleteText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '900',
  },
  keywordGroupBox: {
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#101d12',
    borderWidth: 1,
    borderColor: '#a3e635',
  },
  keywordGroupRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#253244',
  },
  keywordGroupInfo: {
    flex: 1,
    gap: 5,
    minHeight: 48,
    justifyContent: 'center',
  },
  keywordGroupName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  keywordGroupKeywords: {
    color: '#a7b68d',
    fontSize: 12,
    lineHeight: 17,
  },
  groupDeleteButton: {
    minWidth: 54,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2a1720',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  groupDeleteText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '900',
  },
  catalogRow: {
    gap: 5,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#253244',
  },
  catalogRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catalogStatus: {
    minWidth: 38,
    minHeight: 36,
    paddingHorizontal: 6,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 8,
    backgroundColor: '#1f2937',
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '900',
  },
  catalogStatusReady: {
    backgroundColor: '#365314',
    color: '#ecfccb',
  },
  catalogStatusLinked: {
    backgroundColor: '#713f12',
    color: '#fef3c7',
  },
  catalogStatusPcOnly: {
    backgroundColor: '#263244',
    color: '#94a3b8',
  },
  catalogTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '900',
  },
  catalogMeta: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  catalogMoreText: {
    color: '#fde047',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  advancedBox: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#263244',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '900',
  },
  cardText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
    color: '#f8fafc',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  multiLineInput: {
    minHeight: 108,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  compactInput: {
    flexGrow: 1,
    flexBasis: 140,
  },
  compactInputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#a3e635',
  },
  primaryButtonText: {
    color: '#18230b',
    fontSize: 18,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#475569',
  },
  secondaryButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '900',
  },
  smallButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#1f2937',
  },
  smallButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.55,
  },
  statusText: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '800',
  },
  warningText: {
    color: '#fbbf24',
    fontSize: 12,
    lineHeight: 18,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#182235',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButtonActive: {
    backgroundColor: '#713f12',
    borderColor: '#facc15',
  },
  tabText: {
    color: '#cbd5e1',
    fontWeight: '900',
  },
  tabTextActive: {
    color: '#fef3c7',
  },
  signalRow: {
    minHeight: 76,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#263244',
  },
  signalRank: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#4d7c0f',
  },
  signalRankText: {
    color: '#ecfccb',
    fontSize: 12,
    fontWeight: '900',
  },
  signalBody: {
    flex: 1,
    gap: 3,
  },
  signalKeyword: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  signalTitle: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '800',
  },
  signalDescription: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentedRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#111827',
  },
  segmentButtonActive: {
    backgroundColor: '#84cc16',
  },
  segmentText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '900',
  },
  segmentTextActive: {
    color: '#111827',
  },
  modeButton: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#263244',
  },
  modeButtonActive: {
    backgroundColor: '#365314',
    borderColor: '#a3e635',
  },
  modeLabel: {
    color: '#94a3b8',
    fontWeight: '900',
  },
  modeLabelActive: {
    color: '#dcfce7',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    minHeight: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#182235',
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryChipActive: {
    backgroundColor: '#064e3b',
    borderColor: '#a3e635',
  },
  categoryText: {
    color: '#cbd5e1',
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#d1fae5',
  },
  prewarmBox: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#10201b',
    borderWidth: 1,
    borderColor: '#1f6f4a',
  },
  notificationList: {
    gap: 8,
  },
  notificationRow: {
    gap: 7,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1f6f4a',
  },
  notificationRowRead: {
    opacity: 0.62,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationKeyword: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '900',
  },
  pushStatusText: {
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '800',
  },
  liveGoldenStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#365314',
  },
  liveGoldenStatusBody: {
    flex: 1,
    gap: 3,
  },
  liveGoldenIdlePulse: {
    backgroundColor: '#64748b',
  },
  progressBox: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#172033',
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  progressState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
  },
  progressTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  counterText: {
    color: '#c4b5fd',
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  progressMessage: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#4c1d1d',
    borderWidth: 1,
    borderColor: '#991b1b',
    color: '#fecaca',
    fontSize: 14,
    lineHeight: 21,
  },
  resultHeader: {
    gap: 4,
    paddingTop: 4,
  },
  resultTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '900',
  },
  resultMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  resultCard: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
  },
  resultCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  gradePill: {
    minWidth: 38,
    minHeight: 36,
    paddingHorizontal: 8,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
    color: '#dbeafe',
    fontSize: 12,
    fontWeight: '900',
  },
  resultKeyword: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
  },
  resultEvidence: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    gap: 10,
    paddingVertical: 14,
  },
  footerLink: {
    minHeight: 40,
    justifyContent: 'center',
  },
  footerLinkText: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '900',
  },
  footerText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
});
