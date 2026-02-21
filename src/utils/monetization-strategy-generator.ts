/**
 * 💎 LEWORD PRO 2.0: 수익화 전략 생성기 (Monetization Strategy Generator)
 * 
 * 키워드의 특성을 분석하여 최적의 수익 경로와 네이버-워드프레스 전략을 설계합니다.
 */

export interface MonetizationBlueprint {
    type: 'TRAFFIC_MAGNET' | 'BRIDGE_BUILDER' | 'CASH_COW' | 'NICHE_SNIPER';
    name: string; // Changed from typeLabel
    revenuePath: string[];
    hookSentence: string;
    wpBridgeStrategy: {
        strategy: string; // Changed from approach
        dangerLevel: 'low' | 'medium' | 'high';
        safetyTip: string;
        successProbability: number; // New field
    };
    actionPlan: string[];
    estimatedValue: string;
}

export class MonetizationStrategyGenerator {
    /**
     * 키워드 기반 수익화 블루프린트 생성
     */
    public static generate(
        keyword: string,
        searchVolume: number,
        documentCount: number,
        intent: string
    ): MonetizationBlueprint {
        const kw = keyword.toLowerCase();
        const ratio = documentCount > 0 ? searchVolume / documentCount : searchVolume;

        // 1. 유형 결정
        let type: MonetizationBlueprint['type'] = 'TRAFFIC_MAGNET';

        // CPA 고수익 패턴 (렌탈, 보험, 대출 등)
        const isCPA = /렌탈|대출|보험|카드|통신사|인터넷사은품|상담|가입|신청|가격비교|최저가|비교추천/.test(kw);
        const isPurchaseIntent = /구매|할인|쿠팡|추천순위|리뷰|후기/.test(kw);

        if (isCPA || intent === 'price' || intent === 'apply' || isPurchaseIntent) {
            type = 'CASH_COW';
        } else if (ratio > 10 && documentCount < 5000) {
            type = 'NICHE_SNIPER';
        } else if (searchVolume > 5000) {
            type = 'TRAFFIC_MAGNET';
        } else {
            type = 'BRIDGE_BUILDER';
        }

        // 2. 블루프린트 구성
        switch (type) {
            case 'CASH_COW':
                return this.buildCashCow(keyword, searchVolume, isCPA);
            case 'NICHE_SNIPER':
                return this.buildNicheSniper(keyword, searchVolume, ratio);
            case 'BRIDGE_BUILDER':
                return this.buildBridgeBuilder(keyword);
            default:
                return this.buildTrafficMagnet(keyword, searchVolume);
        }
    }

    private static buildCashCow(keyword: string, sv: number, isCPA: boolean): MonetizationBlueprint {
        const valueText = isCPA
            ? 'CPA 초고수익 (건당 5~15만원 잠재)'
            : (sv > 1000 ? '고수익 (월 30만원 이상 잠재)' : '중수익 (월 10만원 내외)');

        const cpaStrategy = isCPA
            ? '1. 네이버 블로그: 실제 필요 상황(Problem) 제시 후 해결책(Solution)으로 렌탈/가입 유도\n2. 혜택 강조: "지금 신청하면 00만원 사은품" 등의 문구로 클릭 유도'
            : '1. 네이버 블로그: 제품 실사용 후기/비교로 신뢰 확보\n2. 본문 하단: 상세 스펙 및 최저가 확인 버튼 배치';

        return {
            type: 'CASH_COW',
            name: isCPA ? '💎 초고수익 CPA 잭팟' : '💰 고수익 캐시카우',
            revenuePath: [
                cpaStrategy,
                '3. 워드프레스: 상세 비교 및 쿠팡 파트너스/제휴마케팅 링크 연결',
                '4. 전환: 워드프레스 애드센스 수익 + 제휴 수수료 더블 수익'
            ],
            hookSentence: isCPA
                ? `"${keyword} 혜택이 매달 바뀌는데, 이번 달이 역대급이네요. 사은품 다 챙기는 법 정리했습니다."`
                : `"${keyword} 요즘 난리인데, 진짜 가성비 모델은 따로 있더라고요. 직접 비교해봤습니다."`,
            wpBridgeStrategy: {
                strategy: isCPA ? '전문 상담 랜딩 페이지 (Lead Gen)' : '제품 상세 비교 페이지 (Comparison)',
                dangerLevel: 'medium',
                safetyTip: '네이버에는 직접 링크보다 "댓글 확인" 또는 "본문 중간 이미지 링크"를 활용하세요.',
                successProbability: isCPA ? 65 : 75
            },
            actionPlan: [
                isCPA ? '네이버: 업체별 사은품/혜택 비교표 작성' : '네이버: 장단점 위주로 정보성 글 작성',
                'WP: 실제 수익 페이지(Review/Lead)로 유입 유도',
                isCPA ? '전환 강조를 위해 카톡 오픈채팅/비밀댓글 유도 병행' : '쇼핑 연계 키워드로 2차 확장'
            ],
            estimatedValue: valueText
        };
    }

