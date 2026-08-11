import { describe, expect, it } from 'vitest';
import { referenceRowReason } from '../reference-row-reason';

/**
 * 2군 이유 문장. 규칙은 하나다 — 실측 사실만, 임계값은 절대 안 나간다.
 * 실측값은 2026-08-11 SERP 36건에서 실제로 나온 것들이다.
 */

describe('referenceRowReason — 실측 사실을 말한다', () => {
    it('정면으로 다룬 글 수를 센 대로 말한다', () => {
        // 실측 '우리won cma note' — 상위 10개 중 5개가 정확 일치.
        const out = referenceRowReason({ serp: { sampledTitles: 10, exactTitleHits: 5, partialTitleHits: 4 } });
        expect(out).toBe('상위 10개 중 5개가 이미 정면으로 다뤘습니다');
    });

    it('정면 대응이 없으면 부분 일치를 말한다', () => {
        // 실측 '옷 쉰내 제거 세제' — 정확 0, 부분 10.
        const out = referenceRowReason({ serp: { sampledTitles: 10, exactTitleHits: 0, partialTitleHits: 10 } });
        expect(out).toBe('상위 10개 중 10개가 비슷한 내용을 다뤘습니다');
    });

    it('검색결과를 못 읽었으면 그렇게 말한다', () => {
        const out = referenceRowReason({ undetermined: true, searchVolume: 430, serp: null });
        expect(out).toContain('월 검색량 430회');
        expect(out).toContain('확인하지 못했습니다');
    });

    it('문서수를 못 잰 것은 무경쟁이 아니라 측정 실패다', () => {
        expect(referenceRowReason({ documentCount: 0, serp: null })).toBe('블로그 문서 수를 재지 못했습니다');
    });

    it('말할 근거가 없으면 아무 말도 안 한다', () => {
        expect(referenceRowReason({ serp: null })).toBe('');
    });
});

describe('referenceRowReason — 임계값은 절대 안 나간다', () => {
    /*
     * 화면에 우리 내부 숫자가 나가면 판단 근거가 통째로 공개되고,
     * 게이트를 바꿀 때마다 문구가 흔들린다.
     */
    it('비율·하한·게이트 같은 내부 용어가 문장에 없다', () => {
        const cases = [
            { serp: { sampledTitles: 10, exactTitleHits: 8, partialTitleHits: 0 } },
            { undetermined: true, searchVolume: 140, documentCount: 29721, serp: null },
            { documentCount: 0, serp: null },
            { searchVolume: 630, documentCount: 10432, serp: null },
        ];
        for (const input of cases) {
            const out = referenceRowReason(input);
            for (const banned of ['비율', '하한', '미달', '게이트', '임계']) {
                expect(out).not.toContain(banned);
            }
        }
    });

    it('문서수를 문장에 쓰지 않는다 — broad 매치라 경쟁을 과장한다', () => {
        // 실측: 문서 10,432 인 '이케아 옷정리함' 의 정면 대응은 0건이었다.
        const out = referenceRowReason({ searchVolume: 630, documentCount: 10432, serp: null });
        expect(out).not.toContain('10,432');
    });
});
