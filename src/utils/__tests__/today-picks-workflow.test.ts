import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 오늘의 네이버 추천키워드 워크플로 — 파일만 보고 돌 수 있는지 가른다(선점 보드 워크플로
 * 테스트와 같은 방식). 사이트의 실검 틈새키워드 아래에 실리는 표라 사이트 쪽 파일 이름
 * (spa/public/data/today-picks.json)이 화면(TodayPicksBoard)과 어긋나면 조용히 빈 판이 된다.
 */
const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'today-picks.yml'), 'utf8');

describe('오늘의 추천키워드 워크플로', () => {
    it('오전·오후·저녁 회차마다 재시도 틱을 두되 문지기로 중복을 막는다', () => {
        // 2시간 앞당김(2026-09-15) — 예약이 2시간쯤 늦게 떠서 "1시가 넘어도 안 올라온다"던 것.
        expect([...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1])).toEqual([
            '30 21,22,23 * * *', '30 4,5,6 * * *', '30 10,11,12 * * *',
        ]);
    });

    it('회차 기준과 캐시 재사용을 명시한다', () => {
        expect(workflow).toContain('scripts/today-picks-done.js');
        expect(workflow).toContain('--keep=30');
        expect(workflow).toContain('actions/cache/restore@v4');
        expect(workflow).toContain('actions/cache/save@v4');
        expect(workflow).toContain('--measurementCache=.today-picks-cache/documents.json');
        expect(workflow).toContain('--maxAgeDays=1');
    });

    it('문서수 실측용 오픈 API 키와 사이트 배포키를 넘긴다', () => {
        expect(/NAVER_CLIENT_ID:\s*\$\{\{\s*secrets\.NAVER_CLIENT_ID\s*\}\}/.test(workflow)).toBe(true);
        expect(/ssh-key:\s*\$\{\{\s*secrets\.SITE_REPO_SSH_KEY\s*\}\}/.test(workflow)).toBe(true);
    });

    it('시크릿 확인이 문서수 실측보다 먼저 온다', () => {
        expect(workflow.indexOf('필수 시크릿 확인')).toBeLessThan(workflow.indexOf('scripts/today-picks.js'));
    });

    it('스크립트가 실재하고, 사이트의 실검 틈새 보드와 같은 폴더에 싣는다', () => {
        expect(fs.existsSync(path.join(root, 'scripts', 'today-picks.js'))).toBe(true);
        expect(workflow).toContain('site/spa/public/data/today-picks.json');
    });

    it('BD 를 태우지 않는다 — 무료 표다', () => {
        expect(/BRIGHTDATA/.test(workflow)).toBe(false);
    });
});
