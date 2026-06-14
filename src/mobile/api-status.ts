import type { EnvConfig } from '../utils/environment-manager';
import type {
  MobileApiDiagnosticId,
  MobileApiDiagnosticItem,
  MobileApiDiagnosticStatus,
  MobileApiKeyPresence,
  MobileApiStatusSnapshot,
} from './contracts';
import {
  getMobileRuntimeReadiness,
  type MobileRuntimeReadinessReport,
} from './runtime-readiness';

type EnvLike = Partial<EnvConfig> & Record<string, string | number | boolean | undefined>;

interface DiagnosticSpec {
  id: MobileApiDiagnosticId;
  label: string;
  requiredForMobileResults: boolean;
  keys: Array<{
    name: string;
    aliases: string[];
  }>;
  affects: string[];
  readyRecommendation: string;
  missingRecommendation: string;
}

export interface MobileApiStatusOptions {
  apiBaseUrl?: string;
  env?: EnvLike;
  runtime?: MobileRuntimeReadinessReport;
  now?: () => Date;
}

const DIAGNOSTICS: DiagnosticSpec[] = [
  {
    id: 'naver-openapi',
    label: 'Naver Open API',
    requiredForMobileResults: true,
    keys: [
      { name: 'naverClientId', aliases: ['naverClientId', 'NAVER_CLIENT_ID'] },
      { name: 'naverClientSecret', aliases: ['naverClientSecret', 'NAVER_CLIENT_SECRET'] },
    ],
    affects: ['document-count', 'autocomplete', 'competition-analysis', 'mindmap-expansion'],
    readyRecommendation: '문서수, 자동완성, 경쟁 분석을 PC와 같은 기준으로 측정할 수 있습니다.',
    missingRecommendation: '문서수와 자동완성 기반 분석이 약해집니다. PC 환경설정에서 Naver Client ID/Secret을 연결하세요.',
  },
  {
    id: 'naver-searchad',
    label: 'Naver SearchAd',
    requiredForMobileResults: true,
    keys: [
      { name: 'naverSearchAdAccessLicense', aliases: ['naverSearchAdAccessLicense', 'NAVER_SEARCH_AD_ACCESS_LICENSE', 'NAVER_SEARCHAD_ACCESS_LICENSE'] },
      { name: 'naverSearchAdSecretKey', aliases: ['naverSearchAdSecretKey', 'NAVER_SEARCH_AD_SECRET_KEY', 'NAVER_SEARCHAD_SECRET_KEY'] },
      { name: 'naverSearchAdCustomerId', aliases: ['naverSearchAdCustomerId', 'NAVER_SEARCH_AD_CUSTOMER_ID', 'NAVER_SEARCHAD_CUSTOMER_ID'] },
    ],
    affects: ['search-volume', 'pc-mobile-volume', 'cpc', 'golden-ratio', 'pro-hunter'],
    readyRecommendation: '검색량, PC/모바일 검색량, CPC, 황금비율을 PC와 같은 기준으로 측정할 수 있습니다.',
    missingRecommendation: '검색량과 CPC가 비거나 추정치로 떨어질 수 있습니다. Access License, Secret Key, Customer ID를 모두 연결하세요.',
  },
  {
    id: 'youtube',
    label: 'YouTube Data API',
    requiredForMobileResults: false,
    keys: [
      { name: 'youtubeApiKey', aliases: ['youtubeApiKey', 'YOUTUBE_API_KEY'] },
    ],
    affects: ['youtube-trends', 'issue-seeds'],
    readyRecommendation: '유튜브 트렌드 기반 이슈 시드를 함께 볼 수 있습니다.',
    missingRecommendation: '유튜브 트렌드 시드는 제한됩니다. 일반 키워드 분석은 계속 사용할 수 있습니다.',
  },
  {
    id: 'google-cse',
    label: 'Google CSE',
    requiredForMobileResults: false,
    keys: [
      { name: 'googleApiKey', aliases: ['googleApiKey', 'googleCseKey', 'GOOGLE_API_KEY', 'GOOGLE_CSE_KEY'] },
      { name: 'googleCseId', aliases: ['googleCseId', 'googleCseCx', 'GOOGLE_CSE_ID', 'GOOGLE_CSE_CX'] },
    ],
    affects: ['serp-cross-check', 'content-gap'],
    readyRecommendation: 'SERP 교차 검증과 콘텐츠 갭 분석을 확장할 수 있습니다.',
    missingRecommendation: 'Google SERP 교차 검증은 제한됩니다. 네이버 기반 분석은 계속 사용할 수 있습니다.',
  },
  {
    id: 'ai',
    label: 'AI 보강',
    requiredForMobileResults: false,
    keys: [
      { name: 'anthropicApiKey', aliases: ['anthropicApiKey', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] },
      { name: 'geminiApiKey', aliases: ['geminiApiKey', 'GEMINI_API_KEY', 'GEMINI_KEY'] },
      { name: 'manusApiKey', aliases: ['manusApiKey', 'MANUS_API_KEY'] },
      { name: 'openaiApiKey', aliases: ['openaiApiKey', 'OPENAI_API_KEY'] },
    ],
    affects: ['intent-summary', 'content-gap', 'pro-enrichment'],
    readyRecommendation: '의도 요약, 콘텐츠 갭, PRO 보강 설명이 더 풍부해집니다.',
    missingRecommendation: 'AI 설명 보강은 줄어들지만 데이터 기반 점수 계산은 유지됩니다.',
  },
];

