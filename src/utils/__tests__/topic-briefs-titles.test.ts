import { describe, expect, it } from 'vitest';
import { sanitizeTitles } from '../topic-briefs';

/**
 * 제목 후보 다듬기 — 사장님 2026-09-10 "제목도 같이 보여주면 더 좋잖아, 여러 가지 유형으로".
 * 교리(feedback_home_title_doctrine): AI 가 쓴 티가 나면 네이버가 제목에서 잡아 노출이 죽는다.
 * 모델은 시켜도 자꾸 그 말을 쓰므로 여기서 거른다.
 */
const t = (type: string, text: string) => ({ type, text });
const MAIN = '주담대 한 달 새 4조3000억 증가, 왜 늘었나';

describe('제목 후보 다듬기', () => {
    it('유형과 글을 그대로 담아 준다', () => {
        const got = sanitizeTitles([
            t('질문형', '주담대가 갑자기 늘어난 이유가 뭘까요'),
            t('경험형', '주담대 갈아타기 해보니 이렇더라고요'),
        ], MAIN);
        expect(got).toEqual([
            { type: '질문형', text: '주담대가 갑자기 늘어난 이유가 뭘까요' },
            { type: '경험형', text: '주담대 갈아타기 해보니 이렇더라고요' },
        ]);
    });

    it('AI 티 나는 말이 든 제목은 버린다', () => {
        for (const bad of ['주담대 증가 이유 총정리', '주담대 한눈에 알아보자', '주담대 급증 충격 실화', '주담대 늘어난 이유 완벽정리']) {
            expect(sanitizeTitles([t('정리형', bad)], MAIN)).toEqual([]);
        }
    });

    it('숫자 나열 제목을 버린다 — TOP N · N가지', () => {
        expect(sanitizeTitles([t('정리형', '주담대 줄이는 방법 5가지')], MAIN)).toEqual([]);
        expect(sanitizeTitles([t('정리형', '금리 낮은 은행 TOP 5 정리')], MAIN)).toEqual([]);
    });

    it('쉼표로 두 동강 낸 제목을 버린다', () => {
        // 사장님이 금지한 이분법 — "A, B는?" 꼴.
        expect(sanitizeTitles([t('질문형', '주담대 4조 증가, 왜 늘었을까?')], MAIN)).toEqual([]);
        // 쉼표가 있어도 물음으로 끝나지 않으면 살린다.
        expect(sanitizeTitles([t('정리형', '주담대 4조 늘었고 신용대출도 6천억 늘었습니다')], MAIN)).toHaveLength(1);
    });

    it('본문 제목과 같은 것은 뺀다 — 띄어쓰기만 다른 것도', () => {
        expect(sanitizeTitles([t('정리형', MAIN), t('정리형', MAIN.replace(/\s/g, ''))], MAIN)).toEqual([]);
    });

    it('같은 제목이 두 번 오면 한 번만 담는다', () => {
        const got = sanitizeTitles([
            t('질문형', '주담대가 갑자기 늘어난 이유가 뭘까요'),
            t('정리형', '주담대가 갑자기 늘어난 이유가 뭘까요'),
        ], MAIN);
        expect(got).toHaveLength(1);
    });

    it('너무 짧거나 긴 제목은 버린다', () => {
        expect(sanitizeTitles([t('질문형', '주담대')], MAIN)).toEqual([]);
        expect(sanitizeTitles([t('질문형', '가'.repeat(46))], MAIN)).toEqual([]);
    });

    it('상한만큼만 담는다', () => {
        const many = Array.from({ length: 9 }, (_, i) => t('질문형', `주담대가 늘어난 이유 그 ${i} 번째 이야기`));
        expect(sanitizeTitles(many, MAIN, 4)).toHaveLength(4);
    });

    it('모델이 배열이 아닌 것을 주면 빈 배열이다 — 던지지 않는다', () => {
        expect(sanitizeTitles(undefined, MAIN)).toEqual([]);
        expect(sanitizeTitles('제목', MAIN)).toEqual([]);
        expect(sanitizeTitles([{ text: '' }, null, 3], MAIN)).toEqual([]);
    });

    it('유형이 비어 있으면 기타로 둔다 — 제목 자체는 살린다', () => {
        expect(sanitizeTitles([{ text: '주담대가 갑자기 늘어난 이유가 뭘까요' }], MAIN))
            .toEqual([{ type: '기타', text: '주담대가 갑자기 늘어난 이유가 뭘까요' }]);
    });
});
