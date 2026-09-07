import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * 선점 보드 워크플로가 **실제로 돌 수 있는지**를 파일만 보고 가른다.
 *
 * 왜 필요한가: 워크플로가 자격증명을 `NAVER_SEARCHAD_*`(밑줄 없음)로 넘겼는데
 * EnvironmentManager 가 읽는 이름은 `NAVER_SEARCH_AD_*`(밑줄 있음)였다.
 * 값이 비어도 예외가 안 난다 — 그냥 빈 문자열이 되고 스크립트가
 * "자격증명이 필요합니다"로 죽는다. 주 2회짜리 배치라 다음 실패까지 사흘이 걸리고,
 * 그때도 로그를 봐야만 안다. 이름 하나가 어긋난 것을 파일 대조로 잡는다.
 */

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'preemption-board.yml'),
    'utf8',
);
const environmentManager = fs.readFileSync(
    path.join(root, 'src', 'utils', 'environment-manager.ts'),
    'utf8',
);
const publishScript = fs.readFileSync(
    path.join(root, 'scripts', 'publish-preemption-board.js'),
    'utf8',
);

/**
 * 주제 목록은 **두 곳**에 손으로 적혀 있다 — 워크플로의 `--topics=` 와 발행의
 * ACTIVE_TOPICS. 한쪽만 늘리면 조용히 어긋난다:
 *   워크플로만 늘리면  그 주제를 파긴 하는데 발행 게이트가 전부 걸러 낸다
 *   발행만 늘리면      실릴 행이 아예 안 생긴다
 * 공연·전시 레인을 열 때(2026-09-07) 실제로 둘 다 고쳐야 했다. 다음에 주제를
 * 더할 사람이 한쪽을 빠뜨리지 않도록 여기서 대조한다.
 */
function topicsInWorkflow(): string[] {
    const match = workflow.match(/--topics=([^\s]+)/);
    return match ? match[1].split(',').filter(Boolean) : [];
}

