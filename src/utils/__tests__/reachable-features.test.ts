import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 도달 가능 기능 안전망 (2026-09-09 앱 리뉴얼 · 셸 통일).
 *
 * 사이드바 항목 14개가 기대 순서 그대로 있고, 항목마다 같은 이름의 화면 섹션(data-screen)이 있고,
 * 화면 라우터 등록표(SCREENS)가 부르는 열기 함수가 실제로 정의돼 있는지 잠근다.
 * 인벤토리(2026-09-08)에서 "정의만 있고 어디서도 안 열리는 모달" 9종과 "카드는 있는데 함수가 없는" 사고가
 * 같이 나왔다 — 항목을 더하거나 뺄 때 EXPECTED_NAV 를 같이 고쳐야 통과한다.
 */
const root = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');

/** 셸 통일 후 사이드바 항목 — 순서 그대로 (id, 라벨). */
const EXPECTED_NAV: Array<[string, string]> = [
    ['today', '오늘 쓸 한 편'],
    ['realtime', '실시간 검색어'],
    ['golden', '황금키워드 발굴'],
    ['board', '선점 보드'],
    ['briefs', '오늘의 글감'],
    ['seat', '자리 실측기'],
    ['rank', '노출 추적'],
    ['kin', '지식인 황금질문'],
    ['youtube', '유튜브 급상승 글감'],
    ['pro', 'PRO 트래픽 폭발 키워드 헌터'],
    ['adsense', 'AdSense 승인 키워드 헌터'],
    ['mate', '네이버 AI 메이트 키워드 찾기'],
    ['sites', '사이트에서 보기 ↗'],
    ['settings', '설정 · 키'],
];

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    expect(start, `마커 없음: ${startMarker}`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf(endMarker, start);
    expect(end, `마커 없음: ${endMarker}`).toBeGreaterThan(start);
    return source.slice(start, end);
}

const navHtml = sliceBetween(html, '<nav class="leword-nav"', '</nav>');
const shellHtml = sliceBetween(html, '<div class="leword-shell">', '<div id="modalContainer"></div>');
const screensJs = sliceBetween(html, 'const SCREENS = {', '};');

interface NavItem {
    screen: string;
    label: string;
    onclick: string;
}

function parseNav(nav: string): NavItem[] {
    const items: NavItem[] = [];
    const re = /<button\s+([^>]*)>([\s\S]*?)<\/button>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(nav)) !== null) {
        const attrs = match[1];
        const screen = (attrs.match(/data-screen="([^"]+)"/) || [])[1] || '';
        const onclick = (attrs.match(/onclick="([^"]+)"/) || [])[1] || '';
        const label = match[2].replace(/<span[^>]*>[\s\S]*?<\/span>/g, '').replace(/\s+/g, ' ').trim();
        items.push({ screen, label, onclick });
    }
    return items;
}

function openerCalls(source: string): string[] {
    const names = new Set<string>();
    const re = /onclick="(open[A-Za-z0-9_]+)\(/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) names.add(match[1]);
    return [...names];
}

function registryOpeners(source: string): string[] {
    const names = new Set<string>();
    const re = /open:\s*'([A-Za-z0-9_]+)'/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) names.add(match[1]);
    return [...names];
}

function modalKeys(source: string): string[] {
    const keys = new Set<string>();
    const re = /onclick="openModal\('([^']+)'\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) keys.add(match[1]);
    return [...keys];
}

