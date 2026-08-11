import { describe, expect, it } from 'vitest';
import { productCoreKeyword } from '../product-core-keyword';

/**
 * 전부 실측 상품명이다 — 2026-08-12 쿠팡 베스트셀러·브랜드커넥트 캠페인에서 그대로 가져왔다.
 * 여기가 틀리면 그 아래 모든 실측(검색량·문서수·정면)이 엉뚱한 검색어를 잰다.
 */

describe('productCoreKeyword — 파는 물건이 검색어에 남아야 한다', () => {
    it('끝에 수식어를 몰아 쓴 상품명에서 품목을 건져낸다', () => {
        // 옛 규칙(뒤 어절 2개)은 '오아 음이온 저소음' 을 냈다 — 뭘 파는지 사라졌다.
        expect(productCoreKeyword('오아 에어리소닉 BLDC 플라즈마 헤어 드라이기 항공모터 고속 드라이어 음이온 저소음'))
            .toBe('오아 헤어 드라이기');
    });

    it('품목이 여러 번 나오면 뒤쪽(머리말)을 쓴다', () => {
        // 앞부터 찾으면 '기저귀'가 잡혀 봉투가 사라진다 — 거짓 "자리 있음"의 원인이었다.
        expect(productCoreKeyword('매직캔 280 그린 로고리필 기저귀 쓰레기봉투, 20매'))
            .toBe('매직캔 기저귀 쓰레기봉투');
    });

    it('바로 앞 수식어를 살린다 — 기저귀 봉투와 그냥 봉투는 다른 물건이다', () => {
        expect(productCoreKeyword('오아 클린이워터B-UV 휴대용 무선 구강세정기 물치실 치아세정기'))
            .toBe('오아 무선 구강세정기');
    });

    it('모델명·숫자·색상은 버린다 — 사람이 그걸로 검색하지 않는다', () => {
        expect(productCoreKeyword('크리넥스 안심 3겹 키친타올')).toBe('크리넥스 키친타올');
        expect(productCoreKeyword('불스원 Rain OK 에탄올 3in1 발수코팅 워셔액')).toBe('불스원 발수코팅 워셔액');
    });

    it('규격이 붙은 품목은 어절째 쓴다', () => {
        expect(productCoreKeyword('에너자이저 맥스 AAA건전지, 8개입')).toContain('AAA건전지');
    });

    /*
     * 상품명 끝에 몰아 붙인 검색어를 물면 안 된다 (2026-08-11 실측, 브랜드커넥트).
     * 뒤에서부터 찾던 규칙이 '수영장'을 물어 드라이기가 수영장이 됐다.
     * 이대로 화면에 나가면 "여행용 수영장으로 글 쓰세요" 가 된다.
     */
    it('끝에 몰아 붙인 검색어를 품목으로 착각하지 않는다', () => {
        expect(productCoreKeyword('오아 소닉플로우 미니 드라이기 고속 BLDC 헤어 드라이어 음이온 초경량 휴대용 여행용 수영장'))
            .toBe('오아 미니 드라이기');
    });

    it('앞에 나온 진짜 품목을 쓴다 — 손풍기가 아니라 선풍기', () => {
        expect(productCoreKeyword('오아 아이스볼트맥스 휴대용 선풍기 미니 급속 냉각 BLDC 핸디 핸드 손풍기'))
            .toBe('오아 휴대용 선풍기');
    });
});

describe('productCoreKeyword — 사전에 없을 때', () => {
    it('짧은 이름은 그대로 둔다', () => {
        expect(productCoreKeyword('니체의 초월자')).toBe('니체의 초월자');
    });

    it('품목을 못 찾으면 뒤쪽 의미 어절로 떨어뜨린다 — 빈손보다 낫다', () => {
        const out = productCoreKeyword('브랜드 알수없는 신기한 무언가 특별판');
        expect(out.startsWith('브랜드')).toBe(true);
        expect(out.length).toBeGreaterThan(3);
    });

    it('15자를 넘기지 않는다 — 검색광고가 힌트를 자르면 남의 연관어가 온다', () => {
        const out = productCoreKeyword('아주긴브랜드이름 엄청나게긴수식어구절 초대형 프리미엄 공기청정기');
        expect(out.replace(/\s+/g, '').length).toBeLessThanOrEqual(15);
    });
});
