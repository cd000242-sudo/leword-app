import { describe, it, expect } from 'vitest';
import { createInterval, mapWithConcurrency } from '../rate-limited-pool';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createInterval — 동시에 불러도 총 속도는 그대로', () => {
    /*
     * 짝끼리의 간격이 아니라 **전체 소요**를 본다.
     *
     * 처음에는 이웃한 두 통과의 간격을 쟀는데, 다른 테스트와 같이 돌 때 흔들렸다.
     * 러너가 바쁘면 타이머가 늦게 몰려서 여러 개가 붙어 깨어난다 — 간격은 줄어
     * 보이지만 실제로 자기 차례보다 먼저 나간 것은 아니다.
     * 마지막 통과는 어떤 경우에도 (n-1)×간격 전에는 못 나오므로 그걸 본다.
     */
    it('n번 통과하려면 (n-1)×간격 이상 걸린다', async () => {
        const gate = createInterval(30);
        const started = Date.now();
        await Promise.all(Array.from({ length: 5 }, () => gate()));
        expect(Date.now() - started).toBeGreaterThanOrEqual(4 * 30 - 5);
    });

    it('0 이면 기다리지 않는다', async () => {
        const gate = createInterval(0);
        const started = Date.now();
        await Promise.all(Array.from({ length: 20 }, () => gate()));
        expect(Date.now() - started).toBeLessThan(50);
    });
});

describe('mapWithConcurrency', () => {
    it('결과는 입력 순서 그대로다', async () => {
        // 뒤엣것이 먼저 끝나게 해도 순서가 안 섞여야 한다.
        const out = await mapWithConcurrency([50, 10, 30], 3, async (ms, index) => {
            await sleep(ms);
            return `${index}:${ms}`;
        });
        expect(out).toEqual(['0:50', '1:10', '2:30']);
    });

    it('동시 실행 수를 넘지 않는다', async () => {
        let running = 0;
        let peak = 0;
        await mapWithConcurrency(Array.from({ length: 9 }, (_, i) => i), 3, async () => {
            running += 1;
            peak = Math.max(peak, running);
            await sleep(15);
            running -= 1;
        });
        expect(peak).toBeLessThanOrEqual(3);
        expect(peak).toBeGreaterThan(1);
    });

    // 주제 하나가 죽었다고 회차 전체를 버리지 않는다 — 지금 배치가 그렇게 돈다.
    it('하나가 던져도 나머지는 계속 돈다', async () => {
        const failures: number[] = [];
        const out = await mapWithConcurrency([1, 2, 3], 2, async (value) => {
            if (value === 2) throw new Error('boom');
            return value * 10;
        }, (_error, item) => { failures.push(item); });
        expect(out).toEqual([10, undefined, 30]);
        expect(failures).toEqual([2]);
    });

    it('동시 실행 수가 항목보다 많아도 괜찮다', async () => {
        const out = await mapWithConcurrency([1, 2], 8, async (value) => value + 1);
        expect(out).toEqual([2, 3]);
    });

    it('빈 목록은 빈 결과다', async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });
});
