import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { NAVER_BLOG_TOPICS } from '../naver-blog-topics';

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

/**
 * 발행이 싣는 주제.
 *
 * 두 꼴을 다 읽는다. 32주제 전면 개방(2026-09-07)에서 손으로 적던 목록을
 * naver-blog-topics 단일 출처로 바꿨는데, 그때 이 파서가 옛 꼴만 알아서 "발행 0종"
 * 이라고 잘못 알렸다 — 테스트가 스스로 잡은 것이라 파서를 새 꼴에 맞춘다.
 *   새 꼴  new Set(NAVER_BLOG_TOPICS.map(...))  → 그 목록이 곧 주제다
 *   옛 꼴  new Set(['사회·정치', ...])          → 리터럴을 센다(주석은 지우고)
 */
function topicsInPublishGate(): string[] {
    if (/const ACTIVE_TOPICS = new Set\(\s*NAVER_BLOG_TOPICS\b/.test(publishScript)) {
        return NAVER_BLOG_TOPICS.map((entry) => entry.label);
    }
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

/**
 * 발굴을 러너 4대로 쪼갠 뒤(2026-09-07) 생긴 조용한 실패 자리를 막는다.
 *
 * 왜 쪼갰나: 첫 32주제 회차가 4시간 11분이었고 잡 제한이 300분이라 여유가
 * 49분뿐이었다. 공급을 늘리려면 표본을 늘려야 하는데 한 잡에서 늘리면 제한에
 * 걸려 회차 전체가 0행으로 죽는다.
 */
describe('선점 보드 워크플로 — 샤딩', () => {
    /** 매트릭스에 적힌 샤드 번호. */
    function matrixShards(): number[] {
        const block = workflow.match(/matrix:\s*\n\s*shard:\s*\[([^\]]+)\]/);
        if (!block) return [];
        return block[1].split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
    }

    /** 발굴 명령이 스크립트에 넘기는 --shards= 값. */
    function declaredShardCount(): number | null {
        const match = workflow.match(/--shards=(\d+)/);
        return match ? Number(match[1]) : null;
    }

    /*
     * 이게 이 블록에서 제일 중요한 테스트다. 둘이 어긋나면 **아무도 안 죽고**
     * 주제가 사라진다. 매트릭스가 4인데 --shards=8 이면 주제의 절반은 파는
     * 러너가 아예 없어서 그냥 안 실린다 — 로그에도 안 남는다.
     */
    it('매트릭스 샤드 수와 --shards= 값이 같다', () => {
        const matrix = matrixShards();
        expect(matrix.length).toBeGreaterThan(0);
        expect(declaredShardCount()).toBe(matrix.length);
    });

    it('샤드 번호가 0부터 빠짐없이 이어진다', () => {
        const matrix = matrixShards();
        expect([...matrix].sort((a, b) => a - b)).toEqual(matrix.map((_, i) => i));
    });

    /*
     * 샤드가 죽으면 아티팩트가 안 생기고, 합치기의 glob 이 그 파일을 애초에
     * 안 넘긴다 — 파일 수만 세면 누락이 안 보인다. --expect 가 그걸 드러내는데,
     * 매트릭스와 어긋나면 도로 눈이 먼다.
     */
    it('합치기의 --expect 도 매트릭스 샤드 수와 같다', () => {
        const expected = workflow.match(/--expect=(\d+)/);
        expect(expected).toBeTruthy();
        expect(Number(expected![1])).toBe(matrixShards().length);
    });

    it('샤드 하나가 죽어도 나머지가 계속 판다', () => {
        // fail-fast 가 켜져 있으면 샤드 하나의 플레이크가 회차 전체를 취소시킨다.
        expect(/fail-fast:\s*false/.test(workflow)).toBe(true);
    });

    it('샤드 결과를 합치는 스텝이 있고, 절단보다 먼저 온다', () => {
        const merge = workflow.indexOf('candidate-shards.js');
        const trim = workflow.indexOf('trim-candidates.js');
        expect(merge).toBeGreaterThan(-1);
        expect(trim).toBeGreaterThan(merge);
    });

    /*
     * 예산 장부와 최초 관측 장부는 기록자가 하나여야 한다. 샤드마다 BD 를 태우면
     * 마지막에 커밋한 샤드가 나머지 사용량을 덮어써서 월 상한이 무력해진다 —
     * 장부를 tmpdir 에 두어 회차마다 잃었던 2026-08-22 사고와 같은 모양이다.
     */
    it('BD 를 태우는 스텝은 워크플로에 한 곳뿐이다', () => {
        const occurrences = workflow.match(/preemption-board-batch\.js/g) || [];
        expect(occurrences.length).toBe(1);
    });

    it('씨앗 창고는 한 번만 만든다 — 샤드마다 만들면 같은 호출을 4번 쓴다', () => {
        const occurrences = workflow.match(/build-seed-db\.js/g) || [];
        expect(occurrences.length).toBe(1);
    });

    it('발굴 샤드는 저마다 다른 이름으로 결과를 올린다', () => {
        // 이름이 겹치면 마지막 샤드가 앞 샤드를 덮어써서 주제가 통째로 사라진다.
        expect(/name:\s*candidates-shard-\$\{\{\s*matrix\.shard\s*\}\}/.test(workflow)).toBe(true);
    });
});

/**
 * 씨앗 창고만 돌리는 길(2026-09-08).
 *
 * 힌트 창구를 열면서 실제 응답을 감사해야 하는데, 로컬엔 검색광고 키가 없고
 * 워크플로를 통째로 돌리면 BD 크레딧이 나간다. seedsOnly 입력으로 씨앗 잡만
 * 돌려 로그의 순위 구간 표본을 읽는다 — 무료 호출 200여 회뿐이다.
 */
describe('선점 보드 워크플로 — 씨앗만 돌리기', () => {
    it('seedsOnly 입력이 선언돼 있다', () => {
        expect(/seedsOnly:/.test(workflow)).toBe(true);
    });

    /*
     * 발굴과 발행 **둘 다** 막아야 한다. 발굴만 막으면 발행이 always() 로 돌아
     * 샤드 없이 합치기에서 죽고, 발행만 막으면 발굴이 무료 API 를 다 태운다.
     */
    it('seedsOnly 가 켜지면 발굴·발행 잡이 모두 멈춘다', () => {
        const guards = workflow.match(/inputs\.seedsOnly\s*!=\s*'true'/g) || [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
    });

    it('seedsOnly 면 창고를 강제로 다시 긁는다 — 3일 안쪽이면 그냥 끝나 감사가 안 된다', () => {
        const seedsJob = workflow.slice(workflow.indexOf('seeds:'), workflow.indexOf('discover:'));
        expect(/--force/.test(seedsJob)).toBe(true);
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
