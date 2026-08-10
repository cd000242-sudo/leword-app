import { describe, expect, it } from 'vitest';
import { readSerpStructure } from '../naver-serp-structure';

/**
 * 구획 마커 회귀 시험.
 *
 * 왜 있는가: 처음 마커는 화면에 **뜨지도 않은 구획을 떴다고** 말했다.
 *   - `search.shopping.naver.com` — 모든 통합검색 상단 탭바에 있다
 *   - `"adRequests":{"powerlink"` — 광고가 안 붙어도 들어 있는 요청 설정이다
 *   - `gw.in.naver.com` — 인플루언서가 아니라 네이버 내부 API 게이트웨이다
 *
 * 실측 3건(바리깡 어원 · 멜라토닌 복용량 · 고양이 자동화장실 렌탈)에서 확인한 값:
 *   쇼핑 cr3 브릿지  6 / 0 / 22       파워링크 고지문  0 / 1 / 1
 *   지식iN qna       0 / 20 / 0       인플루언서 홈    0 / 58 / 9
 * 아래 조각은 그 문서에서 그대로 따온 것이다.
 */

/** readSerpStructure 는 20,000자 미만을 "못 본 것"으로 본다. 실제 문서 길이를 흉내낸다. */
const pad = (body: string) => `<html><body>${body}${'<div class="filler"></div>'.repeat(1200)}</body></html>`;

/** 어느 통합검색에나 있는 껍데기 — 이것만으로는 어떤 구획도 뜬 게 아니다. */
const CHROME = `
<div class="tab_menu"><a role="tab" href="https://search.shopping.naver.com/search/all?where=all&query=x">쇼핑</a></div>
<script>{"adRequests":{"powerlink":{"apiUrl":"https://external-api.example/ad"}}}</script>
<script>{"fanApi":{"check":"https://gw.in.naver.com/delivery/api/v1/subscribes"}}</script>
`;

describe('구획 판정 — 껍데기를 구획으로 세지 않는다', () => {
    const structure = readSerpStructure(pad(CHROME));

    it('탭바·광고설정·API 게이트웨이뿐이면 구획이 하나도 없다', () => {
        expect(structure?.sections).toEqual([]);
    });
});

describe('구획 판정 — 실제로 뜬 것만 센다', () => {
    it('상품 브릿지 링크가 있어야 쇼핑으로 본다', () => {
        const html = pad(`${CHROME}<a href="https://cr3.shopping.naver.com/v2/bridge/searchGate?nvMid=1">상품</a>`);
        expect(readSerpStructure(html)?.sections).toContain('쇼핑');
    });

    it('광고 고지문이 있어야 파워링크로 본다', () => {
        const html = pad(`${CHROME}<p class="dsc">이 광고는 사이트검색광고(파워링크)로, 검색어와 광고의 연관도…</p>`);
        expect(readSerpStructure(html)?.sections).toContain('파워링크');
    });

    it('질문 링크가 있어야 지식iN 으로 본다', () => {
        const html = pad(`${CHROME}<a href="https://kin.naver.com/qna/detail.naver?d1id=7">질문</a>`);
        expect(readSerpStructure(html)?.sections).toContain('지식iN');
    });

    it('인플루언서 홈 링크가 있어야 인플루언서로 본다 — 게이트웨이 주소는 아니다', () => {
        const onlyGateway = readSerpStructure(pad(CHROME));
        expect(onlyGateway?.sections).not.toContain('인플루언서');

        const html = pad(`${CHROME}<a href="https://in.naver.com/somecreator">채널</a>`);
        expect(readSerpStructure(html)?.sections).toContain('인플루언서');
    });

    it('카페는 게시글 주소여야 센다 — 카페 이름만 스쳐가는 링크는 아니다', () => {
        const homeOnly = pad(`${CHROME}<a href="https://cafe.naver.com/onlinehuman">카페</a>`);
        expect(readSerpStructure(homeOnly)?.sections).not.toContain('카페');

        const post = pad(`${CHROME}<a href="https://cafe.naver.com/onlinehuman/221345">글</a>`);
        expect(readSerpStructure(post)?.sections).toContain('카페');
    });
});

describe('AI 브리핑 판정은 그대로 산다', () => {
    it('마커가 있으면 브리핑으로 본다', () => {
        expect(readSerpStructure(pad('{"blockId":"ai-briefing"}'))?.hasAiBriefing).toBe(true);
    });

    it('껍데기뿐이면 브리핑이 아니다', () => {
        expect(readSerpStructure(pad(CHROME))?.hasAiBriefing).toBe(false);
    });

    // 못 본 것과 없는 것을 섞지 않는다.
    it('문서가 짧으면 판정하지 않는다', () => {
        expect(readSerpStructure('<html>차단</html>')).toBeNull();
    });
});
