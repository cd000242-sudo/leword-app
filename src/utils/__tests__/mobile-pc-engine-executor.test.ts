import { createMobilePcEngineExecutor } from '../../mobile/pc-engine-executor';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MobileJobEnvelope,
  MobileKeywordMetric,
  MobileKeywordResult,
} from '../../mobile/contracts';
import {
  getNaverBlogOpenApiQuotaBlockedUntil,
  getNaverBlogOpenApiCredentials,
  isNaverBlogOpenApiQuotaBlocked,
  isNaverBlogOpenApiQuotaExceededText,
  isNaverBlogOpenApiRateLimitedText,
  markNaverBlogOpenApiQuotaBlocked,
  selectNaverBlogOpenApiCredential,
} from '../naver-blog-api';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function makeJob(product: any, params: any): MobileJobEnvelope<any, MobileKeywordResult> {
  const now = new Date().toISOString();
  return {
    id: `job_${product}`,
    product,
    state: 'running',
    params,
    progressPercent: 1,
    progressMessage: 'test',
    createdAt: now,
    updatedAt: now,
  };
}

function makeSssMetric(index: number, prefix = '모바일 검증 키워드'): MobileKeywordMetric {
  const searchVolume = 1000 + index * 10;
  const documentCount = 100 + index;
  return {
    keyword: `${prefix} ${index}`,
    grade: 'SSS',
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: searchVolume,
    documentCount,
    goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
    cpc: 120,
    category: 'policy',
    source: 'fixture-pc-engine',
    intent: 'test',
    evidence: ['pc-engine-fixture'],
    isMeasured: true,
  };
}

function makeSssResult(count: number, prefix?: string): MobileKeywordResult {
  const keywords = Array.from({ length: count }, (_value, index) => makeSssMetric(index + 1, prefix));
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: keywords.length,
      measured: keywords.length,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
}

async function measureFixtureMetrics(metrics: MobileKeywordMetric[]): Promise<MobileKeywordMetric[]> {
  return metrics.map((metric, index) => {
    const totalSearchVolume = 1200 + index * 50;
    const pcSearchVolume = Math.floor(totalSearchVolume * 0.4);
    const mobileSearchVolume = totalSearchVolume - pcSearchVolume;
    const documentCount = 120 + index;
    return {
      ...metric,
      grade: 'SSS',
      pcSearchVolume,
      mobileSearchVolume,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
      cpc: 150,
      evidence: [
        ...metric.evidence,
        'fixture-searchad-volume',
        'fixture-naver-blog-document-count',
      ],
      isMeasured: true,
    };
  });
}

async function runKeywordAnalysis(): Promise<void> {
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      context.progress(84, 'fixture measured keyword metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('keyword-analysis', {
    keyword: '고유가 지원금 2차',
    maxRelatedCount: 10,
    includeMindmapPreview: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('keyword analysis does not synthesize related rows when live source has no candidates',
    result.keywords.length === 1,
    result.keywords.map((item) => `${item.keyword}:${item.source}`).join('|'));
  assert('keyword analysis keeps requested keyword as first measured row',
    result.keywords[0]?.keyword === '고유가 지원금 2차'
      && result.keywords[0]?.source === 'pc-keyword-analysis-exact'
      && result.keywords[0]?.documentCount !== null,
    result.keywords.slice(0, 3).map((item) => `${item.keyword}:${item.source}:${item.documentCount}`).join('|'));
  assert('keyword analysis keeps Korean candidate text clean',
    result.keywords.every((item) => !/[?]{2,}/.test(item.keyword)));
  assert('keyword analysis uses PC ranker evidence',
    result.keywords.every((item) => item.evidence.some((evidence) => evidence.includes('pc-keyword-expansion-ranker'))));
  assert('keyword analysis returns measured metrics',
    result.summary.measured === 1
      && result.keywords.every((item) => item.isMeasured
        && item.pcSearchVolume !== null
        && item.mobileSearchVolume !== null
        && item.totalSearchVolume !== null
        && item.documentCount !== null
        && item.goldenRatio !== null));
  assert('keyword analysis attaches publish decision for blogger fit',
    result.keywords.every((item) => item.publishDecision
      && item.publishDecision.score >= 0
      && item.publishDecision.score <= 100
      && ['publish', 'conditional', 'exclude'].includes(item.publishDecision.verdict)
      && item.publishDecision.label.length > 0),
    JSON.stringify(result.keywords.map((item) => item.publishDecision)));
  assert('keyword analysis preserves SearchAd/OpenAPI evidence',
    result.keywords.every((item) => item.evidence.includes('fixture-searchad-volume')
      && item.evidence.includes('fixture-naver-blog-document-count')));
  assert('keyword analysis reports progress',
    progress.some((message) => message.includes('PC expansion engine'))
      && progress.some((message) => message.includes('exact keyword only'))
      && progress.some((message) => message.includes('fixture measured keyword metrics')));
}

async function runMindmapExpansion(): Promise<void> {
  const measured = { value: false };
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      measured.value = true;
      context.progress(84, 'fixture measured mindmap metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: 'han river reservation',
    targetCount: 20,
    includeVolumeMetrics: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('mindmap measures seed fallback candidates when live source has no candidates',
    result.keywords.length > 0
      && result.summary.total > 0
      && result.summary.measured === result.keywords.length
      && result.keywords.some((item) => item.keyword === 'han river reservation'
        && item.source === 'pc-mindmap-exact-measured-seed')
      && result.keywords.every((item) => item.isMeasured
        && ['pc-mindmap-measured-intent-expansion', 'pc-mindmap-exact-measured-seed'].includes(item.source)
        && item.intent === 'mindmap-expansion'
        && item.pcSearchVolume !== null
        && item.mobileSearchVolume !== null
        && item.documentCount !== null),
    JSON.stringify(result));
  assert('mindmap uses the measurement adapter for seed fallback candidates',
    measured.value === true);
  assert('mindmap reports progress',
    progress.some((message) => message.includes('no live mindmap candidates'))
      && progress.some((message) => message.includes('pc-mindmap measured intent candidates')));
}

async function runMindmapExpansionWithInvestigativeSportsBridge(): Promise<void> {
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
  });
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: '\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC0AC\uD1F4',
    targetCount: 20,
    includeVolumeMetrics: false,
    contextKeywords: [
      { keyword: '\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC120\uC784 \uB17C\uB780', source: 'live-source-context' },
      { keyword: '\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uBE44\uB9AC \uC804\uB9D0', source: 'live-source-context' },
      { keyword: '\uC774\uAC15\uC778 \uC774\uC7AC\uC131 \uD22C\uC785 \uC694\uCCAD \uB17C\uB780', source: 'live-source-context' },
      { keyword: '\uAE40\uBBFC\uC7AC \uAD50\uCCB4 \uD56D\uC758 \uC7A5\uBA74', source: 'live-source-context' },
    ],
  }), {
    signal: new AbortController().signal,
    progress: () => {},
  });
  const keywords = result.keywords.map((item) => item.keyword);
  assert('mindmap expands football coach issue into investigative next-question branches',
    keywords.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uB2E4\uC74C \uAC10\uB3C5 \uD6C4\uBCF4')
      && keywords.includes('\uD64D\uBA85\uBCF4 \uAC10\uB3C5 \uC120\uC784 \uACFC\uC815')
      && keywords.includes('\uB300\uD55C\uCD95\uAD6C\uD611\uD68C \uBE44\uB9AC \uC804\uB9D0')
      && keywords.includes('\uC774\uAC15\uC778 \uC774\uC7AC\uC131 \uD22C\uC785 \uC694\uCCAD')
      && keywords.includes('\uAE40\uBBFC\uC7AC \uAD50\uCCB4 \uD56D\uC758')
      && result.keywords.some((item) => item.source === 'mindmap-semantic-bridge' && item.measurementStatus === 'unmeasured'),
    keywords.join(', '));
}

