import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import type { MobileKeywordResult } from '../../mobile/contracts';
import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function result(keyword: string, index: number): any {
  return {
    keyword,
    grade: index === 0 ? 'SSS' : index % 2 === 0 ? 'SS' : 'S',
    score: index === 0 ? 91 : 76,
    searchVolume: 2200 + index * 100,
    documentCount: 120 + index * 10,
    goldenRatio: 12 + index,
    cpc: 80,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live fixture',
    externalSources: ['test-fixture'],
  };
}

function floodResult(keyword: string, index: number, profile = false): any {
  return {
    keyword,
    grade: 'SSS',
    score: (profile ? 96 : 88) - index * 0.1,
    searchVolume: 3200 + index * 80,
    documentCount: 180 + index * 5,
    goldenRatio: 18 - index * 0.05,
    cpc: 90,
    categoryMatched: true,
    intent: 'live-golden',
    goldenReason: 'measured live profile flood fixture',
    externalSources: ['test-fixture'],
  };
}

function thinProfileCount(items: Array<{ keyword: string }>): number {
  return items.filter((item) => /(프로필|인물정보|약력|나이|인스타)$/.test(item.keyword.replace(/\s+/g, ''))).length;
}

(async () => {
  const inbox = new MobileNotificationInbox({
    now: () => new Date('2026-06-07T09:00:00.000Z'),
  });
  let discoverCalls = 0;
  const radar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 5,
    maxCandidates: 180,
    categories: ['celebrity', 'policy'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async (_config, options) => {
      discoverCalls += 1;
      assert('live radar keeps candidate budget small', Number(options?.maxCandidates) <= 180);
      return [
        result('2026 흠뻑쇼 일정', 0),
        result('리센느 프로필', 1),
        result('멋진 신세계 몇부작', 2),
        result('근로장려금 지급일', 3),
        result('삼성전자 주가 전망', 4),
      ];
    },
  });

  const snapshot = await radar.runOnce();
  const notifications = inbox.snapshot(10);
  assert('live radar runs one discovery cycle', discoverCalls === 1);
  assert('live radar records successful run', snapshot.successfulRuns === 1 && snapshot.failedRuns === 0);
  assert('live radar publishes only a small batch', snapshot.publishedCount <= 4 && snapshot.publishedCount > 0);
  assert('live radar publishes live notification kind',
    notifications.items.every((item) => item.kind === 'live-golden'),
    JSON.stringify(notifications.items));
  assert('live radar rotates next category', snapshot.nextCategoryId === 'policy');
  assert('live radar filters thin person profile keyword',
    !snapshot.board.some((item) => item.keyword === '리센느 프로필'),
    snapshot.board.map((item) => item.keyword).join('|'));

  const profileFloodRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 15,
    boardTarget: 30,
    publicPreviewCount: 5,
    categories: ['celeb'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => [
      '전영현 프로필',
      '양의지 프로필',
      '김한희 프로필',
      '정성호 프로필',
      '백진경 프로필',
      '강훈식 프로필',
      '리센느 프로필',
      '성리 프로필',
    ].map((keyword, index) => floodResult(keyword, index, true)).concat([
      '2027 6모 등급컷',
      '1227회 로또 당첨번호',
      '근로장려금 지급일',
      'KBO 올스타전 중계',
      '멋진 신세계 몇부작',
      '청년 지원금 신청',
      '삼성전자 주가 전망',
      '임영웅 콘서트 예매 일정',
      '부산 축제 주차 위치',
      '모의고사 답지 발표',
    ].map((keyword, index) => floodResult(keyword, index + 20))),
  });
  const floodSnapshot = await profileFloodRadar.runOnce();
  assert('live golden board rejects thin profile intent instead of flooding the top board',
    thinProfileCount(floodSnapshot.board.slice(0, 30)) === 0
      && floodSnapshot.board.some((item) => item.keyword === '2027 6모 등급컷')
      && floodSnapshot.board.some((item) => item.keyword === '청년 지원금 신청'),
    floodSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('public live golden preview exposes no thin profile intent',
    thinProfileCount(floodSnapshot.publicPreview) === 0,
    floodSnapshot.publicPreview.map((item) => item.keyword).join('|'));

  const profileAliasBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-profile-alias-test.json');
  fs.writeFileSync(profileAliasBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:40:00.000Z',
    items: [
      ['전영현 프로필', 'SSS', 98, 18000, 120, 150, 'celeb'],
      ['양의지 프로필', 'SSS', 97, 15000, 140, 107, 'sports'],
      ['김한희 프로필 가족', 'SSS', 96, 12000, 160, 75, 'celeb'],
      ['정성호 나이 학력', 'SSS', 95, 11000, 180, 61, 'celeb'],
      ['백진경 인물정보', 'SSS', 94, 9000, 200, 45, 'celeb'],
      ['2026 흠뻑쇼 일정', 'SS', 86, 7000, 900, 7.7, 'music'],
      ['KBO 올스타전 예매 일정', 'SS', 84, 6200, 880, 7, 'sports'],
      ['근로장려금 지급일 조회', 'SS', 82, 5400, 760, 7.1, 'policy'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:40:00.000Z',
      discoveredAt: '2026-06-13T08:40:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const profileAliasRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: profileAliasBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const profileAliasSnapshot = profileAliasRadar.snapshot();
  assert('stored live golden board purges name plus thin profile variants',
    profileAliasSnapshot.board.every((item) => !/(프로필|인물정보|약력|나이|학력|고향|인스타)/.test(item.keyword))
      && profileAliasSnapshot.board.some((item) => item.keyword === '2026 흠뻑쇼 일정')
      && profileAliasSnapshot.publicPreview.every((item) => !/(프로필|인물정보|약력|나이|학력|고향|인스타)/.test(item.keyword)),
    profileAliasSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(profileAliasBoardFile, { force: true });

  let capturedLiveSeeds: string[] = [];
  const seedCleaningRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    cycleLimit: 4,
    categories: ['celeb'],
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [
      '이재명·멜로니 악수 [up]',
      '쥬얼리, 불화설 끝 20년만에 완전체.. 조민아까지 눈물 [스타이슈]김미화 기자 ・ 2026.06.12 ・ 23:23',
      '서건창 끝내기 안타',
    ],
    enableBackfill: false,
    discover: async (_config, options) => {
      capturedLiveSeeds = Array.isArray(options?.liveSeeds) ? options.liveSeeds : [];
      return [result('이재명 멜로니 악수', 0), result('서건창 끝내기 안타', 1)];
    },
  });
  await seedCleaningRadar.runOnce();
  assert('live radar cleans portal/news seeds before measuring',
    capturedLiveSeeds.includes('이재명 멜로니 악수')
      && capturedLiveSeeds.includes('서건창 끝내기 안타')
      && capturedLiveSeeds.every((seed) => seed.length <= 34 && !/[·\[\]]/.test(seed) && !seed.includes('기자')),
    capturedLiveSeeds.join('|'));

  const staleBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-stale-board-test.json');
  fs.mkdirSync(path.dirname(staleBoardFile), { recursive: true });
  fs.writeFileSync(staleBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:30:00.000Z',
    items: [
      {
        keyword: '6모 등급컷',
        grade: 'SSS',
        score: 91,
        totalSearchVolume: 12000,
        documentCount: 1200,
        goldenRatio: 10,
        category: 'education',
        updatedAt: '2026-06-08T07:39:17.894Z',
        discoveredAt: '2026-06-08T07:39:17.894Z',
        isMeasured: true,
      },
      {
        keyword: '올트먼 방한 연기',
        grade: 'SS',
        score: 82,
        totalSearchVolume: 1800,
        documentCount: 600,
        goldenRatio: 3,
        category: 'it',
        updatedAt: '2026-06-13T08:20:00.000Z',
        discoveredAt: '2026-06-13T08:20:00.000Z',
        isMeasured: true,
      },
    ],
  }), 'utf8');
  const staleRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: staleBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const staleSnapshot = staleRadar.snapshot();
  assert('public preview hides stale repeated keywords and prefers fresh issues',
    staleSnapshot.publicPreview.length === 1
      && staleSnapshot.publicPreview[0]?.keyword === '올트먼 방한 연기',
    staleSnapshot.publicPreview.map((item) => `${item.keyword}:${item.updatedAt}`).join('|'));
  fs.rmSync(staleBoardFile, { force: true });

  const proGapBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-pro-gap-test.json');
  fs.writeFileSync(proGapBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:50:00.000Z',
    items: [
      ['청년미래적금 가입신청 대상', 'SSS', 96, 32000, 240, 133.3, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 93, 18000, 420, 42.8, 'policy'],
      ['근로장려금 지급일 조회', 'SS', 88, 12000, 780, 15.3, 'policy'],
      ['KBO 올스타전 예매 일정', 'SS', 82, 8200, 1200, 6.8, 'sports'],
      ['나혼자산다 출연진', 'S', 75, 4200, 950, 4.4, 'broadcast'],
      ['여름휴가 준비물 체크리스트', 'S', 72, 2400, 820, 2.9, 'travel_domestic'],
      ['드라마 다시보기 방법', 'S', 70, 1200, 520, 2.3, 'drama'],
      ['프로야구 예매', 'S', 68, 900, 360, 2.5, 'sports'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:50:00.000Z',
      discoveredAt: '2026-06-13T08:50:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const proGapRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: proGapBoardFile,
    publicPreviewCount: 3,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const proGapSnapshot = proGapRadar.snapshot();
  const protectedProKeywords = new Set(proGapSnapshot.board.slice(0, 3).map((item) => item.keyword));
  assert('pro board ranks monster opportunity keywords first',
    proGapSnapshot.board[0]?.keyword === '청년미래적금 가입신청 대상'
      && proGapSnapshot.board[1]?.keyword === '소상공인 환급금 조회 방법',
    proGapSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('free preview samples lower measured winners while hiding pro top tier',
    proGapSnapshot.publicPreview.length === 3
      && proGapSnapshot.publicPreview.every((item) => !protectedProKeywords.has(item.keyword))
      && proGapSnapshot.publicPreview.every((item) => item.rank > 3 && item.isMeasured && ['SSS', 'SS', 'S'].includes(item.grade)),
    proGapSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(proGapBoardFile, { force: true });

  const previewLeakBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-preview-leak-test.json');
  fs.writeFileSync(previewLeakBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:55:00.000Z',
    items: [
      ['청년미래적금 신청 대상', 'SSS', 98, 42000, 300, 140, 'policy'],
      ['소상공인 환급금 조회 방법', 'SSS', 96, 36000, 420, 85, 'policy'],
      ['프로야구 올스타전 예매 일정', 'SS', 91, 28000, 700, 40, 'sports'],
      ['지역 축제 주차 위치', 'S', 74, 5400, 50000, 1.4, 'life'],
      ['여름 휴가 준비물 체크리스트', 'S', 73, 5200, 52000, 1.3, 'life'],
      ['드라마 다시보기 방법', 'S', 72, 5000, 54000, 1.2, 'drama'],
      ['KBO 중계 일정', 'S', 71, 4800, 56000, 1.1, 'sports'],
      ['공휴일 병원 진료 조회', 'S', 70, 4600, 58000, 1.0, 'life'],
      ['자격증 접수 마감일', 'S', 69, 4400, 60000, 0.9, 'education'],
      ['신제품 출시 가격 비교', 'S', 68, 4200, 62000, 0.8, 'electronics'],
    ].map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category], index) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: index < 3 ? '2026-06-13T08:55:00.000Z' : '2026-06-10T08:55:00.000Z',
      discoveredAt: index < 3 ? '2026-06-13T08:55:00.000Z' : '2026-06-10T08:55:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const previewLeakRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: previewLeakBoardFile,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const previewLeakSnapshot = previewLeakRadar.snapshot();
  assert('free preview fills lower warm slots without leaking pro head when strict public candidates are scarce',
    previewLeakSnapshot.publicPreview.length === 5
      && previewLeakSnapshot.publicPreview.every((item) => item.rank > 3)
      && previewLeakSnapshot.publicPreview.every((item) => !['청년미래적금 신청 대상', '소상공인 환급금 조회 방법', '프로야구 올스타전 예매 일정'].includes(item.keyword)),
    previewLeakSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(previewLeakBoardFile, { force: true });

  const categoryDiversityBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-category-diversity-test.json');
  const categoryDiversityRows = [
    ['청년지원금 신청 대상', 'SSS', 98, 38000, 240, 158, 'policy'],
    ['소상공인 환급 조회 방법', 'SSS', 97, 32000, 260, 123, 'policy'],
    ['근로장려금 지급일 조회', 'SSS', 96, 28000, 300, 93, 'policy'],
    ['국민지원금 신청 서류', 'SSS', 95, 25000, 320, 78, 'policy'],
    ['고용지원금 마감 일정', 'SSS', 94, 23000, 340, 67, 'policy'],
    ['환급금 조회 방법', 'SSS', 93, 21000, 360, 58, 'policy'],
    ['KBO 올스타전 예매 일정', 'SS', 88, 9000, 700, 12, 'sports'],
    ['프로야구 중계 일정', 'SS', 87, 8600, 760, 11, 'sports'],
    ['야구 경기 하이라이트', 'S', 74, 4600, 900, 5, 'sports'],
    ['6월 모의고사 등급컷', 'SS', 86, 8200, 720, 11, 'education'],
    ['수능 접수 마감 일정', 'SS', 85, 7800, 740, 10, 'education'],
    ['기출 답지 공개 일정', 'S', 73, 4200, 840, 5, 'education'],
    ['하트시그널 몇부작', 'SS', 84, 7200, 800, 9, 'drama'],
    ['드라마 결말 다시보기', 'S', 72, 3900, 820, 4.7, 'drama'],
    ['쿠키영상 결말 해석', 'S', 71, 3600, 780, 4.6, 'movie'],
    ['콘서트 예매 일정', 'S', 70, 3300, 760, 4.3, 'music'],
  ];
  fs.writeFileSync(categoryDiversityBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:58:00.000Z',
    items: categoryDiversityRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:58:00.000Z',
      discoveredAt: '2026-06-13T08:58:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const categoryDiversityRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: categoryDiversityBoardFile,
    boardTarget: 12,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const categoryDiversitySnapshot = categoryDiversityRadar.snapshot();
  const policyCount = categoryDiversitySnapshot.board.filter((item) => item.category === 'policy').length;
  const uniqueCategories = new Set(categoryDiversitySnapshot.board.map((item) => item.category));
  assert('pro live golden board caps one-category flooding before filling diverse winners',
    categoryDiversitySnapshot.board.length === 12
      && policyCount <= 3
      && uniqueCategories.size >= 5,
    categoryDiversitySnapshot.board.map((item) => `${item.rank}:${item.category}:${item.keyword}`).join('|'));
  fs.rmSync(categoryDiversityBoardFile, { force: true });

  const semanticClusterBoardFile = path.join(process.cwd(), 'tmp', 'mobile-live-golden-semantic-cluster-test.json');
  const heartSignalRoot = '\uD558\uD2B8\uC2DC\uADF8\uB110';
  const heartSignalBase = `${heartSignalRoot}5`;
  const semanticClusterRows = [
    [`${heartSignalBase} \uCD9C\uC5F0\uC9C4`, 'SSS', 99, 42000, 400, 105, 'drama'],
    [`${heartSignalBase} \uBA87\uBD80\uC791`, 'SSS', 98, 39000, 420, 92, 'drama'],
    [`${heartSignalBase} \uB2E4\uC2DC\uBCF4\uAE30`, 'SSS', 97, 36000, 430, 83, 'drama'],
    [`${heartSignalBase} \uACB0\uB9D0`, 'SSS', 96, 33000, 440, 75, 'drama'],
    [`${heartSignalBase} \uC6D0\uC791`, 'SSS', 95, 30000, 450, 66, 'drama'],
    [`${heartSignalRoot} \uBA87\uBD80\uC791`, 'SSS', 94, 28000, 460, 60, 'drama'],
    ['\uCCAD\uB144\uBBF8\uB798\uC801\uAE08 \uAC00\uC785\uC2E0\uCCAD \uB300\uC0C1', 'SSS', 92, 26000, 360, 72, 'policy'],
    ['KBO \uC62C\uC2A4\uD0C0\uC804 \uC608\uB9E4 \uC77C\uC815', 'SS', 88, 15000, 900, 16, 'sports'],
    ['6\uBAA8 \uB4F1\uAE09\uCEF7', 'SS', 86, 12000, 700, 17, 'education'],
    ['\uADFC\uB85C\uC7A5\uB824\uAE08 \uC9C0\uAE09\uC77C \uC870\uD68C', 'SS', 85, 9000, 650, 13, 'policy'],
    ['\uD504\uB85C\uC57C\uAD6C \uC911\uACC4 \uC77C\uC815', 'S', 74, 5500, 1000, 5.5, 'sports'],
    ['\uC18C\uC0C1\uACF5\uC778 \uD658\uAE09\uAE08 \uC870\uD68C \uBC29\uBC95', 'S', 73, 4800, 820, 5.8, 'policy'],
    ['\uCF58\uC11C\uD2B8 \uC608\uB9E4 \uC77C\uC815', 'S', 72, 4200, 780, 5.3, 'music'],
    ['\uC544\uC774\uD3F015 \uCD9C\uC2DC \uAC00\uACA9\uBE44\uAD50', 'S', 71, 3900, 760, 5.1, 'electronics'],
    ['\uC815\uBD80\uC9C0\uC6D0\uAE08 \uC2E0\uCCAD \uC11C\uB958', 'S', 70, 3500, 740, 4.7, 'policy'],
  ];
  fs.writeFileSync(semanticClusterBoardFile, JSON.stringify({
    boardUpdatedAt: '2026-06-13T08:59:00.000Z',
    items: semanticClusterRows.map(([keyword, grade, score, totalSearchVolume, documentCount, goldenRatio, category]) => ({
      keyword,
      grade,
      score,
      totalSearchVolume,
      documentCount,
      goldenRatio,
      category,
      updatedAt: '2026-06-13T08:59:00.000Z',
      discoveredAt: '2026-06-13T08:59:00.000Z',
      isMeasured: true,
    })),
  }), 'utf8');
  const semanticClusterRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    boardFile: semanticClusterBoardFile,
    boardTarget: 10,
    publicPreviewCount: 5,
    now: () => new Date('2026-06-13T09:00:00.000Z'),
  });
  const semanticClusterSnapshot = semanticClusterRadar.snapshot();
  const heartSignalCount = semanticClusterSnapshot.board.filter((item) => item.keyword.includes(heartSignalRoot)).length;
  assert('pro live golden board caps same-issue suffix variants by semantic cluster',
    semanticClusterSnapshot.board.length === 10 && heartSignalCount <= 2,
    semanticClusterSnapshot.board.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  assert('public live golden preview still fills the promised five lower slots after semantic clustering',
    semanticClusterSnapshot.publicPreview.length === 5,
    semanticClusterSnapshot.publicPreview.map((item) => `${item.rank}:${item.keyword}`).join('|'));
  fs.rmSync(semanticClusterBoardFile, { force: true });

  let skippedDiscoverCalls = 0;
  const skippedRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    shouldRun: () => ({ ok: false, message: 'manual queue busy' }),
    getEnvConfig: () => ({
      naverClientId: 'client',
      naverClientSecret: 'secret',
    }),
    liveSeedProvider: async () => [],
    enableBackfill: false,
    discover: async () => {
      skippedDiscoverCalls += 1;
      return [];
    },
  });
  const skipped = await skippedRadar.runOnce();
  assert('live radar skips while server is busy',
    skipped.skippedRuns === 1 && skippedDiscoverCalls === 0 && /busy/.test(skipped.lastMessage || ''));

  let intervalRegistered = false;
  let cleared = false;
  const scheduledRadar = new MobileLiveGoldenRadar({
    notificationInbox: inbox,
    runOnStart: false,
    setIntervalFn: () => {
      intervalRegistered = true;
      return 'live-timer';
    },
    clearIntervalFn: (handle) => {
      if (handle === 'live-timer') cleared = true;
    },
  });
  scheduledRadar.start();
  scheduledRadar.stop();
  assert('live radar scheduler starts and stops cleanly', intervalRegistered && cleared);

  const summary: MobileKeywordResult['summary'] | undefined = undefined;
  assert('type smoke remains compatible with mobile keyword result summary', summary === undefined);

  console.log('[mobile-live-golden-radar.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
