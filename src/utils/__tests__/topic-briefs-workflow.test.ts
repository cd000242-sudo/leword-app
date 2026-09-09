import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 오늘의 글감 워크플로 — 파일만 보고 돌 수 있는지 가른다(추천키워드 워크플로 테스트와 같은 방식).
 * 사이트 탭(TopicBriefsBoard)이 /data/topic-briefs.json 을 읽으므로 파일 이름이 어긋나면 조용히 빈 판이 된다.
 */
const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'topic-briefs.yml'), 'utf8');

describe('오늘의 글감 워크플로', () => {
    it('하루 3회차 — 정각을 피한 06:23 · 12:23 · 18:23 KST (UTC 21:23 · 03:23 · 09:23). 정각 스케줄은 GitHub 가 미루거나 떨어뜨린다(2026-09-09 실측)', () => {
        expect([...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1])).toEqual(['23 21 * * *', '23 3 * * *', '23 9 * * *']);
    });

    it('뉴스 실측 오픈 API 키·구독 토큰·검색광고 키·사이트 배포키를 넘긴다', () => {
        expect(/NAVER_CLIENT_ID:\s*\$\{\{\s*secrets\.NAVER_CLIENT_ID\s*\}\}/.test(workflow)).toBe(true);
        expect(/CLAUDE_CODE_OAUTH_TOKEN:\s*\$\{\{\s*secrets\.CLAUDE_CODE_OAUTH_TOKEN\s*\}\}/.test(workflow)).toBe(true);
        expect(/NAVER_SEARCH_AD_ACCESS_LICENSE:\s*\$\{\{\s*secrets\.NAVER_SEARCH_AD_ACCESS_LICENSE\s*\}\}/.test(workflow)).toBe(true);
        expect(/ssh-key:\s*\$\{\{\s*secrets\.SITE_REPO_SSH_KEY\s*\}\}/.test(workflow)).toBe(true);
    });

    it('시크릿 확인이 글감 뽑기보다 먼저 오고, 클로드 CLI 를 설치한다', () => {
        expect(workflow.indexOf('필수 시크릿 확인')).toBeLessThan(workflow.indexOf('scripts/topic-briefs.js'));
        expect(workflow).toContain('npm install -g @anthropic-ai/claude-code');
    });

    it('스크립트가 실재하고, 사이트의 다른 정적 보드와 같은 폴더에 싣는다', () => {
        expect(fs.existsSync(path.join(root, 'scripts', 'topic-briefs.js'))).toBe(true);
        expect(workflow).toContain('site/spa/public/data/topic-briefs.json');
        // 앞 회차를 이어받아 아침·오후·저녁을 한 파일에 쌓고, 주제마다 5개 이상
        expect(workflow).toContain('--carry=site/spa/public/data/topic-briefs.json');
        expect(workflow).toContain('--perField=5');
        expect(workflow).toContain('--maxAltSerp=70');
    });

    it('자리 실측은 BD 로 회차 글감 전부(상한 80, 달 8,000 — 사장님 2026-09-09 오후) — 기능 briefs 장부를 사이트 레포에 두고 표와 함께 커밋한다', () => {
        expect(/SERP_MODE:\s*\$\{\{\s*github\.event\.inputs\.serp\s*\|\|\s*'brightdata'\s*\}\}/.test(workflow)).toBe(true);
        expect(/MAX_SERP:\s*\$\{\{\s*github\.event\.inputs\.maxSerp\s*\|\|\s*'80'\s*\}\}/.test(workflow)).toBe(true);
        expect(/BRIGHTDATA_TOKEN:\s*\$\{\{\s*secrets\.BRIGHTDATA_TOKEN\s*\}\}/.test(workflow)).toBe(true);
        expect(workflow).toContain('LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: ${{ github.workspace }}/site/data/brightdata-quota-briefs.json');
        expect(workflow).toContain('LEWORD_BRIGHTDATA_FEATURE_CAPS: \'{"briefs":12000}\'');
        expect(workflow).toContain('git add data/brightdata-quota-briefs.json');
        // 장부를 읽어야 하므로 사이트 체크아웃이 글감 뽑기보다 앞이다
        expect(workflow.indexOf('사이트 레포 체크아웃')).toBeLessThan(workflow.indexOf('scripts/topic-briefs.js'));
    });
});
