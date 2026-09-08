import { describe, expect, it } from 'vitest';
import { extractTitleHeads } from '../news-title-heads';

/**
 * 뉴스 제목에서 작품·프로그램·인물 이름을 뽑는다(2026-09-08).
 *
 * 왜: 방송 15 · 스타·연예인 19 · 드라마 35 — 검색광고 연관어는 광고주 그래프라 이 세
 * 주제엔 콘텐츠 이웃이 없다. 머리말을 광고 어휘가 아니라 **지금 방영 중인 작품·인물**로
 * 바꿔야 하는데 손으로 적으면 일주일이면 낡는다. 연예 뉴스 제목은 작품명을 따옴표로
 * 감싼다('폭싹 속았수다' 아이유 · ‘나혼자산다’ 기안84) — 따옴표 안 말과 "배우 ○○·가수 ○○"
 * 뒤 이름을 뽑으면 창고를 다시 긁을 때마다(월·금) 이름도 같이 갱신된다.
 *
 * 순수 함수. 네트워크 없음. 아래 제목은 연예 뉴스의 전형적 꼴을 흉내낸 것이다.
 */
const HEADLINES = [
    "'폭싹 속았수다' 아이유, 박보검과 재회 눈물…시청률 12% 돌파",
    "아이유·박보검 '폭싹 속았수다' 종영 소감 \"평생 기억\"",
    '‘나혼자산다’ 기안84, 마라톤 완주…시청률 1위',
    "[단독] '나혼자산다' 전현무 하차설 부인",
    "배우 송강, 군 복무 마치고 '드라마 복귀'",
    "가수 아이유가 밝힌 차기작…팬들 '기대'",
    "'선재 업고 튀어' 변우석, 광고 20개 돌파",
    "[포토] 변우석, '선재 업고 튀어' 팬미팅 성료",
    "MBC '놀면 뭐하니?' 유재석, 새 프로젝트 공개",
    "배우 송강 '충격' 근황…팬들 걱정",
];

describe('뉴스 제목 머리말', () => {
    it('두 번 이상 따옴표로 감싸인 작품명을 공백 없이 뽑는다', () => {
        const heads = extractTitleHeads(HEADLINES, { minCount: 2, limit: 20 });
        expect(heads).toContain('폭싹속았수다');
        expect(heads).toContain('나혼자산다');
        expect(heads).toContain('선재업고튀어');
    });

    it('역할 뒤 이름을 뽑고 조사를 뗀다 — 배우 송강 · 가수 아이유가 → 아이유', () => {
        const heads = extractTitleHeads(HEADLINES, { minCount: 2, limit: 20 });
        expect(heads).toContain('송강');
        // '아이유'는 따옴표 밖이지만 역할 패턴 한 번 + 조사 뗀 한 번 = 두 번
        expect(heads).toContain('아이유');
    });

    it('한 번뿐인 따옴표 말·강조어·기사 꼬리표는 뽑지 않는다', () => {
        const heads = extractTitleHeads(HEADLINES, { minCount: 2, limit: 20 });
        for (const noise of ['드라마복귀', '기대', '평생기억', '단독', '포토', '충격']) {
            expect(heads, `${noise} 가 머리말로 나왔다`).not.toContain(noise);
        }
    });

    it('강조어는 여러 번 나와도 뽑지 않는다', () => {
        const repeated = ["배우 A '충격' 고백", "가수 B '충격' 근황", "'충격' 결말…시청자 반응"];
        expect(extractTitleHeads(repeated, { minCount: 2, limit: 20 })).not.toContain('충격');
    });

    it('minCount 1 이면 한 번짜리 작품명도 온다', () => {
        const heads = extractTitleHeads(HEADLINES, { minCount: 1, limit: 30 });
        expect(heads).toContain('놀면뭐하니');
    });

    it('많이 나온 순으로 자르고 limit 을 지킨다', () => {
        const heads = extractTitleHeads(HEADLINES, { minCount: 1, limit: 2 });
        expect(heads).toHaveLength(2);
        expect(heads[0]).toBe('폭싹속았수다');
    });

    it('API 가 섞어 주는 태그·엔티티를 벗기고 센다', () => {
        const raw = [
            '&apos;폭싹 속았수다&apos; <b>아이유</b> 눈물',
            '&lt;b&gt;아이유&lt;/b&gt; &quot;폭싹 속았수다&quot; 종영',
        ];
        expect(extractTitleHeads(raw, { minCount: 2, limit: 10 })).toContain('폭싹속았수다');
    });

    it('15자를 넘거나 한글·영숫자가 아닌 것은 버린다 — hintKeywords 가 잘라서 딴 말이 된다', () => {
        const raw = [
            "'아주아주긴제목의드라마이름입니다정말로' 첫방", "'아주아주긴제목의드라마이름입니다정말로' 시청률",
            "'선재 업고 튀어!!' 시즌2", "'선재 업고 튀어!!' 캐스팅",
        ];
        const heads = extractTitleHeads(raw, { minCount: 2, limit: 10 });
        expect(heads.every((h) => h.length <= 15 && /^[가-힣A-Za-z0-9]+$/.test(h))).toBe(true);
        expect(heads).toContain('선재업고튀어');
    });

    /*
     * 같은 기사가 여러 질의에 겹쳐 온다('드라마'와 '드라마 시청률'은 거의 같은 기사를 준다).
     * 그대로 세면 한 번 따옴표에 든 말이 기사 수만큼 불어 머리말이 된다.
     */
    it('겹쳐 온 같은 기사는 한 번만 센다', () => {
        const once = "'한번뿐' 결말에 시청자 반응";
        const heads = extractTitleHeads([once, once, once, once, "'폭싹 속았수다' 종영", "'폭싹 속았수다' 눈물"], { minCount: 2, limit: 10 });
        expect(heads).not.toContain('한번뿐');
        expect(heads).toContain('폭싹속았수다');
    });

    it('빈 입력은 빈 배열', () => {
        expect(extractTitleHeads([], { minCount: 2, limit: 10 })).toEqual([]);
        expect(extractTitleHeads(['', '   '], { minCount: 1, limit: 10 })).toEqual([]);
    });
});
