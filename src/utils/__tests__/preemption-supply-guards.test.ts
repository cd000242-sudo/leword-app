import { describe, expect, it } from 'vitest';
import { judgeEphemeralKeyword, judgeRestrictedKeyword } from '../preemption-supply-guards';
import { BLOG_TOPIC_COVERAGE } from '../blog-topic-coverage';

/**
 * 공급 유통기한 가드 — "쓰는 순간부터 부패하는" 키워드를 BD 태우기 전에 거른다.
 *
 * 2026-08-14 회차 실측: 35행 중 5행이 무대인사 일정·재방송 편성표·서버 점검
 * 시간류였다. 이런 키워드는 자리가 비어 있어도 글의 유통기한이 며칠이라
 * 상위노출로 얻는 것이 없다 — 사장님 판정("나라면 안 쓴다")과 일치.
 * 부패는 확장이 아니라 씨앗에서 시작됐으므로, 씨앗 목록도 같이 고정한다.
 */

describe('유통기한 컷 — 며칠짜리 일정 조회', () => {
    const rotten = [
        '스파이더맨 무대인사 일정',
        '티니핑 영화 무대인사 일정',
        '21세기 대군부인 재방송 편성표',
        '롤체 서버 점검 시간',
        '드라마 첫방송 날짜',
        '예능 결방 이유',
    ];
    for (const keyword of rotten) {
        it(`걸러진다: ${keyword}`, () => {
            const verdict = judgeEphemeralKeyword(keyword);
            expect(verdict.ephemeral).toBe(true);
            expect(verdict.reason.length).toBeGreaterThan(0);
        });
    }

    const durable = [
        '노각무침 황금레시피',
        '민증사진 규칙',
        '콘서트 티켓팅 실패',       // 절차 노하우 — 상시 수요
        '캠핑장 예약 취소 수수료',   // 제도 — 상시 수요
        '해수욕장 개장일',           // 해마다 반복 — 시즌성이지 부패가 아니다
        '토익 접수 일정',            // 연중 반복 접수 — 시즌성
    ];
    for (const keyword of durable) {
        it(`살아남는다: ${keyword}`, () => {
            expect(judgeEphemeralKeyword(keyword).ephemeral).toBe(false);
        });
    }
});

describe('규제 컷 — 불법 시청 유도 검색어', () => {
    it('무료 시청 사이트 유도는 걸러진다', () => {
        // 두 회차 연속 top3 로 통과했던 실측 사례 — 자리가 있어도 쓸 수 없는 글이다.
        expect(judgeRestrictedKeyword('무료 영화 사이트 링크 모음').ephemeral).toBe(true);
        expect(judgeRestrictedKeyword('무료 드라마 다시보기').ephemeral).toBe(true);
        expect(judgeRestrictedKeyword('누누티비 주소').ephemeral).toBe(true);
    });
    it('정상 정보형은 살아남는다', () => {
        expect(judgeRestrictedKeyword('영화관 무료 관람일').ephemeral).toBe(false);
        expect(judgeRestrictedKeyword('무료 영화 예매권 받는법').ephemeral).toBe(false);
        expect(judgeRestrictedKeyword('넷플릭스 무료체험 해지').ephemeral).toBe(false);
    });
});

describe('씨앗 목록에 부패 씨앗이 없다', () => {
    it('SEED_TERMS 전체가 유통기한 컷을 통과한다', () => {
        // 부패는 씨앗에서 시작됐다 — '무대인사 일정'(영화), '재방송 편성표'(드라마),
        // '재방송 편성 시간'(방송), '서버 점검 시간'(게임)이 그대로 씨앗이었다.
        const rottenSeeds: string[] = [];
        for (const entry of BLOG_TOPIC_COVERAGE) {
            for (const term of entry.seedTerms) {
                if (judgeEphemeralKeyword(term).ephemeral) {
                    rottenSeeds.push(`${entry.topic}: ${term}`);
                }
            }
        }
        expect(rottenSeeds).toEqual([]);
    });
});
