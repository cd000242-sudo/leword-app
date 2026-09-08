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
    it('매일 아침(KST 07:00 = UTC 22:00) 돈다', () => {
        expect(workflow.match(/cron:\s*'([^']+)'/)?.[1]).toBe('0 22 * * *');
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
    });

    it('자리 실측은 BD 회차 12건(사장님 승인 2026-09-09) — 기능 briefs 장부를 사이트 레포에 두고 표와 함께 커밋한다', () => {
        expect(/SERP_MODE:\s*\$\{\{\s*github\.event\.inputs\.serp\s*\|\|\s*'brightdata'\s*\}\}/.test(workflow)).toBe(true);
        expect(/MAX_SERP:\s*\$\{\{\s*github\.event\.inputs\.maxSerp\s*\|\|\s*'12'\s*\}\}/.test(workflow)).toBe(true);
        expect(/BRIGHTDATA_TOKEN:\s*\$\{\{\s*secrets\.BRIGHTDATA_TOKEN\s*\}\}/.test(workflow)).toBe(true);
        expect(workflow).toContain('LEWORD_BRIGHTDATA_QUOTA_STATE_FILE: ${{ github.workspace }}/site/data/brightdata-quota-briefs.json');
        expect(workflow).toContain('LEWORD_BRIGHTDATA_FEATURE_CAPS: \'{"briefs":400}\'');
        expect(workflow).toContain('git add data/brightdata-quota-briefs.json');
        // 장부를 읽어야 하므로 사이트 체크아웃이 글감 뽑기보다 앞이다
        expect(workflow.indexOf('사이트 레포 체크아웃')).toBeLessThan(workflow.indexOf('scripts/topic-briefs.js'));
    });
});
