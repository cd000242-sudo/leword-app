import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 도달 가능 기능 안전망 (2026-09-09 앱 리뉴얼).
 *
 * 런처(추가 기능 그리드 + 머리 영역)의 카드가 부르는 열기 함수가 실제로 정의돼 있는지,
 * openModal('key') 의 key 가 모달 등록표에 있는지 잠근다.
 * 인벤토리(2026-09-08)에서 "정의만 있고 어디서도 안 열리는 모달" 9종과 "카드는 있는데 함수가 없는" 사고가
 * 같이 나왔다 — 덜어내는 커밋마다 여기 EXPECTED_CARDS 를 같이 고쳐야 통과한다.
 */
const root = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(root, 'ui', 'keyword-master.html'), 'utf8');

/** 리뉴얼 후 남아야 하는 추가 기능 카드 — 순서 그대로. */
const EXPECTED_CARDS = [
    'PRO 트래픽 폭발 키워드 헌터',
    '자리 실측기',
    'AdSense 승인 키워드 헌터',
    '네이버 AI 메이트 키워드 찾기',
];

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    expect(start, `마커 없음: ${startMarker}`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf(endMarker, start);
    expect(end, `마커 없음: ${endMarker}`).toBeGreaterThan(start);
    return source.slice(start, end);
}

const gridHtml = sliceBetween(html, '<div class="additional-features">', '<!-- 하단 버튼 영역 제거됨');
const headerHtml = sliceBetween(html, '<h1>💎LEWORD', '<!-- 실시간 검색어 모니터링 섹션');
const realtimeHeaderHtml = sliceBetween(html, 'id="realtimeKeywordsSection"', 'id="refreshRealtimeTop"');

interface Card {
    label: string;
    onclick: string;
}

function parseGridCards(grid: string): Card[] {
    const cards: Card[] = [];
    const re = /<button\s+onclick="([^"]+)"[\s\S]*?<\/button>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(grid)) !== null) {
        const block = match[0];
        const title = block.match(/<div style="font-size: 1\dpx; font-weight: \d00;[^"]*">([^<]+)<\/div>/);
        cards.push({ label: (title ? title[1] : '').trim(), onclick: match[1].trim() });
    }
    return cards;
}

function openerCalls(source: string): string[] {
    const names = new Set<string>();
    const re = /onclick="(open[A-Za-z0-9_]+)\(/g;
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

describe('런처 기능 도달 가능성', () => {
    const cards = parseGridCards(gridHtml);

    it('추가 기능 그리드 카드가 기대 목록과 정확히 같다', () => {
        expect(cards.map((c) => c.label)).toEqual(EXPECTED_CARDS);
    });

    it('그리드·머리 영역의 open* 호출이 전부 정의돼 있다', () => {
        const names = [
            ...openerCalls(gridHtml),
            ...openerCalls(headerHtml),
            ...openerCalls(realtimeHeaderHtml),
        ].filter((n) => n !== 'openModal');
        expect(names.length).toBeGreaterThan(0);
        const missing = names.filter((n) => !isDefined(n));
        expect(missing, `정의 없는 열기 함수: ${missing.join(', ')}`).toEqual([]);
    });

    it("openModal('key') 의 key 가 모달 등록표에 있다", () => {
        const wanted = [...modalKeys(gridHtml), ...modalKeys(headerHtml)];
        const registered = registeredModalKeys();
        const missing = wanted.filter((k) => !registered.includes(k));
        expect(missing, `등록표에 없는 모달 키: ${missing.join(', ')}`).toEqual([]);
    });

    it('황금키워드 발굴 본판은 그리드 바깥에 따로 있다', () => {
        expect(html).toContain('<h2 style="margin: 0;">황금키워드 발굴</h2>');
        expect(gridHtml).not.toContain('황금키워드 발굴</h2>');
    });
});
