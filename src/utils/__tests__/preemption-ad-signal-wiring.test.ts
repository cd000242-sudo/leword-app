import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 광고 클릭 실측이 후보 → 배치 → 발행까지 **이름 그대로** 복사되는지 파일로 대조한다.
 *
 * 왜: 선점 timing 필드가 네 곳 중 한 곳에서 복사가 빠져 화면에 공백으로 실렸던 사고가
 * 있다(memory: 선점 timing 배선). 값은 어댑터가 제대로 내도, 중간 한 곳이 안 옮기면
 * 화면은 "못 잰 것"으로 보인다. 그래서 네 자리를 전부 센다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const FIELDS = ['adClicks', 'adCtrPc', 'adCtrMobile', 'adDepth'];
const RAW = ['monthlyAvePcClkCnt', 'monthlyAveMobileClkCnt', 'monthlyAvePcCtr', 'monthlyAveMobileCtr', 'plAvgDepth'];

describe('광고 클릭 실측 배선', () => {
    it('어댑터가 원문 이름 다섯을 선언한다', () => {
        const adapter = read('src/utils/naver-searchad-api.ts');
        for (const name of RAW) expect(adapter, `${name} 가 어댑터 인터페이스에 없다`).toMatch(new RegExp(`${name}\\?:`));
    });

    it('후보 발굴이 응답에서 건져 행에 싣는다', () => {
        const script = read('scripts/preemption-candidates.js');
        for (const name of RAW.slice(0, 5)) expect(script, `${name} 를 응답에서 안 건진다`).toContain(`row.${name}`);
        for (const name of FIELDS) expect(script, `${name} 를 후보 행에 안 싣는다`).toMatch(new RegExp(`${name}: adSignals`));
    });

    it('배치가 두 복사 자리 모두에서 옮긴다', () => {
        const script = read('scripts/preemption-board-batch.js');
        for (const name of FIELDS) {
            const hits = script.match(new RegExp(`\\b${name}:`, 'g')) || [];
            expect(hits.length, `${name} 복사 자리가 ${hits.length}곳 — 둘이어야 한다`).toBeGreaterThanOrEqual(2);
        }
    });

    it('발행이 공개 행에 싣는다', () => {
        const script = read('scripts/publish-preemption-board.js');
        for (const name of FIELDS) expect(script, `${name} 가 공개 행에 없다`).toMatch(new RegExp(`${name}: row\\.${name}`));
    });
});
