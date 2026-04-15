// PRO Hunter v12 — 클러스터 자동 생성
// 작성: 2026-04-15
// 1개 시드 키워드 → 7~15개 관련 키워드 + 발행 순서 + 내부링크 구조

import { getNaverAutocompleteKeywords } from '../naver-autocomplete';
import { EnvironmentManager } from '../environment-manager';

export interface ClusterKeyword {
  keyword: string;
  difficulty: 'easy' | 'medium' | 'hard';
  publishOrder: number;       // 1부터 시작
  role: 'pillar' | 'support' | 'longtail';
  parentKeyword?: string;     // 내부링크용
  estimatedWordCount: number;
}

export interface KeywordCluster {
  pillarKeyword: string;
  totalKeywords: number;
  keywords: ClusterKeyword[];
  internalLinkGraph: Array<{ from: string; to: string; reason: string }>;
  estimatedWeeks: number;     // 전체 클러스터 작성 예상 주
  strategySummary: string;
}

const KOREAN_MODIFIERS = [
  '추천', '비교', '후기', '방법', '순위', '가격', '종류', '차이',
  '장단점', '주의사항', '꿀팁', '리뷰', '베스트', '인기', '신상',
];

const NUMERIC_MODIFIERS = ['1인', '2인', '가족', '커플', '혼자', '집에서', '저렴한', '고급'];

function classifyDifficulty(kw: string): 'easy' | 'medium' | 'hard' {
  // 짧고 일반적인 키워드일수록 어려움
  if (kw.length <= 4) return 'hard';
  if (kw.length <= 7) return 'medium';
  return 'easy'; // 롱테일
}

function classifyRole(kw: string, isPillar: boolean): 'pillar' | 'support' | 'longtail' {
  if (isPillar) return 'pillar';
  return kw.length > 8 ? 'longtail' : 'support';
}

/**
 * 시드 키워드를 7~15개 클러스터로 확장
 */
export async function expandToCluster(seed: string): Promise<KeywordCluster> {
  const env = EnvironmentManager.getInstance().getConfig();
  const naverConfig = {
    clientId: env.naverClientId || '',
    clientSecret: env.naverClientSecret || '',
  };

  // 1. 자동완성으로 관련어 수집
  let related: string[] = [];
  try {
    related = await getNaverAutocompleteKeywords(seed, naverConfig);
  } catch (err) {
    console.warn('[CLUSTER] 자동완성 실패:', (err as Error).message);
  }

  // 2. 자동완성 부족하면 룰 기반 보강
  const augmented = new Set<string>(related);
  if (augmented.size < 8) {
    for (const mod of KOREAN_MODIFIERS) {
      augmented.add(`${seed} ${mod}`);
      if (augmented.size >= 15) break;
    }
    for (const mod of NUMERIC_MODIFIERS) {
      augmented.add(`${mod} ${seed}`);
      if (augmented.size >= 15) break;
    }
  }

  // 3. 시드 자체를 pillar로
  const pillarKeyword = seed;
  const supportKeywords = Array.from(augmented).filter((k) => k !== seed).slice(0, 14);

  // 4. 발행 순서 결정 (어려운 pillar 마지막, easy 먼저)
  const sorted = supportKeywords.sort((a, b) => {
    const aDiff = classifyDifficulty(a);
    const bDiff = classifyDifficulty(b);
    const order = { easy: 0, medium: 1, hard: 2 };
    return order[aDiff] - order[bDiff];
  });

  // 5. 클러스터 빌드
  const keywords: ClusterKeyword[] = [];
  sorted.forEach((kw, i) => {
    const difficulty = classifyDifficulty(kw);
    keywords.push({
      keyword: kw,
      difficulty,
      publishOrder: i + 1,
      role: classifyRole(kw, false),
      parentKeyword: pillarKeyword,
      estimatedWordCount: difficulty === 'hard' ? 2000 : difficulty === 'medium' ? 1500 : 1200,
    });
  });

  // pillar는 마지막에 (가장 어려움, 권위 글)
  keywords.push({
    keyword: pillarKeyword,
    difficulty: 'hard',
    publishOrder: keywords.length + 1,
    role: 'pillar',
    estimatedWordCount: 2500,
  });

  // 6. 내부링크 그래프 (pillar ↔ support 양방향)
  const linkGraph: Array<{ from: string; to: string; reason: string }> = [];
  for (const k of keywords) {
    if (k.role === 'pillar') {
      // pillar → 모든 support
      for (const s of keywords.filter((x) => x.role !== 'pillar')) {
        linkGraph.push({ from: k.keyword, to: s.keyword, reason: '권위 글에서 세부 글로 분기' });
      }
    } else {
      // support → pillar
      linkGraph.push({ from: k.keyword, to: pillarKeyword, reason: '세부 글에서 권위 글로 회귀' });
    }
  }

  // 7. 예상 작성 주
  const estimatedWeeks = Math.ceil(keywords.length / 2); // 주 2개 발행 가정

  return {
    pillarKeyword,
    totalKeywords: keywords.length,
    keywords,
    internalLinkGraph: linkGraph,
    estimatedWeeks,
    strategySummary: `easy → medium → hard 순으로 발행하여 권위를 누적하고, 마지막에 pillar 글을 작성해 모든 글에서 내부링크로 연결합니다. 약 ${estimatedWeeks}주 (주 2개 발행 기준).`,
  };
}