    private static buildBridgeBuilder(keyword: string): MonetizationBlueprint {
        return {
            type: 'BRIDGE_BUILDER',
            name: '🌉 워드프레스 브릿지 전략',
            revenuePath: [
                '1. 네이버 블로그: 핵심 정보의 70%만 제공 (궁금증 유발)',
                '2. 상세 브릿지: "전체 리스트/상세 가이드 보기" 링크 제공',
                '3. 워드프레스: 고단가 애드센스 광고가 배치된 상세 페이지',
                '4. 장기화: 외부유입 트래픽으로 워드프레스 도메인 점수(DA) 상승'
            ],
            hookSentence: `"${keyword} 핵심만 정리했습니다. 000까지 포함된 전체 리스트는 아래 상세 가이드를 참고하세요."`,
            wpBridgeStrategy: {
                strategy: '상세 가이드 연동 (Deep Dive)',
                dangerLevel: 'low',
                safetyTip: '네이버 블로그 지수를 위해 워드프레스 메인 주소보다는 특정 포스트 URL을 사용하세요.',
                successProbability: 92
            },
            actionPlan: [
                '네이버: 가독성 좋은 요약본(카드뉴스 등) 활용',
                'WP: PDF 다운로드 또는 전문성 높은 텍스트 배치',
                'SNS(X, 카톡)에도 동일 링크 공유로 트래픽 다각화'
            ],
            estimatedValue: '애드센스 극대화 (체류시간 증대 전략)'
        };
    }

    private static buildNicheSniper(keyword: string, sv: number, ratio: number): MonetizationBlueprint {
        return {
            type: 'NICHE_SNIPER',
            name: '🎯 니치 마켓 스나이퍼',
            revenuePath: [
                '1. 네이버: 경쟁이 없는 키워드로 상위 1~3위 즉시 점유',
                '2. 점유 유지: 관련 롱테일 키워드로 시리즈 글 연동',
                '3. 수익화: 해당 키워드 전용 제휴 상품(디지털 상품 등) 노출',
                '4. 확장: 자동화 도구로 유사 니치 키워드 10개 동시 폭격'
            ],
            hookSentence: `"${keyword} 아무도 알려주지 않는 3가지 비밀, 제가 먼저 공개합니다."`,
            wpBridgeStrategy: {
                strategy: '마이크로 니치 랜딩 (Micro Landing)',
                dangerLevel: 'low',
                safetyTip: '경쟁자가 적으므로 네이버 내부 링크(전체공개 카페 등)를 거쳐 워드프레스로 보내면 더 안전합니다.',
                successProbability: 88
            },
            actionPlan: [
                '즉시 발행 (경쟁자 유입 전 선점)',
                '연관 롱테일 키워드 3개 이상 본문 포함',
                '지식iN/카페 답변에 해당 글 링크 배포'
            ],
            estimatedValue: `블루오션 지수 ${Math.round(ratio)} (선점 시 독점 수익)`
        };
    }

    private static buildTrafficMagnet(keyword: string, sv: number): MonetizationBlueprint {
        return {
            type: 'TRAFFIC_MAGNET',
            name: '🧲 대량 트래픽 자석 (Magnetic)',
            revenuePath: [
                '1. 네이버 블로그: 실시간 이슈/대중적 키워드로 대량 유입 발생',
                '2. 본문 전략: 광범위한 정보를 제공하며 사이드바/하단에 워드프레스 인기글 링크',
                '3. 워드프레스: 메인 뉴스 키워드와 연계된 "관련 꿀팁" 페이지로 유도',
                '4. 수익: 애드센스 대량 노출 (박리다매형 수익)'
            ],
            hookSentence: `"${keyword} 지금 난리 난 이유, 그리고 우리가 진짜 체크해야 할 것들입니다."`,
            wpBridgeStrategy: {
                strategy: '바이럴 뉴스 연동 (Viral Content)',
                dangerLevel: 'high',
                safetyTip: '트래픽 폭발 시 Naver Bot의 감시가 강화됩니다. 리다이렉트나 중간 페이지를 활용하세요.',
                successProbability: 45
            },
            actionPlan: [
                '실시간 트렌드 탭 상단 노출 목표',
                '이미지 Alt 태그에 핵심 키워드 무조건 삽입',
                '워드프레스에 고단가 전면 광고 배치'
            ],
            estimatedValue: `예상 트래픽 ${sv.toLocaleString()}+ (대량 광고 수익)`
        };
    }
}