async function runMindmapExpansionWithPolicySemanticBridge(): Promise<void> {
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
  });
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: '\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C',
    targetCount: 20,
    includeVolumeMetrics: false,
  }), {
    signal: new AbortController().signal,
    progress: () => {},
  });
  const keywords = result.keywords.map((item) => item.keyword);
  assert('mindmap expands policy keywords without duplicated suffix branches',
    keywords.includes('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uB300\uC0C1')
      && keywords.includes('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC2E0\uCCAD\uBC29\uBC95')
      && keywords.includes('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uD544\uC694\uC11C\uB958')
      && !keywords.includes('\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC9C0\uAE09\uC77C'),
    keywords.join(', '));
}

function runNaverOpenApiKeyPoolGuards(): void {
  const stateFile = path.join(process.cwd(), 'tmp', 'naver-openapi-key-pool-test.json');
  fs.rmSync(stateFile, { force: true });
  const oldStateFile = process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'];
  const oldIdPool = process.env['NAVER_CLIENT_ID_POOL'];
  const oldSecretPool = process.env['NAVER_CLIENT_SECRET_POOL'];
  const oldJsonPool = process.env['NAVER_OPENAPI_KEY_POOL'];
  const oldPairPool = process.env['NAVER_CLIENT_KEY_POOL'];
  const oldSingleId = process.env['NAVER_CLIENT_ID'];
  const oldSingleSecret = process.env['NAVER_CLIENT_SECRET'];
  try {
    process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'] = stateFile;
    process.env['NAVER_CLIENT_ID_POOL'] = 'pool-client-a;pool-client-b';
    process.env['NAVER_CLIENT_SECRET_POOL'] = 'pool-secret-a;pool-secret-b';
    delete process.env['NAVER_OPENAPI_KEY_POOL'];
    delete process.env['NAVER_CLIENT_KEY_POOL'];
    delete process.env['NAVER_CLIENT_ID'];
    delete process.env['NAVER_CLIENT_SECRET'];

    const credentials = getNaverBlogOpenApiCredentials();
    const first = selectNaverBlogOpenApiCredential();
    if (first) markNaverBlogOpenApiQuotaBlocked(first);
    const second = selectNaverBlogOpenApiCredential();
    const partialBlockedUntil = getNaverBlogOpenApiQuotaBlockedUntil();

    assert('naver OpenAPI key pool parses zipped id/secret pairs',
      credentials.length === 2
        && credentials[0].clientId === 'pool-client-a'
        && credentials[1].clientSecret === 'pool-secret-b');
    assert('naver OpenAPI key pool rotates away from a quota-blocked key',
      first?.clientId === 'pool-client-a'
        && second?.clientId === 'pool-client-b'
        && !isNaverBlogOpenApiQuotaBlocked());
    if (second) markNaverBlogOpenApiQuotaBlocked(second);
    const allBlockedUntil = getNaverBlogOpenApiQuotaBlockedUntil();
    assert('naver OpenAPI quota retry time is exposed only when every configured key is blocked',
      partialBlockedUntil === null
        && typeof allBlockedUntil === 'number'
        && allBlockedUntil > Date.now(),
      JSON.stringify({ partialBlockedUntil, allBlockedUntil }));
  } finally {
    if (oldStateFile === undefined) delete process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'];
    else process.env['LEWORD_NAVER_OPENAPI_QUOTA_STATE_FILE'] = oldStateFile;
    if (oldIdPool === undefined) delete process.env['NAVER_CLIENT_ID_POOL'];
    else process.env['NAVER_CLIENT_ID_POOL'] = oldIdPool;
    if (oldSecretPool === undefined) delete process.env['NAVER_CLIENT_SECRET_POOL'];
    else process.env['NAVER_CLIENT_SECRET_POOL'] = oldSecretPool;
    if (oldJsonPool === undefined) delete process.env['NAVER_OPENAPI_KEY_POOL'];
    else process.env['NAVER_OPENAPI_KEY_POOL'] = oldJsonPool;
    if (oldPairPool === undefined) delete process.env['NAVER_CLIENT_KEY_POOL'];
    else process.env['NAVER_CLIENT_KEY_POOL'] = oldPairPool;
    if (oldSingleId === undefined) delete process.env['NAVER_CLIENT_ID'];
    else process.env['NAVER_CLIENT_ID'] = oldSingleId;
    if (oldSingleSecret === undefined) delete process.env['NAVER_CLIENT_SECRET'];
    else process.env['NAVER_CLIENT_SECRET'] = oldSingleSecret;
    fs.rmSync(stateFile, { force: true });
  }
}