function isDefined(name: string): boolean {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(window\\.${escaped}\\s*=|function\\s+${escaped}\\s*\\(|(const|let|var)\\s+${escaped}\\s*=)`).test(html);
}

function registeredModalKeys(): string[] {
    const body = sliceBetween(html, 'const modals = {', '};');
    const keys = new Set<string>();
    const re = /^\s*'?([A-Za-z0-9-]+)'?\s*:/gm;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body)) !== null) keys.add(match[1]);
    return [...keys];
}

describe('셸 사이드바 기능 도달 가능성', () => {
    const nav = parseNav(navHtml);

    it('사이드바 항목이 기대 목록과 순서까지 정확히 같다', () => {
        expect(nav.map((n) => [n.screen, n.label])).toEqual(EXPECTED_NAV);
    });

    it('항목마다 같은 이름의 화면 섹션이 있고, 화면은 라우터 등록표에도 있다', () => {
        for (const [screen] of EXPECTED_NAV) {
            expect(html, `화면 섹션 없음: ${screen}`).toContain(`<section class="leword-screen" data-screen="${screen}"`);
            expect(screensJs, `등록표에 없음: ${screen}`).toMatch(new RegExp(`^\\s*${screen}:\\s*\\{`, 'm'));
        }
    });

    it('사이드바 항목은 showScreen(id) 이거나 정의된 열기 함수를 부른다', () => {
        for (const item of nav) {
            const viaRouter = item.onclick === `showScreen('${item.screen}')`;
            const opener = (item.onclick.match(/^(open[A-Za-z0-9_]+)\(\)$/) || [])[1];
            expect(viaRouter || !!opener, `알 수 없는 onclick: ${item.screen} → ${item.onclick}`).toBe(true);
            if (opener) expect(isDefined(opener), `정의 없는 열기 함수: ${opener}`).toBe(true);
        }
    });

    it('라우터 등록표의 열기 함수·셸 안의 open* 호출이 전부 정의돼 있다', () => {
        const names = [...registryOpeners(screensJs), ...openerCalls(shellHtml)].filter((n) => n !== 'openModal');
        expect(names.length).toBeGreaterThan(0);
        const missing = names.filter((n) => !isDefined(n));
        expect(missing, `정의 없는 열기 함수: ${missing.join(', ')}`).toEqual([]);
    });

    it('모달→화면 어댑터가 있고 기본 화면은 오늘 쓸 한 편이다', () => {
        expect(html).toContain('window.mountModalAsScreen = function');
        expect(html).toContain('window.showScreen = async function');
        expect(html).toContain('<section class="leword-screen" data-screen="today" data-active>');
    });

    it("셸 안의 openModal('key') 의 key 가 모달 등록표에 있다", () => {
        const wanted = modalKeys(shellHtml);
        const registered = registeredModalKeys();
        const missing = wanted.filter((k) => !registered.includes(k));
        expect(missing, `등록표에 없는 모달 키: ${missing.join(', ')}`).toEqual([]);
    });

    it('황금키워드 발굴 본판은 제 화면 섹션 안에 있다', () => {
        const golden = sliceBetween(html, '<section class="leword-screen" data-screen="golden">', '</section>');
        expect(golden).toContain('<h2 style="margin: 0;">황금키워드 발굴</h2>');
        expect(golden).toContain('id="goldenResults"');
    });

    it('사이트에서 보기 화면에 7개 탭 링크가 다 있다', () => {
        const sites = sliceBetween(html, '<section class="leword-screen" data-screen="sites">', '</section>');
        for (const tab of ['golden', 'issue', 'picks', 'kin', 'affiliate', 'youtube', 'rank']) {
            expect(sites, `사이트 링크 없음: ${tab}`).toContain(`openLewordSite('${tab}')`);
        }
    });

    it('설정 화면에 기존 입력 id 와 저장·확인 함수 호출이 그대로 있다', () => {
        const settings = sliceBetween(html, '<section class="leword-screen" data-screen="settings">', '</section>');
        for (const id of ['keywordNaverClientId', 'keywordNaverClientSecret', 'keywordNaverApiHubKeyId', 'keywordNaverApiHubKey', 'keywordYoutubeApiKey', 'keywordNaverSearchAdAccessLicense', 'keywordNaverSearchAdSecretKey', 'keywordNaverSearchAdCustomerId']) {
            expect(settings, `설정 입력 없음: ${id}`).toContain(`id="${id}"`);
        }
        expect(settings).toContain('onclick="saveKeywordSettings()"');
        expect(settings).toContain('window.probeNaverApiHubKeys()');
        expect(settings).not.toMatch(/position:\s*fixed/);
    });
});
