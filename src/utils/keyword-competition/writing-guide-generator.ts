/**
 * 글쓰기 가이드 생성기 (끝판왕 버전)
 */

import { 
  KeywordAnalysisResult, 
  BeginnerGuide, 
  ChecklistItem, 
  StructureSection 
} from './types';

/**
 * 초보자용 글쓰기 가이드 생성
 */
export function generateWritingGuide(analysis: KeywordAnalysisResult): BeginnerGuide {
  const keyword = analysis.keyword;
  
  // 1. 현재 1등 글 분석
  const whyTop1 = generateWhyTop1(analysis);
  
  // 2. 체크리스트 생성
  const checklist = generateChecklist(keyword, analysis);
  
  // 3. 추천 글 구조
  const recommendedStructure = generateRecommendedStructure(keyword, analysis);
  
  // 4. 프로 팁
  const proTips = generateProTips(analysis);
  
  return {
    whyTop1,
    checklist,
    recommendedStructure,
    proTips
  };
}

/**
 * 1등 글 분석
 */
function generateWhyTop1(analysis: KeywordAnalysisResult): string {
  const reasons: string[] = [];
  
  if (analysis.displayType === 'smartblock' && analysis.smartBlockAnalysis?.blocks[0]) {
    const top = analysis.smartBlockAnalysis.blocks[0].items[0];
    
    if (top) {
      if (top.titleKeywordMatch === 'exact') {
        reasons.push('제목에 키워드가 정확히 포함됨');
      }
      if (top.publishedDaysAgo <= 30) {
        reasons.push('최근 30일 이내 발행된 신선한 글');
      } else if (top.publishedDaysAgo >= 100) {
        reasons.push(`${top.publishedDaysAgo}일 전 발행됐지만 여전히 1위 유지 중`);
      }
      if (top.visitorCount && top.visitorCount >= 1000) {
        reasons.push(`일 방문자 ${top.visitorCount.toLocaleString()}명의 인플루언서 블로그`);
      }
      if (top.authorityLevel === 'optimal') {
        reasons.push('블로그 영향력지수 상위 1% 최적 블로그');
      }
    }
  } else if (analysis.popularAnalysis?.items[0]) {
    const top = analysis.popularAnalysis.items[0];
    
    if (top.type === 'cafe') {
      reasons.push('카페글이 1위를 차지 중 (블로그로 충분히 밀어낼 수 있음)');
    }
    if (top.blogdexRank) {
      if (top.blogdexRank <= 3000) {
        reasons.push(`블로그 영향력지수 ${top.blogdexRank.toLocaleString()}위 (상위 ${top.blogdexPercentile?.toFixed(2)}%) 최적 블로그`);
      } else if (top.blogdexRank <= 15000) {
        reasons.push(`블로그 영향력지수 ${top.blogdexRank.toLocaleString()}위 준최적 블로그`);
      } else {
        reasons.push(`블로그 영향력지수 ${top.blogdexRank.toLocaleString()}위 (일반 블로그도 경쟁 가능!)`);
      }
    }
    if (top.publishedDaysAgo >= 100) {
      reasons.push(`${top.publishedDaysAgo}일 전 발행된 오래된 글 (신선한 콘텐츠로 밀어낼 기회!)`);
    }
  }
  
  if (reasons.length === 0) {
    return '현재 상위 글들의 특별한 강점이 없어 좋은 콘텐츠로 충분히 진입 가능합니다.';
  }
  
  return reasons.join(' / ');
}

/**
 * 체크리스트 생성
 */