async function runMindmapExpansionWithWebContext(): Promise<void> {
  const measured = { value: false };
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      measured.value = true;
      context.progress(84, 'fixture measured context mindmap metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: 'han river reservation',
    targetCount: 5,
    includeVolumeMetrics: true,
    contextKeywords: [
      {
        keyword: 'han river reservation dinner',
        pcSearchVolume: 120,
        mobileSearchVolume: 880,
        totalSearchVolume: 1000,
        documentCount: 180,
        source: 'keyword-analysis-result',
        evidence: ['fixture-web-analysis'],
        isMeasured: true,
      },
      {
        keyword: 'han river reservation time',
        pcSearchVolume: 80,
        mobileSearchVolume: 620,
        totalSearchVolume: 700,
        documentCount: 150,
        source: 'keyword-analysis-result',
        evidence: ['fixture-web-analysis'],
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('mindmap expands from web keyword-analysis context without synthetic fallback',
    result.keywords.length > 0 && result.summary.total > 0 && result.summary.measured > 0,
    JSON.stringify(result));
  assert('mindmap measures context candidates',
    measured.value === true);
  assert('mindmap keeps web context candidates as the expansion source',
    result.keywords.some((item) => item.keyword === 'han river reservation dinner'
      || item.keyword === 'han river reservation time'),
    JSON.stringify(result.keywords.map((item) => item.keyword)));
  assert('mindmap with context runs ranking path',
    progress.some((message) => message.includes('ranking mindmap candidates')));
}

async function runInjectedGoldenDiscovery(): Promise<void> {
  let receivedTarget = 0;
  const executor = createMobilePcEngineExecutor({
    runGoldenDiscovery: async (params, context) => {
      receivedTarget = params.targetCount;
      context.progress(55, 'fixture golden adapter');
      const diverseKeywords = [
        '2027 6모 등급컷 발표',
        '여름 하객 원피스 코디',
        '키작녀 원피스 사이즈 비교',
        '임영웅 콘서트 예매 일정',
        '유재석 새 예능 방송시간',
        '프로야구 올스타전 티켓팅 일정',
        '월드컵 예선 중계 시간',
        '드라마 결말 해석',
        '아이돌 컴백 쇼케이스 일정',
        '청년월세지원 신청 서류',
        '근로장려금 지급일 조회',
        '신혼부부 전세대출 조건',
        '장마철 제습기 전기세 비교',
        '40대 선크림 민감성 피부 추천',
        '아이폰17 사전예약 가격',
        '부산 불꽃축제 주차 위치',
        '여름휴가 제주 숙소 예약',
        '반려견 심장사상충 검사 비용',
        '자취 원룸 에어컨 전기세 비교',
        '아파트 청약 당첨자 발표 조회',
        '초등 여름방학 체험학습 신청',
        '대학생 국가장학금 신청 기간',
        '직장인 연말정산 환급 조회',
        'KBO 개막전 예매 일정',
        '방송 출연진 공개 시간',
        '영화 개봉일 예매 일정',
        '서울 축제 입장료 주차',
        '지역 병원 휴일 진료 시간표',
        '고속버스 시간표 예약',
        '도서관 문화강좌 신청 방법',
      ];
      const baseKeywords = diverseKeywords.slice(0, params.targetCount).map((keyword, index) => {
        const totalSearchVolume = 2400 + index * 110;
        const documentCount = 25 + index;
        return {
          ...makeSssMetric(index + 10, 'diverse golden'),
          keyword,
          totalSearchVolume,
          documentCount,
          goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
        };
      });
      const base = makeSssResult(0, 'policy diverse golden');
      const fakeSss: MobileKeywordMetric = {
        ...makeSssMetric(999, 'fake broad golden'),
        keyword: 'fake broad golden seed',
        grade: 'SSS',
        totalSearchVolume: 360,
        documentCount: 1611294,
        goldenRatio: 0,
      };
      const bareBroadSss: MobileKeywordMetric = {
        ...makeSssMetric(998, 'bare broad golden'),
        keyword: '원피스',
        grade: 'SSS',
        totalSearchVolume: 12000,
        documentCount: 300,
        goldenRatio: 40,
      };
      const repeated: MobileKeywordMetric[] = [
        {
          ...makeSssMetric(1, 'summer dress recommendation'),
          keyword: 'summer dress recommendation',
          totalSearchVolume: 5400,
          documentCount: 420,
          goldenRatio: 12.86,
        },
        {
          ...makeSssMetric(2, 'best summer dress recommendation'),
          keyword: 'best summer dress recommendation',
          totalSearchVolume: 5200,
          documentCount: 430,
          goldenRatio: 12.09,
        },
        {
          ...makeSssMetric(3, 'summer dress recommendation outfit'),
          keyword: 'summer dress recommendation outfit',
          totalSearchVolume: 5100,
          documentCount: 440,
          goldenRatio: 11.59,
        },
      ];
      const keywords = [fakeSss, bareBroadSss, ...repeated, ...baseKeywords];
      return {
        ...base,
        keywords,
        summary: {
          ...base.summary,
          total: keywords.length,
          sss: keywords.length,
          measured: keywords.length,
        },
      };
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('golden-discovery', {
    categoryId: 'policy',
    mode: 'precision',
    targetCount: 1,
    requireSssFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('golden precision normalizes to 30 target', receivedTarget === 30);
  assert('golden precision returns 30 SSS metrics', result.summary.sss === 30 && result.keywords.length === 30);
  assert('golden precision removes fake measured SSS rows',
    !result.keywords.some((item) => item.keyword === 'fake broad golden seed'));
  assert('golden precision removes broad bare keywords beginners cannot write immediately',
    !result.keywords.some((item) => item.keyword === '원피스'));
  assert('golden precision limits repeated intent clusters',
    result.keywords.filter((item) => item.keyword.includes('summer dress recommendation')).length <= 2,
    result.keywords.map((item) => item.keyword).join('|'));
  assert('golden precision uses PC adapter fixture', progress.includes('fixture golden adapter'));
}

async function runInjectedGoldenQualityBackfill(): Promise<void> {
  const qualityTopics = [
    '드라마 폭싹 속았수다 방송시간',
    '넷플릭스 신작 드라마 몇부작',
    'KBO 올스타전 중계 일정',
    '청년 월세 지원금 신청 서류',
    '여름 축제 주차 위치',
    '토익 접수 일정 준비물',
    '영화 개봉일 예매 일정',
    '방송 출연진 공개 시간',
    '서울 축제 입장료 주차',
    '지역 병원 휴일 진료 시간표',
    '도서관 문화강좌 신청 방법',
    '박람회 사전등록 신청',
    '소상공인 정책자금 대상 조건',
    '청년도약계좌 신청 방법',
    '스포츠 결승전 티켓팅 일정',
    '아이돌 컴백 쇼케이스 일정',
    '신혼부부 전세대출 조건',
    '독감 백신 접종 비용',
    '고속버스 시간표 예약',
    '콘서트 좌석 배치도 예매',
  ];
  const strictSss = [
    '임영웅 콘서트 예매 일정',
    '2027 6모 등급컷',
    '프로야구 올스타전 티켓팅 일정',
    '부산 드림콘서트 예매 일정',
    '여름 하객 원피스 코디',
    '키작녀 원피스 사이즈 비교',
    '청년월세지원 신청 서류',
    '근로장려금 지급일 조회',
    '신혼부부 전세대출 조건',
    '아이폰17 사전예약 가격',
    '부산 불꽃축제 주차 위치',
    'KBO 개막전 예매 일정',
  ].map((keyword, index): MobileKeywordMetric => {
    const totalSearchVolume = 2600 + index * 170;
    const documentCount = 80 + index * 5;
    return {
      ...makeSssMetric(index + 200, 'strict mobile golden'),
      keyword,
      score: 94 - index * 0.2,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    };
  });
  const qualityBackfill = qualityTopics.map((keyword, index): MobileKeywordMetric => {
    const isSs = index % 2 === 0;
    const totalSearchVolume = isSs ? 700 + index * 40 : 360 + index * 25;
    const documentCount = isSs ? 100 + index * 4 : 90 + index * 3;
    return {
      ...makeSssMetric(index + 300, 'quality mobile golden'),
      keyword,
      grade: isSs ? 'SS' : 'S',
      score: isSs ? 82 - (index % 4) * 0.2 : 70 - (index % 4) * 0.2,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    };
  });
  const weakRows: MobileKeywordMetric[] = [
    {
      ...makeSssMetric(901, 'weak mobile golden'),
      keyword: '문서수 폭발 가짜 SSS',
      grade: 'SSS',
      score: 99,
      totalSearchVolume: 9000,
      documentCount: 200000,
      goldenRatio: 0.04,
    },
    {
      ...makeSssMetric(902, 'weak mobile golden'),
      keyword: '원피스',
      grade: 'SS',
      score: 82,
      totalSearchVolume: 5000,
      documentCount: 100,
      goldenRatio: 50,
    },
    {
      ...makeSssMetric(903, 'weak mobile golden'),
      keyword: '드라마 방송시간 부실 후보',
      grade: 'SS',
      score: 74,
      totalSearchVolume: 900,
      documentCount: 180,
      goldenRatio: 5,
    },
  ];
  const executor = createMobilePcEngineExecutor({
    runGoldenDiscovery: async () => {
      const keywords = [...weakRows, ...qualityBackfill, ...strictSss];
      return {
        keywords,
        summary: {
          total: keywords.length,
          sss: strictSss.length + 1,
          measured: keywords.length,
          elapsedMs: 1,
          fromCache: false,
          parityMode: 'pc-engine-plus',
        },
      };
    },
  });
  const result = await executor(makeJob('golden-discovery', {
    categoryId: 'drama',
    mode: 'precision',
    targetCount: 1,
    requireSssFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: () => {},
  });

  assert('golden quality backfill fills normalized 30 results',
    result.keywords.length === 30,
    `${result.keywords.length}: ${result.keywords.map((item) => `${item.grade} ${item.keyword}`).join('|')}`);
  assert('golden quality backfill keeps scarce SSS plus quality SS/S only',
    result.summary.sss === 12
      && result.keywords.slice(0, 12).every((item) => item.grade === 'SSS')
      && result.keywords.slice(12).every((item) => item.grade === 'SS' || item.grade === 'S'),
    result.keywords.map((item) => `${item.grade} ${item.keyword}`).join('|'));
  assert('golden quality backfill removes weak rows',
    !result.keywords.some((item) => ['문서수 폭발 가짜 SSS', '원피스', '드라마 방송시간 부실 후보'].includes(item.keyword)));
}

async function runInjectedProTraffic(): Promise<void> {
  let receivedTarget = 0;
  let receivedContextKeywords = 0;
  const executor = createMobilePcEngineExecutor({
    runProTraffic: async (params, context) => {
      receivedTarget = params.targetCount;
      receivedContextKeywords = params.contextKeywords?.length || 0;
      context.progress(55, 'fixture pro adapter');
      return makeSssResult(params.targetCount, 'PRO 트래픽 황금');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('pro-traffic-hunter', {
    categoryId: 'entertainment',
    targetCount: 250,
    includeSeasonal: true,
    includeEvergreen: true,
    includeFreshIssue: true,
    contextKeywords: [
      {
        keyword: 'context hot traffic keyword',
        pcSearchVolume: 300,
        mobileSearchVolume: 1700,
        totalSearchVolume: 2000,
        documentCount: 200,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('pro target preserves 250 requested amount', receivedTarget === 250);
  assert('pro target preserves web context keywords', receivedContextKeywords === 1);
  assert('pro target returns 250 SSS metrics', result.summary.sss === 250 && result.keywords.length === 250);
  assert('pro target uses PC adapter fixture', progress.includes('fixture pro adapter'));
}

async function runHomeBoardDefaultAdapter(): Promise<void> {
  const executor = createMobilePcEngineExecutor();
  const progress: string[] = [];
  const result = await executor(makeJob('home-board-hunter', {
    categoryId: 'policy',
    seedKeyword: '소상공인 지원금',
    targetCount: 30,
    requireSplusFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('home board returns 30 PC planner candidates', result.keywords.length === 30);
  assert('home board maps S+ home candidates to SSS', result.summary.sss === 30);
  assert('home board includes publish title evidence',
    result.keywords.every((item) => item.evidence.some((evidence) => evidence.startsWith('title: '))));
  assert('home board reports PC home intent progress',
    progress.some((message) => message.includes('PC home intent engine')));
}

async function runInjectedKinHiddenHoney(): Promise<void> {
  let receivedTab = '';
  let receivedContextKeywords = 0;
  const executor = createMobilePcEngineExecutor({
    runKinHiddenHoney: async (params, context) => {
      receivedTab = params.tabType;
      receivedContextKeywords = params.contextKeywords?.length || 0;
      context.progress(55, 'fixture kin adapter');
      return makeSssResult(params.targetCount, '지식인 꿀질문');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('kin-hidden-honey', {
    tabType: 'hidden',
    targetCount: 15,
    isPremiumRequest: true,
    contextKeywords: [
      {
        keyword: 'kin context question keyword',
        totalSearchVolume: 1400,
        documentCount: 120,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('kin hidden tab is preserved', receivedTab === 'hidden');
  assert('kin hidden preserves web context keywords', receivedContextKeywords === 1);
  assert('kin hidden returns requested SSS fixtures', result.keywords.length === 15 && result.summary.sss === 15);
  assert('kin hidden uses injected PC adapter fixture', progress.includes('fixture kin adapter'));
}

async function runInjectedShoppingConnect(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runShoppingConnect: async (params, context) => {
      received = params;
      context.progress(55, 'fixture shopping adapter');
      return makeSssResult(params.targetCount, '쇼핑 커넥트');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('shopping-connect', {
    keyword: '  무선 이어폰  ',
    targetCount: 999,
    sort: 'unknown',
    contextKeywords: [
      {
        keyword: 'wireless earbuds hot product',
        totalSearchVolume: 2200,
        documentCount: 180,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('shopping normalizes keyword', received.keyword === '무선 이어폰');
  assert('shopping target clamps to 80', received.targetCount === 80);
  assert('shopping sort defaults to sim', received.sort === 'sim');
  assert('shopping preserves web context keywords', received.contextKeywords.length === 1);
  assert('shopping returns injected SSS fixtures', result.keywords.length === 80 && result.summary.sss === 80);
  assert('shopping uses injected PC adapter fixture', progress.includes('fixture shopping adapter'));

  received = null;
  const floorResult = await executor(makeJob('shopping-connect', {
    keyword: '선크림',
    targetCount: 5,
    sort: 'date',
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });
  assert('shopping target floors to 30 sellable product keywords', received.targetCount === 30);
  assert('shopping floor request returns 30 fixtures', floorResult.keywords.length === 30 && floorResult.summary.sss === 30);
}

async function runInjectedYoutubeGolden(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runYoutubeGolden: async (params, context) => {
      received = params;
      context.progress(55, 'fixture youtube adapter');
      return makeSssResult(params.maxResults, '유튜브 황금키워드');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('youtube-golden', {
    maxResults: 999,
    categoryId: ' 24 ',
    crossReferenceNaver: false,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('youtube target clamps to 100', received.maxResults === 100);
  assert('youtube category is normalized', received.categoryId === '24');
  assert('youtube cross reference false is preserved', received.crossReferenceNaver === false);
  assert('youtube returns injected SSS fixtures', result.keywords.length === 100 && result.summary.sss === 100);
  assert('youtube uses injected PC adapter fixture', progress.includes('fixture youtube adapter'));
}

async function runInjectedNaverMate(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runNaverMate: async (params, context) => {
      received = params;
      context.progress(55, 'fixture naver mate adapter');
      return makeSssResult(params.targetCount, '네이버 메이트');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('naver-mate-hunter', {
    seedKeyword: '  소상공인 지원금  ',
    targetCount: 500,
    includeAutocomplete: false,
    includeRelated: false,
    includeVolumeMetrics: false,
    autoDiscovery: true,
    contextKeywords: [
      {
        keyword: 'naver mate context longtail',
        totalSearchVolume: 3100,
        documentCount: 220,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('naver mate normalizes seed keyword', received.seedKeyword === '소상공인 지원금');
  assert('naver mate target clamps to 120', received.targetCount === 120);
  assert('naver mate option false values are preserved',
    received.includeAutocomplete === false
      && received.includeRelated === false
      && received.includeVolumeMetrics === false);
  assert('naver mate preserves auto discovery flag', received.autoDiscovery === true);
  assert('naver mate preserves web context keywords', received.contextKeywords.length === 1);
  assert('naver mate returns injected SSS fixtures', result.keywords.length === 120 && result.summary.sss === 120);
  assert('naver mate uses injected PC adapter fixture', progress.includes('fixture naver mate adapter'));
}

function runFallbackRegressionGuards(): void {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'pc-engine-executor.ts'), 'utf8');
  const naverBlogApiSource = fs.readFileSync(path.join(__dirname, '..', 'naver-blog-api.ts'), 'utf8');
  const liveGoldenSource = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'live-golden-radar.ts'), 'utf8');
  const proTrafficSource = fs.readFileSync(path.join(__dirname, '..', 'pro-traffic-keyword-hunter.ts'), 'utf8');
  const naverAutocompleteSource = fs.readFileSync(path.join(__dirname, '..', 'naver-autocomplete.ts'), 'utf8');
  const prewarmServiceSource = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'prewarm-service.ts'), 'utf8');
  assert('shopping connect has SearchAd/OpenAPI quota fallback',
    source.includes('pc-shopping-quota-searchad-fallback')
      && source.includes('isQuotaLimitError')
      && source.includes('shopping quota exhausted')
      && source.includes('buildMeasuredIntentFallbackFromSeeds')
      && source.includes('strictFullyMeasuredMetrics')
      && /return resultFromMetrics\(fallback, startedAt, 'pc-engine-plus'\)/.test(source)
      && source.includes('pc-shopping-empty-searchad-fallback')
      && source.includes('shopping returned 0 products'));
  assert('shopping auto discovery never uses internal placeholder as a fallback seed',
    source.includes('isAutoDiscoveryPlaceholderKeyword')
      && source.includes(".filter(seed => !isAutoDiscoveryPlaceholderKeyword(seed))")
      && source.includes('fallbackSeeds')
      && !source.includes("const rootKeyword = params.keyword || '쇼핑 자동 발굴'"),
    'seedless shopping fallback must use real discovery seeds, not the UI placeholder');
  assert('shopping fallback avoids duplicated intent suffixes',
    source.includes('keywordAlreadyHasIntentSuffix')
      && source.includes('keywordAlreadyHasIntentSuffix(base, intentKeyword) ? base'),
    'shopping fallback should not emit 추천 추천 or 후기 후기 chains');
  assert('shopping connect returns a product pick and writing angle for each product keyword',
    source.includes('function buildShoppingProductPick')
      && source.includes('shoppingProductPick: buildShoppingProductPick')
      && source.includes('prioritizeShoppingProductPickMetrics')
      && source.includes('shoppingCandidateMetricLimit')
      && source.includes('shoppingDiscoverySeedLimit')
      && source.includes('params.targetCount * 3')
      && source.includes('Math.min(60, Math.max(params.targetCount * 2, 30))')
      && source.includes('balancedStaticShoppingSeeds')
      && source.includes('getStaticShoppingSuggestions(6)')
      && source.includes('isShoppingItemRelevantToDiscovery')
      && source.includes('shoppingKeywordVariants')
      && source.includes('.flatMap(seed => shoppingKeywordVariants(seed))')
      && source.includes('Math.min(80, Math.max(30, params.targetCount * 3))')
      && source.includes('attachShoppingProductPicksToMetrics')
      && source.includes('strongSignals === 0')
      && source.includes('shopping-product-pick-attached-from-live-item')
      && source.includes('measuredProductPicksWithFallback')
      && source.includes('mergePrioritizedKeywordMetrics')
      && source.includes('writeRecommendation')
      && source.includes('titleDrafts')
      && source.includes('buyingTriggers')
      && source.includes('conversionScore'),
    'shopping connect must explain which product to write about, not only emit a keyword');
  assert('shopping measured fallback is commerce-intent focused',
    source.includes("const isShoppingFallback = /shopping/i.test(source) || category === 'shopping'")
      && source.includes("'구매처'")
      && source.includes("'특가'")
      && source.includes("'배송'"),
    'shopping connect fallback must not spend most measurements on generic usage/caution informational suffixes');
  assert('measured fallback rejects repeated low-value intent chains before API spend',
    source.includes('isMeasuredFallbackCandidateUseful')
      && source.includes('hasRepeatedFallbackToken')
      && source.includes('FALLBACK_INTENT_FRAGMENT_RE')
      && source.includes('FALLBACK_LOW_SIGNAL_CHAIN_RE')
      && source.includes('if (!isMeasuredFallbackCandidateUseful(keyword)) return false'),
    'fallback candidate generator must filter 2026 2026 / 최신 최신 / over-expanded intent chains before SearchAd/OpenAPI calls');
  assert('measured fallback can widen roots enough to fill server-side shopping targets',
    source.includes('activeSeedLimit')
      && source.includes('Math.min(24, Math.max(1, limit * 2))')
      && source.includes('Math.min(60, Math.max(30, limit * 4))')
      && source.includes('targetMeasuredCount')
      && source.includes('Math.min(120, Math.max(limit * 3, limit))')
      && source.includes('cleanSeeds.slice(0, activeSeedLimit)'),
    'server-side measured fallback should not be capped to six roots when a feature needs 30+ measured candidates');
  assert('live golden radar rejects repeated low-value tokens before board publication',
    liveGoldenSource.includes('hasRepeatedLiveCandidateToken')
      && liveGoldenSource.includes('LOW_VALUE_REPEAT_TOKEN_RE')
      && liveGoldenSource.includes('LOW_VALUE_LIVE_COMPACT_CHAIN_RE')
      && liveGoldenSource.includes('추천최저가')
      && liveGoldenSource.includes('liveGenericIntentTokenCount')
      && liveGoldenSource.includes('if (hasRepeatedLiveCandidateToken(clean)) return true'),
    'live golden board must reject repeated year/current/intent tokens');
  assert('PRO traffic hunter filters over-expanded generated candidates before verification',
    proTrafficSource.includes('isOverExpandedProTrafficCandidate')
      && proTrafficSource.includes('hasRepeatedProCandidateToken')
      && proTrafficSource.includes('normalizeProTrafficSearchSeed')
      && proTrafficSource.includes('isProTrafficApiWorthyCandidate')
      && proTrafficSource.includes('PRO 후보 품질 필터')
      && proTrafficSource.includes('PRO_LOW_SIGNAL_CHAIN_RE')
      && proTrafficSource.includes('추천최저가')
      && proTrafficSource.includes('구매처최저가')
      && proTrafficSource.includes('스펙스펙')
      && proTrafficSource.includes('qualityFiltered = allKeywords.filter')
      && proTrafficSource.includes('allSeedKeywords.map(normalizeProTrafficSearchSeed).filter(Boolean)')
      && proTrafficSource.includes('fetchKeywordDataBatch(batchKeywordList'),
    'PRO hunter must not spend SearchAd/OpenAPI calls on 2026 2026, 실사용 실사용 후기, or 가격 할인 정보 chains');
  assert('PRO traffic hunter treats only fully measured candidates as verified',
    proTrafficSource.includes('const svOk = typeof r.searchVolume')
      && proTrafficSource.includes('const dcOk = typeof r.documentCount')
      && proTrafficSource.includes('return svOk && dcOk')
      && proTrafficSource.includes('rawUnified: ProTrafficKeyword[] = []')
      && proTrafficSource.includes('최종 보루도 실측 완료 후보만 허용'),
    'PRO hunter must not publish raw or half-measured fallback candidates');
  assert('Naver autocomplete skips low-value generated inputs before related SearchAd fallback',
    naverAutocompleteSource.includes('isLowValueAutocompleteQuery')
      && naverAutocompleteSource.includes('LOW_VALUE_AUTOCOMPLETE_COMPACT_CHAIN_RE')
      && naverAutocompleteSource.includes('구매처최저가')
      && naverAutocompleteSource.includes('스펙스펙')
      && naverAutocompleteSource.includes('return []'),
    'autocomplete should not spend related-keyword SearchAd calls on generated tail chains');
  assert('server prewarm prioritizes actionable policy/live needs before broad electronics mining',
    /id:\s*'shopping-connect-hot-products'[\s\S]{0,140}priority:\s*4/.test(prewarmServiceSource)
      && /id:\s*'policy-golden-precision'[\s\S]{0,130}priority:\s*5/.test(prewarmServiceSource)
      && /id:\s*'policy-home-board'[\s\S]{0,130}priority:\s*6/.test(prewarmServiceSource)
      && /id:\s*'kin-hidden-honey'[\s\S]{0,130}priority:\s*7/.test(prewarmServiceSource)
      && /id:\s*'naver-mate-auto-discovery'[\s\S]{0,220}product:\s*'naver-mate-hunter'/.test(prewarmServiceSource)
      && /id:\s*'naver-mate-auto-discovery'[\s\S]{0,220}priority:\s*8/.test(prewarmServiceSource)
      && /id:\s*'policy-pro-traffic-24h'[\s\S]{0,140}priority:\s*20/.test(prewarmServiceSource)
      && /id:\s*'electronics-pro-traffic-24h'[\s\S]{0,160}priority:\s*80/.test(prewarmServiceSource)
      && /id:\s*'electronics-pro-traffic-24h'[\s\S]{0,220}targetCount:\s*60/.test(prewarmServiceSource),
    'startup prewarm must not let broad electronics queries block live/free golden boards');
  assert('default metric adapter measures volume before spending OpenAPI document quota',
    source.includes('shouldMeasureDocumentCount')
      && source.includes('markNaverOpenApiQuotaBlocked')
      && /const volumeMap = hasSearchAdConfig[\s\S]{0,420}const documentKeywords = hasOpenApiConfig/.test(source),
    'document count lookup should be quota-aware and volume-qualified');
  assert('shopping connect can run seedless auto discovery on the server',
    source.includes('const autoDiscovery = !params.keyword')
      && source.includes('shoppingDiscoverySeedLimit')
      && source.includes('getShoppingDiscoverySeeds(shoppingDiscoverySeedLimit)')
      && source.includes("source: 'auto-discovery'"),
    'seedless shopping connect still requires a manual keyword');
  assert('KIN empty result has live source signal fallback',
    source.includes('pc-kin-live-source-fallback')
      && source.includes('kin-question-source-gap')
      && source.includes('buildSourceSignalMetrics')
      && source.includes('sourceSignalKeyword')
      && source.includes('isKinAnswerDemandMetric')
      && source.includes('isKinAnswerDemandKeyword'));
  assert('Naver Mate auto discovery expands real Naver suggestions instead of replaying context rows',
    source.includes('isNaverMateAutoDiscoverySeed')
      && source.includes('autoDiscovery ? undefined : params.seedKeyword')
      && source.includes('collecting live source roots for Naver Mate auto discovery')
      && source.includes('buildMobileSourceSignalSnapshot')
      && /pc-naver-mate\|pc-naver-autocomplete\|pc-naver-related/.test(source)
      && source.includes("'pc-naver-autocomplete'")
      && source.includes("'pc-naver-related-keywords'")
      && source.includes('buildNaverMateMeasuredQueryRoots')
      && source.includes('NAVER_MATE_NEED_SUFFIXES')
      && source.includes('naverMateConciseBases')
      && source.includes('isNaverMateConciseMeasuredCandidate')
      && source.includes('naverMateCandidateSeedKey')
      && source.includes('maxCandidatesPerSeed')
      && source.includes('prioritizeNaverMateMeasuredMetrics')
      && source.includes('prioritizeNaverMateUtilityMeasuredMetrics')
      && source.includes('naverMateUtilityScore')
      && source.includes('NAVER_MATE_LOW_VALUE_COMPACT_RE')
      && source.includes('isNaverMateDisplayQualityMetric')
      && source.includes('finalMetrics.filter(isNaverMateDisplayQualityMetric)')
      && source.includes('buildNaverMateLiveSourceFallbackMetrics')
      && source.includes('buildNaverMateSourceSignalQueryRoots')
      && source.includes('roundRobinNaverMateSourceSignals')
      && source.includes('NAVER_MATE_SOURCE_NOISE_TOKENS')
      && source.includes('NAVER_MATE_UTILITY_SIGNAL_RE')
      && source.includes('NAVER_MATE_VOLATILE_NEWS_RE')
      && source.includes('isNaverMateUtilityRootCandidate')
      && source.includes('isNaverMateSourceSignalWorthExpanding')
      && source.includes('spiderWebDepth: autoDiscovery ? 0 : 1')
      && source.includes('naverMateMinimumUsefulCount')
      && source.includes('earlyMeasuredSourceMetrics')
      && source.includes('Naver Mate early measured source pool')
      && source.includes('targetCount * 2'),
    'Naver Mate must use context only as expansion roots and return measured autocomplete/related candidates');
  assert('mindmap and Naver Mate preserve real Hangul search phrases through server recovery',
    source.includes('SAFE_MEASURED_INTENT_SUFFIXES')
      && source.includes('buildSafeMeasuredIntentRoots')
      && source.includes('SAFE_HANGUL_SEARCH_RE')
      && source.includes('SAFE_NUMERIC_KOREAN_QUERY_ALIASES')
      && source.includes('buildKoreanNumericAliasRoots')
      && source.includes('SAFE_SPACING_INTENT_SUFFIXES')
      && source.includes('buildSpacingIntentAliasRoots')
      && source.includes("'\\uACC4\\uC0B0\\uAE30'")
      && source.includes("'\u0034\\uB300'")
      && source.includes('pc-mindmap-exact-measured-seed')
      && source.includes('isUsefulMindmapMeasuredMetric')
      && source.includes('prioritizeMindmapMeasuredMetrics')
      && source.includes('LOW_SIGNAL_MINDMAP_KEYWORD_RE')
      && source.includes('recoverNaverMateMeasuredMetrics')
      && source.includes('measuredBroadFill')
      && source.includes('docs <= 500000')
      && source.includes('mergePrioritizedKeywordMetrics([strict, utility, recovered], targetCount)')
      && source.includes('pc-naver-mate-live-source-fallback')
      && source.includes('Naver Mate measured pool low')
      && source.includes("key === compactKeyword('\\uC790\\uB3D9 \\uBC1C\\uAD74')"),
    'mindmap/Naver Mate must not return 0 just because legacy mojibake regexes or strict filters dropped measured Korean candidates');
  assert('YouTube empty result has live source signal fallback',
    source.includes('pc-youtube-live-source-fallback')
      && source.includes('youtube-trend-source-gap')
      && source.includes('buildSourceSignalMetrics')
      && source.includes("'all'"));
  assert('PRO auto discovery continues PC hunter when live strict pool is below target',
    source.includes('liveStrictMetrics.length >= params.targetCount')
      && source.includes('live strict pool below target; continuing PC PRO hunter'),
    'auto discovery must not return 0 just because live measured prewarm had no strict rows');
  assert('Naver OpenAPI document counts are cached to protect daily quota',
    naverBlogApiSource.includes('naver-document-count-cache.json')
      && naverBlogApiSource.includes('getCachedNaverBlogDocumentCount')
      && naverBlogApiSource.includes('setCachedNaverBlogDocumentCount'),
    'document counts must use measured cache before spending OpenAPI quota');
  assert('Naver OpenAPI quota/cache state persists in server /data volume',
    naverBlogApiSource.includes("fs.existsSync('/data') ? '/data' : ''")
      && naverBlogApiSource.includes('naver-openapi-quota-state.json')
      && naverBlogApiSource.includes('naver-document-count-cache.json'),
    'quota and measured document-count cache must not fall back to container tmp before /data');
  assert('Naver OpenAPI stale quota cooldown is retried instead of blocking until midnight',
    naverBlogApiSource.includes('savedAtMs')
      && naverBlogApiSource.includes('NAVER_BLOG_OPENAPI_QUOTA_COOLDOWN_MS')
      && naverBlogApiSource.includes('nowMs - savedAtMs > NAVER_BLOG_OPENAPI_QUOTA_COOLDOWN_MS')
      && naverBlogApiSource.includes('saveNaverBlogOpenApiQuotaState()'),
    'stale persisted quota cooldown should be cleared so recovered OpenAPI keys can measure documents again');
  assert('Naver OpenAPI speed limit is not treated as daily quota exhaustion',
    isNaverBlogOpenApiRateLimitedText('{"errorMessage":"Rate limit exceeded. (속도 제한을 초과했습니다.)","errorCode":"012"}')
      && !isNaverBlogOpenApiQuotaExceededText('{"errorMessage":"Rate limit exceeded. (속도 제한을 초과했습니다.)","errorCode":"012"}')
      && isNaverBlogOpenApiQuotaExceededText('{"errorMessage":"Query limit exceeded","errorCode":"010"}')
      && naverBlogApiSource.includes('NAVER_BLOG_OPENAPI_RATE_LIMIT_BACKOFF_MS')
      && naverBlogApiSource.includes('markNaverBlogOpenApiRateLimited()'),
    'OpenAPI 012 should pause briefly instead of blocking the key until reset');
  assert('Naver OpenAPI logs do not expose client secret fragments',
    !/Client Secret:\s*\$\{/.test(naverBlogApiSource)
      && !/clientSecret\.substring/.test(naverBlogApiSource),
    'OpenAPI client secret must never be printed even partially');
}

(async () => {
  runNaverOpenApiKeyPoolGuards();
  await runKeywordAnalysis();
  await runMindmapExpansion();
  await runMindmapExpansionWithInvestigativeSportsBridge();
  await runMindmapExpansionWithPolicySemanticBridge();
  await runMindmapExpansionWithWebContext();
  await runInjectedGoldenDiscovery();
  await runInjectedGoldenQualityBackfill();
  await runInjectedProTraffic();
  await runHomeBoardDefaultAdapter();
  await runInjectedKinHiddenHoney();
  await runInjectedShoppingConnect();
  await runInjectedYoutubeGolden();
  await runInjectedNaverMate();
  runFallbackRegressionGuards();
  console.log('[mobile-pc-engine-executor.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
