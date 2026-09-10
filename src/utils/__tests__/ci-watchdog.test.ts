import { describe, expect, it } from 'vitest';
import { slotNow } from '../../main/handlers/ci-watchdog';

/**
 * 회차 감시견의 시각 계산 — 여기가 틀리면 멀쩡한 회차를 또 깨우거나, 빠진 회차를 영영 안 깨운다.
 * 경계는 topic-briefs 의 roundSlotOf 와 같아야 한다(11시·17시 KST).
 */
const kst = (month: number, day: number, hour: number, minute = 0) =>
    Date.UTC(2026, month - 1, day, hour, minute) - 9 * 3_600_000;

describe('회차 감시견 — 지금 어느 회차인가', () => {
    it('한국 시각 11시 전은 아침, 17시 전은 오후, 그 뒤는 저녁', () => {
        expect(slotNow(kst(9, 10, 6, 30)).slot).toBe('아침');
        expect(slotNow(kst(9, 10, 10, 59)).slot).toBe('아침');
        expect(slotNow(kst(9, 10, 11, 0)).slot).toBe('오후');
        expect(slotNow(kst(9, 10, 16, 59)).slot).toBe('오후');
        expect(slotNow(kst(9, 10, 17, 0)).slot).toBe('저녁');
        expect(slotNow(kst(9, 10, 23, 59)).slot).toBe('저녁');
    });

    it('회차 예정 시각은 06:23 · 12:23 · 18:23 KST — 크론과 같은 분이다', () => {
        const morning = slotNow(kst(9, 10, 9, 0));
        expect(new Date(morning.startedAtMs + 9 * 3_600_000).toISOString()).toBe('2026-09-10T06:23:00.000Z');
        const afternoon = slotNow(kst(9, 10, 14, 0));
        expect(new Date(afternoon.startedAtMs + 9 * 3_600_000).toISOString()).toBe('2026-09-10T12:23:00.000Z');
        const evening = slotNow(kst(9, 10, 20, 0));
        expect(new Date(evening.startedAtMs + 9 * 3_600_000).toISOString()).toBe('2026-09-10T18:23:00.000Z');
    });

    it('날짜는 한국 날짜다 — 자정 직후 UTC 로 세면 전날이 되어 하루 종일 안 깨운다', () => {
        // 한국 00:30 = UTC 전날 15:30. 여기서 UTC 날짜를 쓰면 어제로 적힌다.
        expect(slotNow(kst(9, 10, 0, 30)).day).toBe('2026-09-10');
        expect(slotNow(kst(9, 10, 23, 30)).day).toBe('2026-09-10');
    });

    it('예정 시각 직후에는 아직 여유 시간 안이다 — 조금 늦는 예약까지 깨우면 두 번 돈다', () => {
        const at = kst(9, 10, 12, 30); // 예정 12:23 에서 7분 지남
        const { startedAtMs } = slotNow(at);
        expect(at - startedAtMs).toBeLessThan(40 * 60_000);
    });

    it('예정 시각에서 40분을 넘기면 깨울 때가 된 것이다', () => {
        const at = kst(9, 10, 13, 10); // 예정 12:23 에서 47분 지남
        const { startedAtMs, slot } = slotNow(at);
        expect(slot).toBe('오후');
        expect(at - startedAtMs).toBeGreaterThan(40 * 60_000);
    });
});