function generateChecklist(keyword: string, analysis: KeywordAnalysisResult): { title: string; items: ChecklistItem[] } {
  const items: ChecklistItem[] = [];
  
  // 제목 관련
  items.push({
    id: 'title-1',
    text: '제목 앞부분에 키워드 배치',
    importance: 'must',
    example: `"${keyword} 추천 후기 및 비교 가이드"`
  });
  
  items.push({
    id: 'title-2',
    text: '제목 40자 이내로 작성',
    importance: 'must',
    example: `"${keyword}" 포함 40자 이내`
  });
  
  // 본문 관련
  items.push({
    id: 'content-1',
    text: '본문 1,500자 이상 작성',
    importance: 'must'
  });
  
  items.push({
    id: 'content-2',
    text: '소제목(H2, H3) 3개 이상 사용',
    importance: 'must'
  });
  
  items.push({
    id: 'content-3',
    text: '첫 문단에 키워드 자연스럽게 포함',
    importance: 'must',
    example: `"${keyword}"에 대해 알아보겠습니다.`
  });
  
  // 이미지 관련
  items.push({
    id: 'image-1',
    text: '이미지 5장 이상 첨부',
    importance: 'recommended'
  });
  
  items.push({
    id: 'image-2',
    text: '이미지 ALT 태그에 키워드 포함',
    importance: 'recommended',
    example: `ALT: "${keyword} 실제 사용 후기"`
  });
  
  // SEO 관련
  items.push({
    id: 'seo-1',
    text: '본문 중간에 키워드 2-3회 반복',
    importance: 'recommended'
  });
  
  items.push({
    id: 'seo-2',
    text: '마무리 문단에 키워드 포함',
    importance: 'recommended',
    example: `"${keyword} 정보가 도움이 되셨길 바랍니다."`
  });
  
  // 경쟁력 기반 추가 팁
  if (analysis.competitionScore >= 70) {
    items.push({
      id: 'tip-1',
      text: '지금 바로 발행해도 상위노출 가능!',
      importance: 'optional'
    });
  } else if (analysis.competitionScore < 40) {
    items.push({
      id: 'tip-1',
      text: '경쟁 치열 - 본문 3,000자 이상 권장',
      importance: 'must'
    });
    items.push({
      id: 'tip-2',
      text: '경쟁 치열 - 이미지 10장 이상 권장',
      importance: 'recommended'
    });
  }
  
  return {
    title: '상위노출 체크리스트',
    items
  };
}

/**
 * 추천 글 구조 생성
 */
function generateRecommendedStructure(keyword: string, analysis: KeywordAnalysisResult): { title: string; sections: StructureSection[] } {
  const sections: StructureSection[] = [
    {
      name: '도입부',
      purpose: '독자 관심 끌기 & 키워드 첫 등장',
      recommendedLength: 200,
      keyPoints: [
        `"${keyword}"가 왜 중요한지 설명`,
        '독자의 고민이나 니즈 언급',
        '이 글에서 얻을 수 있는 정보 미리보기'
      ]
    },
    {
      name: '핵심 정보 1',
      purpose: '가장 중요한 정보 전달',
      recommendedLength: 400,
      keyPoints: [
        `${keyword}의 핵심 특징/장점`,
        '구체적인 수치나 사례',
        '이미지로 시각적 설명'
      ]
    },
    {
      name: '핵심 정보 2',
      purpose: '비교/분석 정보',
      recommendedLength: 400,
      keyPoints: [
        '다른 제품/서비스와 비교',
        '장단점 분석',
        '표나 리스트 활용'
      ]
    },
    {
      name: '실제 경험/후기',
      purpose: '신뢰성 확보',
      recommendedLength: 300,
      keyPoints: [
        '직접 사용 경험 공유',
        '실제 사진 첨부',
        '솔직한 장단점'
      ]
    },
    {
      name: '마무리 & 추천',
      purpose: '정리 및 행동 유도',
      recommendedLength: 200,
      keyPoints: [
        `${keyword} 핵심 포인트 요약`,
        '어떤 사람에게 추천하는지',
        '관련 키워드 추가 언급'
      ]
    }
  ];
  
  return {
    title: '추천 글 구조',
    sections
  };
}

/**
 * 프로 팁 생성
 */
function generateProTips(analysis: KeywordAnalysisResult): string[] {
  const tips: string[] = [];
  
  // 경쟁력 기반 팁
  if (analysis.competitionScore >= 70) {
    tips.push('🟢 경쟁력 높음! 기본에 충실하면 상위노출 가능합니다.');
  } else if (analysis.competitionScore >= 50) {
    tips.push('🟡 퀄리티로 승부하세요. 이미지, 본문 길이에 신경 쓰세요.');
  } else {
    tips.push('🔴 경쟁 치열! 롱테일 키워드로 먼저 진입 후 메인 키워드 도전을 추천합니다.');
  }
  
  // 발행 시간 팁
  tips.push('⏰ 오전 6-8시 또는 오후 8-10시에 발행하면 노출에 유리합니다.');
  
  // 이웃 소통 팁
  tips.push('💬 발행 후 1시간 이내 5-10개의 공감/댓글이 있으면 노출에 도움됩니다.');
  
  // 시리즈 팁
  tips.push('📚 같은 주제로 시리즈 글을 작성하면 체류시간이 늘어 유리합니다.');
  
  // 더 쉬운 키워드 추천
  if (analysis.easierKeywords && analysis.easierKeywords.length > 0) {
    const easiest = analysis.easierKeywords[0];
    tips.push(`💡 "${easiest.keyword}"로 먼저 상위노출 후 메인 키워드 도전을 추천합니다.`);
  }
  
  return tips;
}
