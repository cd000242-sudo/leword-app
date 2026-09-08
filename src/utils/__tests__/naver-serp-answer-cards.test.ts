import { describe, expect, it } from 'vitest';
import { readSerpStructure } from '../naver-serp-structure';

/**
 * 답 카드 구획(날씨·인물정보) 마커 회귀 시험.
 *
 * 왜: 발행 보드 122행 중 30행이 카드로 답이 나오는 검색어였다('xx cc 날씨' 24행 ·
 * '송강 프로필'). 구획 판독기가 카드를 몰라서 '웹사이트·지식스니펫·인기글…'만
 * 읽었고, 그 행은 자리가 빈 것으로 발행됐다. 카드가 떠 있으면 블로그 클릭이 없다.
 *
 * 아래 조각은 2026-09-08 통합검색에서 그대로 떠 온 것이다. 대조군(몬스테라 무름병 ·
 * 실업급여 조건)에는 두 마커가 0번 나온다.
 */

/** readSerpStructure 는 20,000자 미만을 "못 본 것"으로 본다. 실제 문서 길이를 흉내낸다. */
const pad = (body: string) => `<html><body>${body}${'<div class="filler"></div>'.repeat(1200)}</body></html>`;

const CHROME = `
<div class="tab_menu"><a role="tab" href="https://search.shopping.naver.com/search/all?where=all&query=x">쇼핑</a></div>
<script>{"adRequests":{"powerlink":{"apiUrl":"https://external-api.example/ad"}}}</script>
`;

/** 모나크cc 날씨 — 날씨 모듈이 싣는 스타일시트와 레이어. */
const WEATHER_FRAGMENT = `<script>var g_uad = false; </script><link rel="stylesheet" type="text/css" href="https://ssl.pstatic.net/sstatic/keypage/outside/scui/weather_new/css/cs_weather_new_251126.css"> <style> .weather_layer_pop[aria-hidden="true"] { display: none; }</style>`;

/** 송강 프로필 — 인물 모듈의 제목과 통. */
const PEOPLE_FRAGMENT = `<a href="https://search.naver.com/search.naver?where=nexearch&sm=tab_etc&mra=bjky&pkid=1&os=5525133&query=%EC%86%A1%EA%B0%95" data-blog-source-title="인물정보" data-cafe-title="송강 : 네이버 인물정보"></a>
<div class="cm_content_wrap"> <div class="cm_content_area _cm_content_area_profile"> <div class="cm_info_box"> <div class="detail_info"> <dl class="info txt_3"> <div class="info_group"> <dt><span class="cm_bar"></span>출생</dt> <dd class="type_visible"> 1994.04.23., 황소자리, 개띠 </dd> </div></dl></div></div></div></div>`;

describe('답 카드 구획 — 실제로 떠 있을 때만', () => {
    it('껍데기뿐이면 날씨도 인물정보도 없다', () => {
        const sections = readSerpStructure(pad(CHROME))?.sections ?? [];
        expect(sections).not.toContain('날씨');
        expect(sections).not.toContain('인물정보');
    });

    it('날씨 모듈 스타일시트·레이어가 있으면 날씨 구획으로 읽는다', () => {
        expect(readSerpStructure(pad(`${CHROME}${WEATHER_FRAGMENT}`))?.sections).toContain('날씨');
    });

    it('인물 모듈 제목·통이 있으면 인물정보 구획으로 읽는다', () => {
        expect(readSerpStructure(pad(`${CHROME}${PEOPLE_FRAGMENT}`))?.sections).toContain('인물정보');
    });

    it('날씨 조각에 인물정보가 섞이지 않고, 그 반대도 없다', () => {
        expect(readSerpStructure(pad(`${CHROME}${WEATHER_FRAGMENT}`))?.sections).not.toContain('인물정보');
        expect(readSerpStructure(pad(`${CHROME}${PEOPLE_FRAGMENT}`))?.sections).not.toContain('날씨');
    });

    it('카드가 맨 위면 구획 순서에서도 맨 앞이다 — 배치가 곧 클릭 흐름이다', () => {
        const html = pad(`${CHROME}${WEATHER_FRAGMENT}<a href="https://kin.naver.com/qna/detail.naver?d1id=1&docId=1">답변</a>`);
        const sections = readSerpStructure(html)?.sections ?? [];
        expect(sections.indexOf('날씨')).toBeLessThan(sections.indexOf('지식iN'));
    });
});
