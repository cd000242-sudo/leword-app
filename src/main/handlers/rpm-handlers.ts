// RPM 분석 핸들러
import { ipcMain } from 'electron';
import { getNaverKeywordSearchVolumeSeparate } from '../../utils/naver-datalab-api';
import { EnvironmentManager } from '../../utils/environment-manager';


export function setupRpmHandlers(): void {
  if (!ipcMain.listenerCount('analyze-keyword-rpm')) {
    ipcMain.handle('analyze-keyword-rpm', async (_event, keyword: string) => {
      try {
        console.log(`[RPM-ANALYZER] 키워드 RPM 분석: "${keyword}"`);

        // 🔥 안전하고 실용적인 RPM 카테고리 (위험 부담 없는 키워드)
        const rpmCategories: Record<string, {
          keywords: string[];
          avgCpcKrw: number;  // 평균 CPC (원)
          rpmRange: string;
          cpcRange: string;
          score: number;
          competitionLevel: string;
        }> = {
          '정부지원금/정책': {
            keywords: ['지원금', '보조금', '청년지원', '신혼부부지원', '출산지원금', '육아휴직', '실업급여', '고용보험', '국민연금', '건강보험료', '근로장려금', '자녀장려금', '소상공인지원', '창업지원금', '주거급여', '기초연금', '장애인지원', '재난지원금', '에너지바우처', '문화누리카드'],
            avgCpcKrw: 1500,
            rpmRange: '₩5,000~15,000',
            cpcRange: '₩800~2,000',
            score: 85,
            competitionLevel: '중간'
          },
          '핫이슈/트렌드': {
            keywords: ['트렌드', '인기', '유행', '화제', '핫플', '바이럴', 'MZ세대', '밈', '챌린지', '인스타', '틱톡', '유튜브', '넷플릭스', '드라마', '예능', '아이돌', 'K팝', '연예인', '영화', '웹툰'],
            avgCpcKrw: 1200,
            rpmRange: '₩4,000~12,000',
            cpcRange: '₩600~1,500',
            score: 78,
            competitionLevel: '낮음~중간'
          },
          '생활꿀팁/라이프해킹': {
            keywords: ['꿀팁', '생활팁', '살림', '정리', '수납', '청소', '세탁', '빨래', '요리', '레시피', '집밥', '홈카페', '인테리어', '셀프인테리어', '가전', '가구', '이사', '절약', '알뜰살뜰', '다이소'],
            avgCpcKrw: 1000,
            rpmRange: '₩3,000~10,000',
            cpcRange: '₩500~1,500',
            score: 72,
            competitionLevel: '낮음'
          },
          '쇼핑/리뷰': {
            keywords: ['추천', '리뷰', '후기', '비교', '가성비', '최저가', '할인', '쿠폰', '세일', '직구', '해외직구', '쿠팡', '네이버쇼핑', '무신사', '올리브영', '언박싱', '개봉기', '사용기', '구매팁'],
            avgCpcKrw: 1800,
            rpmRange: '₩5,000~18,000',
            cpcRange: '₩1,000~2,500',
            score: 80,
            competitionLevel: '중간'
          },
          '여행/맛집': {
            keywords: ['여행', '국내여행', '해외여행', '호텔', '숙소', '펜션', '캠핑', '글램핑', '맛집', '카페', '브런치', '디저트', '맛집추천', '핫플레이스', '인스타맛집', '데이트코스', '가볼만한곳', '항공권', '패키지여행'],
            avgCpcKrw: 2000,
            rpmRange: '₩6,000~20,000',
            cpcRange: '₩1,200~3,000',
            score: 82,
            competitionLevel: '중간'
          },
          'IT/가젯': {
            keywords: ['스마트폰', '아이폰', '갤럭시', '노트북', '태블릿', '아이패드', '이어폰', '에어팟', '스마트워치', '애플워치', '갤럭시워치', '게이밍', '키보드', '마우스', '모니터', 'PC조립', '앱추천', '어플'],
            avgCpcKrw: 1600,
            rpmRange: '₩5,000~16,000',
            cpcRange: '₩900~2,200',
            score: 75,
            competitionLevel: '중간'
          },
          '육아/교육': {
            keywords: ['육아', '임신', '출산', '신생아', '이유식', '어린이집', '유치원', '초등학생', '중학생', '고등학생', '학습지', '독서', '교구', '장난감', '키즈카페', '아이옷', '유아용품', '육아템', '맘카페'],
            avgCpcKrw: 1400,
            rpmRange: '₩4,000~14,000',
            cpcRange: '₩800~2,000',
            score: 70,
            competitionLevel: '중간'
          },
          '취미/운동': {
            keywords: ['취미', '운동', '헬스', '홈트', '요가', '필라테스', '러닝', '등산', '골프', '테니스', '수영', '자전거', '캠핑', '낚시', '그림', '사진', '악기', '독서', 'DIY', '공예'],
            avgCpcKrw: 1300,
            rpmRange: '₩4,000~13,000',
            cpcRange: '₩700~1,800',
            score: 68,
            competitionLevel: '낮음~중간'
          },
          '부업/사이드잡': {
            keywords: ['부업', '사이드잡', 'N잡', '재택근무', '재택알바', '블로그수익', '유튜브수익', '애드센스', '쿠팡파트너스', '스마트스토어', '위탁판매', '해외구매대행', '크몽', '탈잉', '클래스101', '온라인강의', '전자책', '굿즈제작'],
            avgCpcKrw: 2200,
            rpmRange: '₩7,000~22,000',
            cpcRange: '₩1,400~3,500',
            score: 88,
            competitionLevel: '중간~높음'
          },
          '자기계발/커리어': {
            keywords: ['자기계발', '습관', '루틴', '시간관리', '생산성', '독서법', '영어공부', '자격증', '이직', '퇴사', '프리랜서', '디지털노마드', '재택', '원격근무', '커리어', '스펙', '포트폴리오', '면접'],
            avgCpcKrw: 1500,
            rpmRange: '₩5,000~15,000',
            cpcRange: '₩800~2,000',
            score: 74,
            competitionLevel: '중간'
          }
        };

        // 🔥 범용적 RPM 추정 로직 - 어떤 키워드든 분석 가능
        let matchedCategory = '일반';
        let rpmScore = 30; // 기본 점수
        let estimatedCpc = '₩500~1,500';
        let rpmRange = '₩2,000~8,000';
        let competitionLevel = '낮음';
        let avgCpcKrw = 800;
        let tips = '';
        const relatedKeywords: string[] = [];

        const lowerKeyword = keyword.toLowerCase();

        // 🔥 1단계: 키워드 특성 분석으로 기본 RPM 점수 계산
        let baseScore = 30;

        // 구매의도 키워드 (높은 RPM)
        const buyIntentWords = ['추천', '비교', '가격', '구매', '구입', '할인', '쿠폰', '최저가', '가성비', '후기', '리뷰', '순위', '베스트', '인기', '랭킹'];
        const hasBuyIntent = buyIntentWords.some(w => lowerKeyword.includes(w));
        if (hasBuyIntent) baseScore += 25;

        // 정보성 키워드 (중간 RPM)
        const infoWords = ['방법', '하는법', '만들기', '뜻', '의미', '종류', '차이', '장단점', '총정리', '정리', '요약'];
        const hasInfoIntent = infoWords.some(w => lowerKeyword.includes(w));
        if (hasInfoIntent) baseScore += 15;

        // 지원금/정책 키워드 (높은 RPM)
        const policyWords = ['지원금', '보조금', '신청', '자격', '조건', '혜택', '급여', '수당', '연금', '보험'];
        const hasPolicyIntent = policyWords.some(w => lowerKeyword.includes(w));
        if (hasPolicyIntent) baseScore += 30;

        // 고가 제품 키워드 (높은 RPM)
        const highValueWords = ['자동차', '아파트', '부동산', '투자', '대출', '보험', '임플란트', '성형', '레이저', '시술'];
        const hasHighValue = highValueWords.some(w => lowerKeyword.includes(w));
        if (hasHighValue) baseScore += 20;

        // 롱테일 키워드 보너스 (3어절 이상)
        const wordCount = keyword.split(' ').length;
        if (wordCount >= 3) baseScore += 10;
        if (wordCount >= 4) baseScore += 5;

        // 연도 포함 키워드 (시의성)
        if (/2024|2025/.test(keyword)) baseScore += 5;

        rpmScore = Math.min(95, baseScore);

        // 정확한 매칭 우선
        for (const [category, data] of Object.entries(rpmCategories)) {
          let matchScore = 0;
          let matchedKw = '';

          for (const kw of data.keywords) {
            // 정확히 포함되는 경우
            if (lowerKeyword.includes(kw)) {
              const score = kw.length; // 더 긴 키워드가 더 정확한 매칭
              if (score > matchScore) {
                matchScore = score;
                matchedKw = kw;
              }
            }
            // 키워드가 검색어의 일부인 경우
            if (kw.includes(lowerKeyword) && lowerKeyword.length >= 2) {
              const score = lowerKeyword.length * 0.8;
              if (score > matchScore) {
                matchScore = score;
                matchedKw = kw;
              }
            }
          }

          if (matchScore > 0) {
            matchedCategory = category;
            avgCpcKrw = data.avgCpcKrw;
            // 키워드 특수성에 따라 점수 조정
            const specificityBonus = matchedKw.length > 4 ? 5 : 0;
            rpmScore = data.score + specificityBonus;
            estimatedCpc = data.cpcRange;
            rpmRange = data.rpmRange;
            competitionLevel = data.competitionLevel;

            // 관련 키워드 추천 (같은 카테고리에서 랜덤 5개)
            const shuffled = [...data.keywords].sort(() => Math.random() - 0.5);
            relatedKeywords.push(...shuffled.slice(0, 5).filter(k => k !== keyword && !lowerKeyword.includes(k)));

            // 카테고리별 상세 팁 (안전하고 실용적인 카테고리)
            const categoryTips: Record<string, string> = {
              '정부지원금/정책': '💵 지원금 키워드는 검색량 폭발 분야!\n• 신청 자격 요건 상세 안내\n• 신청 방법 단계별 가이드\n• 신청 기간 및 마감일 강조\n• 실제 수령 후기가 효과적',
              '핫이슈/트렌드': '🔥 트렌드 키워드는 타이밍이 생명!\n• 빠른 발행이 핵심 (속보성)\n• SNS 반응 캡처 활용\n• 관련 밈/짤 함께 소개\n• 시리즈물로 구독 유도',
              '생활꿀팁/라이프해킹': '✨ 꿀팁 키워드는 실용성이 핵심!\n• 비포/애프터 사진 필수\n• 구체적인 방법 단계별 설명\n• 비용 절감 효과 강조\n• 다이소/저렴한 대안 소개',
              '쇼핑/리뷰': '🛒 리뷰 키워드는 신뢰가 핵심!\n• 실제 구매 인증 필수\n• 장단점 솔직하게 비교\n• 가격 비교표 제공\n• 쿠폰/할인 정보 포함',
              '여행/맛집': '✈️ 여행 키워드는 생생함이 핵심!\n• 직접 촬영한 고화질 사진\n• 상세 위치/가격 정보\n• 실패 없는 코스 추천\n• 계절/시즌별 팁 제공',
              'IT/가젯': '📱 가젯 키워드는 스펙 비교가 핵심!\n• 상세 스펙 비교표 작성\n• 실사용 후기 중심\n• 가격대별 추천 제품\n• 구매 시기/채널 안내',
              '육아/교육': '👶 육아 키워드는 공감이 핵심!\n• 실제 경험담 중심\n• 연령별 맞춤 정보\n• 가성비 좋은 제품 추천\n• 안전/검증된 정보 강조',
              '취미/운동': '🏃 취미 키워드는 입문자 친화적으로!\n• 초보자 가이드 제공\n• 필수 장비/비용 안내\n• 추천 장소/클래스\n• 실력 향상 팁 공유',
              '부업/사이드잡': '💼 부업 키워드는 현실적인 수익 공개!\n• 실제 수익 인증 필수\n• 시작 방법 상세 안내\n• 소요 시간/난이도 명시\n• 주의사항 솔직하게 공유',
              '자기계발/커리어': '📚 자기계발은 실천 가능한 팁이 핵심!\n• 구체적인 액션 플랜 제공\n• 성공/실패 사례 공유\n• 추천 자료/툴 소개\n• 루틴 템플릿 제공'
            };
            tips = categoryTips[category] || tips;
            break;
          }
        }

        // 🔥 2단계: 카테고리 매칭이 안 된 경우 범용적 RPM 계산
        if (matchedCategory === '일반') {
          // RPM 점수에 따른 CPC/RPM 범위 동적 계산
          if (rpmScore >= 70) {
            avgCpcKrw = 1500;
            estimatedCpc = '₩1,000~2,500';
            rpmRange = '₩5,000~18,000';
            competitionLevel = '중간~높음';
            matchedCategory = hasBuyIntent ? '구매의도 키워드' : hasPolicyIntent ? '정책/지원금' : hasHighValue ? '고가 서비스' : '고수익 키워드';
          } else if (rpmScore >= 50) {
            avgCpcKrw = 1000;
            estimatedCpc = '₩600~1,500';
            rpmRange = '₩3,000~12,000';
            competitionLevel = '중간';
            matchedCategory = hasInfoIntent ? '정보성 키워드' : '중수익 키워드';
          } else {
            avgCpcKrw = 600;
            estimatedCpc = '₩300~800';
            rpmRange = '₩1,500~6,000';
            competitionLevel = '낮음';
            matchedCategory = '일반 키워드';
          }

          // 범용 팁 생성
          const universalTips: string[] = [];
          if (hasBuyIntent) universalTips.push('💰 구매의도 키워드! 비교표와 가격 정보를 상세히 제공하세요.');
          if (hasInfoIntent) universalTips.push('📖 정보성 키워드! 단계별 가이드와 꿀팁을 제공하세요.');
          if (hasPolicyIntent) universalTips.push('📋 지원금 키워드! 신청 자격과 방법을 상세히 안내하세요.');
          if (hasHighValue) universalTips.push('💎 고가 서비스 키워드! 상세 비교와 실제 경험담이 효과적입니다.');
          if (wordCount >= 3) universalTips.push('🎯 롱테일 키워드! 구체적인 니즈에 맞는 상세한 정보를 제공하세요.');
          if (universalTips.length === 0) universalTips.push('💡 일반 키워드입니다. 롱테일 확장으로 경쟁력을 높이세요.');

          tips = universalTips.join('\n');
        }

        // 검색량 조회 (API 키가 있으면)
        let searchVolume: number | null = null;
        try {
          const envManager = EnvironmentManager.getInstance();
          const env = envManager.getConfig();
          const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
          const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

          if (naverClientId && naverClientSecret) {
            const volumeData = await getNaverKeywordSearchVolumeSeparate({
              clientId: naverClientId,
              clientSecret: naverClientSecret
            }, [keyword]);

            if (volumeData && volumeData[0]) {
              const pc = volumeData[0].pcSearchVolume ?? null;
              const mobile = volumeData[0].mobileSearchVolume ?? null;
              searchVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
            }
          }
        } catch (e) {
          console.warn('[RPM-ANALYZER] 검색량 조회 실패:', e);
        }

        // 예상 월 수익 계산 (CTR 2%, RPM 기준)
        const searchVolumeForCalc = searchVolume ?? 0;
        const estimatedMonthlyViews = searchVolumeForCalc * 30 * 0.1; // 검색량의 10%가 유입된다고 가정
        const estimatedMonthlyRevenue = Math.round(estimatedMonthlyViews / 1000 * avgCpcKrw * 3); // 평균 CTR 고려

        console.log(`[RPM-ANALYZER] ✅ 분석 완료: ${matchedCategory}, RPM 점수: ${rpmScore}, 검색량: ${searchVolumeForCalc}`);

        return {
          success: true,
          keyword,
          category: matchedCategory,
          rpmScore: Math.min(100, Math.max(0, rpmScore)),
          estimatedCpc,
          rpmRange,
          competitionLevel,
          searchVolume,
          estimatedMonthlyRevenue: estimatedMonthlyRevenue > 0 ? `₩${estimatedMonthlyRevenue.toLocaleString()}` : '데이터 없음',
          relatedKeywords,
          tips
        };

      } catch (error: any) {
        console.error('[RPM-ANALYZER] ❌ 오류:', error);
        return {
          error: true,
          message: error.message || 'RPM 분석 중 오류가 발생했습니다.'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ analyze-keyword-rpm 핸들러 등록 완료');
  }

  if (!ipcMain.listenerCount('discover-high-rpm-keywords')) {
    ipcMain.handle('discover-high-rpm-keywords', async (_event, category: string) => {
      try {
        console.log(`[RPM-DISCOVER] 고수익 키워드 발굴: ${category}`);

        // 🔥 안전하고 실용적인 고수익 키워드 (위험 부담 없음)
        const categoryData: Record<string, {
          seeds: string[];
          baseScore: number;
          cpcRange: string;
          avgCpcKrw: number;
        }> = {
          finance: {
            seeds: ['청년내일저축계좌', '근로장려금 신청', '자녀장려금 자격', '주거급여 신청', '기초연금 수급자격', '실업급여 신청방법', '출산지원금 신청', '육아휴직급여', '청년희망적금', '청년도약계좌', '소상공인 지원금', '에너지바우처 신청', '문화누리카드 사용처', '국민연금 조기수령', '건강보험료 환급'],
            baseScore: 85,
            cpcRange: '₩800~2,000',
            avgCpcKrw: 1500
          },
          insurance: {
            seeds: ['요즘 핫한 키워드', '실시간 검색어', 'MZ세대 트렌드', '틱톡 챌린지', '인스타 핫플', '넷플릭스 신작', '카카오톡 이모티콘', '쿠팡 로켓와우', 'K드라마 추천', '유튜브 쇼츠', '오늘의 밈', '바이럴 영상', '인기 예능', '화제의 연예인', 'SNS 트렌드'],
            baseScore: 78,
            cpcRange: '₩600~1,500',
            avgCpcKrw: 1200
          },
          realestate: {
            seeds: ['생활꿀팁', '청소 꿀팁', '정리정돈 방법', '수납 아이디어', '세탁 꿀팁', '요리 레시피', '집밥 메뉴', '다이소 추천템', '이케아 가구', '자취 필수템', '신혼집 인테리어', '원룸 꾸미기', '냉장고 정리', '옷장 정리', '계절별 살림팁'],
            baseScore: 72,
            cpcRange: '₩500~1,500',
            avgCpcKrw: 1000
          },
          legal: {
            seeds: ['쿠팡 최저가', '네이버쇼핑 할인', '무신사 세일', '올리브영 추천템', '다이소 신상', '가성비 가전', '해외직구 방법', '아이허브 추천', '알리익스프레스 꿀템', '블프 세일', '추석 선물 추천', '크리스마스 선물', '생일선물 추천', '가전제품 리뷰', '화장품 추천'],
            baseScore: 80,
            cpcRange: '₩1,000~2,500',
            avgCpcKrw: 1800
          },
          health: {
            seeds: ['국내여행 추천', '제주도 맛집', '부산 핫플', '서울 데이트코스', '캠핑장 추천', '글램핑 후기', '호텔 추천', '에어비앤비 후기', '해외여행 준비물', '일본여행 꿀팁', '동남아 여행지', '유럽 배낭여행', '맛집 추천', '카페 추천', '브런치 맛집'],
            baseScore: 82,
            cpcRange: '₩1,200~3,000',
            avgCpcKrw: 2000
          },
          education: {
            seeds: ['아이폰 꿀팁', '갤럭시 추천', '노트북 추천', '태블릿 비교', '무선이어폰 추천', '스마트워치 비교', '게이밍 마우스', '기계식키보드 추천', '모니터 추천', '맥북 vs 윈도우', '아이패드 활용법', '앱 추천', '어플 추천', 'AI 서비스 추천', 'PC 조립 가이드'],
            baseScore: 75,
            cpcRange: '₩900~2,200',
            avgCpcKrw: 1600
          },
          auto: {
            seeds: ['육아템 추천', '신생아 용품', '이유식 레시피', '어린이집 준비물', '초등학생 학용품', '키즈카페 추천', '아이와 가볼만한곳', '장난감 추천', '아이 책 추천', '육아 꿀팁', '워킹맘 팁', '맘카페 인기템', '아기옷 브랜드', '유아용품 가성비', '돌잔치 준비'],
            baseScore: 70,
            cpcRange: '₩800~2,000',
            avgCpcKrw: 1400
          },
          tech: {
            seeds: ['블로그 수익', '유튜브 수익 공개', '애드센스 승인', '쿠팡파트너스 수익', '스마트스토어 창업', '위탁판매 후기', '전자책 출판', '크몽 부업', '재택 알바', 'N잡러 후기', '투잡 추천', '주말 부업', '온라인 강의 만들기', '굿즈 판매', '해외 구매대행'],
            baseScore: 88,
            cpcRange: '₩1,400~3,500',
            avgCpcKrw: 2200
          }
        };

        const data = categoryData[category] || categoryData.finance;

        // 환경변수에서 네이버 API 키 로드
        const envManager = EnvironmentManager.getInstance();
        const env = envManager.getConfig();
        const naverClientId = env.naverClientId || process.env['NAVER_CLIENT_ID'] || '';
        const naverClientSecret = env.naverClientSecret || process.env['NAVER_CLIENT_SECRET'] || '';

        const keywords: Array<{
          keyword: string;
          searchVolume: number | null;
          rpmScore: number;
          estimatedCpc: string;
          estimatedRevenue: string;
        }> = [];

        // 각 시드 키워드에 대해 검색량 조회
        for (const seed of data.seeds) {
          try {
            let searchVolume: number | null = null;

            if (naverClientId && naverClientSecret) {
              try {
                const volumeData = await getNaverKeywordSearchVolumeSeparate({
                  clientId: naverClientId,
                  clientSecret: naverClientSecret
                }, [seed]);

                if (volumeData && volumeData[0]) {
                  const pc = volumeData[0].pcSearchVolume ?? null;
                  const mobile = volumeData[0].mobileSearchVolume ?? null;
                  searchVolume = (pc !== null || mobile !== null) ? ((pc ?? 0) + (mobile ?? 0)) : null;
                }
              } catch (e) {
                console.warn(`[RPM-DISCOVER] 검색량 조회 실패 (${seed}):`, e);
              }
            }

            // 검색량에 따른 RPM 점수 보정
            const searchVolumeForCalc = searchVolume ?? 0;
            let scoreBonus = 0;
            if (searchVolumeForCalc > 50000) scoreBonus = 5;
            else if (searchVolumeForCalc > 20000) scoreBonus = 3;
            else if (searchVolumeForCalc > 5000) scoreBonus = 1;
            else if (searchVolumeForCalc < 1000 && searchVolumeForCalc > 0) scoreBonus = -3;

            const rpmScore = Math.min(100, Math.max(0, data.baseScore + scoreBonus + Math.floor(Math.random() * 6) - 3));

            // 예상 월 수익 계산
            const monthlyViews = searchVolumeForCalc * 30 * 0.1;
            const monthlyRevenue = Math.round(monthlyViews / 1000 * data.avgCpcKrw * 3);

            keywords.push({
              keyword: seed,
              searchVolume,
              rpmScore,
              estimatedCpc: data.cpcRange,
              estimatedRevenue: monthlyRevenue > 0 ? `₩${monthlyRevenue.toLocaleString()}` : '-'
            });

            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            console.warn(`[RPM-DISCOVER] 키워드 처리 실패 (${seed}):`, e);
          }
        }

        // RPM 점수 + 검색량 기준 정렬
        keywords.sort((a, b) => {
          const aVol = typeof a.searchVolume === 'number' ? a.searchVolume : null;
          const bVol = typeof b.searchVolume === 'number' ? b.searchVolume : null;
          const scoreA = a.rpmScore * 0.6 + Math.min(100, (aVol ?? 0) / 500) * 0.4;
          const scoreB = b.rpmScore * 0.6 + Math.min(100, (bVol ?? 0) / 500) * 0.4;
          return scoreB - scoreA;
        });

        console.log(`[RPM-DISCOVER] ✅ ${keywords.length}개 고수익 키워드 발굴 완료`);

        return {
          success: true,
          category,
          keywords
        };

      } catch (error: any) {
        console.error('[RPM-DISCOVER] ❌ 오류:', error);
        return {
          error: true,
          message: error.message || '키워드 발굴 중 오류가 발생했습니다.'
        };
      }
    });
    console.log('[KEYWORD-MASTER] ✅ discover-high-rpm-keywords 핸들러 등록 완료');
  }

}