function topicsInPublishGate(): string[] {
    const block = publishScript.match(/const ACTIVE_TOPICS = new Set\(\[([\s\S]*?)\]\)/);
    if (!block) return [];
    // 주석부터 지운다 — 설명 안의 따옴표까지 주제로 세면 안 된다(이 테스트가 잡아냈다).
    const code = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    return [...code.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** 워크플로가 스텝에 심는 네이버 자격증명 환경변수 이름. */
function naverEnvKeysInWorkflow(): string[] {
    const matches = workflow.matchAll(/^\s+(NAVER_[A-Z_]+):\s*\$\{\{\s*secrets\./gm);
    return [...new Set([...matches].map((m) => m[1] as string))];
}

/** EnvironmentManager 가 실제로 읽는 환경변수 이름. */
function envKeysReadByManager(): Set<string> {
    const matches = environmentManager.matchAll(/process\.env\['([A-Za-z0-9_]+)'\]/g);
    return new Set([...matches].map((m) => m[1] as string));
}

describe('선점 보드 워크플로 — 자격증명 이름', () => {
    it('워크플로가 넘기는 네이버 키 이름을 EnvironmentManager 가 전부 읽는다', () => {
        const readable = envKeysReadByManager();
        const passed = naverEnvKeysInWorkflow();

        // 이름을 하나도 안 넘기면 대조가 무의미하게 통과한다.
        expect(passed.length).toBeGreaterThanOrEqual(5);

        const unreadable = passed.filter((key) => !readable.has(key));
        expect(unreadable).toEqual([]);
    });

    it('밑줄 빠진 옛 이름을 다시 쓰지 않는다', () => {
        expect(/NAVER_SEARCHAD_/.test(workflow)).toBe(false);
    });

    it('사이트 발행은 개인 토큰이 아니라 배포키로 한다', () => {
        // 개인 토큰은 계정 전체 권한을 CI 로 들고 들어오고, 재로그인하면 조용히 깨진다.
        expect(/ssh-key:\s*\$\{\{\s*secrets\.SITE_REPO_SSH_KEY\s*\}\}/.test(workflow)).toBe(true);
        expect(/SITE_REPO_TOKEN/.test(workflow)).toBe(false);
    });

    it('BD 자리 판정 스텝에도 문서수 조회용 오픈 API 키가 있다', () => {
        // 블로그 문서수를 못 재면 비율 게이트가 통째로 건너뛰어진다.
        const bdStep = workflow.slice(workflow.indexOf('자리 판정'));
        expect(/NAVER_CLIENT_ID/.test(bdStep)).toBe(true);
        expect(/BRIGHTDATA_TOKEN/.test(bdStep)).toBe(true);
    });
});

describe('선점 보드 워크플로 — 주제 목록', () => {
    it('워크플로가 파는 주제와 발행이 싣는 주제가 같다', () => {
        const dug = topicsInWorkflow();
        const published = topicsInPublishGate();
        expect(dug.length).toBeGreaterThan(0);
        expect([...dug].sort()).toEqual([...published].sort());
    });

    it('공연·전시 레인이 두 곳에 다 열려 있다(사장님 지시 2026-09-07)', () => {
        expect(topicsInWorkflow()).toContain('공연·전시');
        expect(topicsInPublishGate()).toContain('공연·전시');
    });

    it('파는 주제에는 씨앗이 있어야 한다 — 조용한 0건을 막는다', async () => {
        const { BLOG_TOPIC_COVERAGE } = await import('../blog-topic-coverage');
        for (const topic of topicsInWorkflow()) {
            const coverage = BLOG_TOPIC_COVERAGE.find((entry) => entry.topic === topic);
            expect(coverage, `${topic} 이 커버리지 표에 없다`).toBeTruthy();
            expect(coverage!.seedTerms.length, `${topic} 에 씨앗이 없다`).toBeGreaterThan(0);
        }
    });
});

describe('선점 보드 워크플로 — 실행 시각', () => {
    /*
     * cron 은 UTC 다. 한국 월요일 07:00 은 UTC 일요일 22:00, 금요일 07:00 은
     * UTC 목요일 22:00 이라 요일 필드가 0,4 다. 1,5 를 적으면 한국 시간으로
     * 화요일·토요일에 돈다 — 지시받은 요일과 다르게 도는데 아무도 안 죽는다.
     */
    it('한국 월·금 아침에 돈다', () => {
        const cron = workflow.match(/cron:\s*'([^']+)'/);
        expect(cron?.[1]).toBe('0 22 * * 0,4');
    });
});

describe('선점 보드 워크플로 — 비용 순서', () => {
    it('시크릿 확인이 크레딧 쓰는 스텝보다 먼저 온다', () => {
        // 발행 토큰이 없으면 BD 를 다 태우고 마지막 스텝에서 죽는다 — 순수 손실이다.
        const preflight = workflow.indexOf('필수 시크릿 확인');
        const brightData = workflow.indexOf('preemption-board-batch.js');
        expect(preflight).toBeGreaterThan(-1);
        expect(brightData).toBeGreaterThan(preflight);
        // 발행 경로가 막혔는지도 미리 본다. 이게 빠지면 확인의 의미가 없다.
        expect(/SITE_REPO_SSH_KEY[\s\S]{0,80}!=\s*''/.test(workflow)).toBe(true);
    });

    it('무료 후보 발굴과 예산 절단이 BD 자리 판정보다 먼저 온다', () => {
        // 자르기를 건너뛰고 BD 로 넘기면 승인받은 예산을 넘긴다. 한 번 겪었다.
        const discover = workflow.indexOf('후보 발굴');
        const trim = workflow.indexOf('trim-candidates.js');
        const brightData = workflow.indexOf('preemption-board-batch.js');
        expect(discover).toBeGreaterThan(-1);
        expect(trim).toBeGreaterThan(discover);
        expect(brightData).toBeGreaterThan(trim);
    });
});
