import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 자리 실측기 배선 — 핸들러가 등록되고, 진행 이벤트가 preload 허용 목록에 있고, 런처 카드와
 * 모달이 같은 채널 이름을 쓰는지. 인벤토리(2026-09-08)에서 "정의만 있고 어디서도 안 열리는 모달"이
 * 9종이었다 — 이 기능은 그 길로 가지 않게 여기서 잠근다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('자리 실측기 배선', () => {
    it('핸들러가 등록 목록에 있다', () => {
        const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
        expect(hub).toContain("import { setupSeatMeasureHandlers } from './handlers/seat-measure';");
        expect(hub).toContain('setupSeatMeasureHandlers();');
    });

    it('진행 이벤트 채널이 preload 허용 목록에 있고 핸들러와 이름이 같다', () => {
        const preload = read('preload.ts');
        const handler = read('src', 'main', 'handlers', 'seat-measure.ts');
        expect(preload).toContain("'seat-measure-progress'");
        expect(handler).toContain("SEAT_MEASURE_PROGRESS_CHANNEL = 'seat-measure-progress'");
        expect(handler).toContain("ipcMain.handle('seat-measure-run'");
        expect(handler).toContain("ipcMain.handle('seat-measure-abort'");
    });

    it('런처 카드가 있고 모달이 실제로 열리며 같은 채널을 부른다', () => {
        const html = read('ui', 'keyword-master.html');
        expect(html).toContain('onclick="openSeatMeasureModal()"');
        expect(html).toContain('window.openSeatMeasureModal = function');
        expect(html).toContain("invoke('seat-measure-run'");
        expect(html).toContain("on('seat-measure-progress'");
        expect(html).not.toMatch(/openSeatMeasureModal\(\)"[^>]*display:\s*none/);
    });

    it('자리 감시가 같은 실측 함수·같은 진행 채널을 쓰고, 등록·스케줄러·모달 패널이 이어져 있다', () => {
        const hub = read('src', 'main', 'keywordMasterIpcHandlers.ts');
        const watch = read('src', 'main', 'handlers', 'seat-watch.ts');
        const html = read('ui', 'keyword-master.html');
        expect(hub).toContain('setupSeatWatchHandlers();');
        expect(hub).toContain('startSeatWatchScheduler();');
        expect(hub).toContain('stopSeatWatchScheduler();');
        expect(watch).toContain("import { measureKeywords, type SeatRow } from './seat-measure';");
        for (const ch of ['seat-watch-list', 'seat-watch-add', 'seat-watch-remove', 'seat-watch-run-now']) {
            expect(watch).toContain("ipcMain.handle('" + ch + "'");
            expect(html).toContain("invoke('" + ch + "'");
        }
        expect(watch).toContain("'seat-measure-progress'");
        expect(html).toContain('id="seatWatchPanel"');
        expect(html).toContain('refreshSeatWatch();');
    });

    it('브라이트데이터를 부르지 않는다 — 내 브라우저만', () => {
        const handler = read('src', 'main', 'handlers', 'seat-measure.ts');
        expect(handler).not.toMatch(/brightdata|brightDataFetch/i);
        expect(handler).toContain("import('../../utils/puppeteer-pool')");
    });
});