function loadDefaultEnv(): EnvLike {
  try {
    const { EnvironmentManager } = require('../utils/environment-manager');
    return EnvironmentManager.getInstance().getConfig() || {};
  } catch {
    return process.env as EnvLike;
  }
}

function readValue(env: EnvLike, aliases: string[]): string {
  for (const alias of aliases) {
    const value = env[alias];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

function keyPresence(env: EnvLike, spec: DiagnosticSpec['keys'][number]): MobileApiKeyPresence {
  const value = readValue(env, spec.aliases);
  return {
    name: spec.name,
    present: value.length > 0,
    length: value.length,
  };
}

function statusFromKeys(keys: MobileApiKeyPresence[]): MobileApiDiagnosticStatus {
  const present = keys.filter((item) => item.present).length;
  if (present === keys.length) return 'ready';
  if (present > 0) return 'partial';
  return 'missing';
}

function buildItem(env: EnvLike, spec: DiagnosticSpec): MobileApiDiagnosticItem {
  const keys = spec.keys.map((item) => keyPresence(env, item));
  const status = statusFromKeys(keys);

  return {
    id: spec.id,
    label: spec.label,
    status,
    requiredForMobileResults: spec.requiredForMobileResults,
    requiredKeys: keys.map((item) => item.name),
    presentKeys: keys.filter((item) => item.present).map((item) => item.name),
    missingKeys: keys.filter((item) => !item.present).map((item) => item.name),
    keyPresence: keys,
    affects: spec.affects,
    recommendation: status === 'ready'
      ? spec.readyRecommendation
      : spec.missingRecommendation,
  };
}

function addRuntimeItem(
  items: MobileApiDiagnosticItem[],
  runtime: MobileRuntimeReadinessReport,
): MobileApiDiagnosticItem[] {
  const status: MobileApiDiagnosticStatus = runtime.ok
    ? 'ready'
    : runtime.summary.failedRequired > 0 ? 'partial' : 'ready';

  return [
    ...items,
    {
      id: 'mobile-runtime',
      label: 'Mobile API Runtime',
      status,
      requiredForMobileResults: true,
      requiredKeys: ['guardrails', 'entitlement', 'prewarm', 'push', 'cache'],
      presentKeys: runtime.checks.filter((item) => item.ok).map((item) => item.name),
      missingKeys: runtime.blockers.map((item) => item.name),
      keyPresence: [],
      affects: ['server-health', 'prewarm', 'push', 'cache', 'entitlement'],
      recommendation: runtime.ok
        ? '모바일 API 서버 런타임이 배포 기준을 만족합니다.'
        : '로컬 테스트는 가능하지만 공개 배포 전 런타임 필수 항목을 채워야 합니다.',
    },
  ];
}

function summarize(items: MobileApiDiagnosticItem[]): MobileApiStatusSnapshot['summary'] {
  return {
    total: items.length,
    ready: items.filter((item) => item.status === 'ready').length,
    partial: items.filter((item) => item.status === 'partial').length,
    missing: items.filter((item) => item.status === 'missing').length,
  };
}

function overallStatus(items: MobileApiDiagnosticItem[]): MobileApiDiagnosticStatus {
  const required = items.filter((item) => item.requiredForMobileResults);
  if (required.every((item) => item.status === 'missing')) return 'missing';
  if (required.some((item) => item.status !== 'ready')) return 'partial';
  return 'ready';
}

export function buildMobileApiStatusSnapshot(
  options: MobileApiStatusOptions = {},
): MobileApiStatusSnapshot {
  const env = options.env || loadDefaultEnv();
  const now = options.now || (() => new Date());
  const runtime = options.runtime || getMobileRuntimeReadiness({ env: env as Record<string, string | undefined>, now });
  const baseItems = DIAGNOSTICS.map((spec) => buildItem(env, spec));
  const items = addRuntimeItem(baseItems, runtime);

  return {
    updatedAt: now().toISOString(),
    apiBaseUrl: (options.apiBaseUrl || '').replace(/\/+$/, ''),
    overallStatus: overallStatus(items),
    summary: summarize(items),
    items,
    runtime: {
      ok: runtime.ok,
      failedRequired: runtime.summary.failedRequired,
      failedRecommended: runtime.summary.failedRecommended,
    },
  };
}
