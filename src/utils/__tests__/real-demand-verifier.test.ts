/**
 * real-demand-verifier 회귀 — 자동완성 실측 기반 실수요 증명 게이트.
 *
 * 고정하는 계약:
 * 1. echo(동일)/extension(키워드로 시작) 제안 → real, 무관·빈 제안(왕복 성공) → fake
 * 2. 프로브 왕복 실패(ok=false)/예외/예산 초과 → unknown (판정 미저장 — 삭제 근거 금지)
 * 3. 판정 파일 캐시 왕복 + 재검증 주기
 * 4. 장애 안전장치: 신규 판정 8개+ 전원 fake 면 판정 폐기(unknown 회귀)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RealDemandVerifier } from '../../mobile/real-demand-verifier';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`[real-demand-verifier.test] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

async function run(): Promise<void> {
  let passed = 0;
  const ok = (name: string, condition: boolean, detail?: string) => {
    assert(name, condition, detail);
    passed += 1;
  };

  const probeCalls: string[] = [];
  const probeMap = new Map<string, { ok: boolean; suggestions: string[] }>();
  const probe = async (query: string) => {
    probeCalls.push(query);
    const found = probeMap.get(query.replace(/\s+/g, ' ').trim());
    if (!found) return { ok: true, suggestions: [] };
    return found;
  };

  const fixedNow = new Date('2026-07-18T12:00:00.000Z');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-real-demand-'));
  const cacheFile = path.join(tmpDir, 'real-demand-verifier-test.json');
  const verifier = new RealDemandVerifier({
    probe,
    cacheFile,
    requestDelayMs: 0,
    now: () => new Date(fixedNow),
  });

  probeMap.set('근로장려금 신청 방법', { ok: true, suggestions: ['근로장려금 신청방법', '근로장려금 신청 방법 2026'] });
  probeMap.set('청년월세지원 대상', { ok: true, suggestions: ['청년월세지원 대상 조건', '청년월세지원'] });
  probeMap.set('단백질보충제순위준비물', { ok: true, suggestions: ['단백질보충제 순위', '단백질보충제 추천'] });
  probeMap.set('유령키워드지급일', { ok: true, suggestions: [] });
  probeMap.set('네트워크실패 키워드', { ok: false, suggestions: [] });

  const verdicts = await verifier.verify([
    '근로장려금 신청 방법',
    '청년월세지원 대상',
    '단백질보충제순위준비물',
    '유령키워드지급일',
    '네트워크실패 키워드',
  ], 10);
  ok('echo suggestion proves real demand', verdicts.get('근로장려금신청방법') === 'real');
  ok('extension suggestion proves real demand', verdicts.get('청년월세지원대상') === 'real');
  ok('prefix-only suggestions do not prove the full combo', verdicts.get('단백질보충제순위준비물') === 'fake');
  ok('empty suggestions on a successful roundtrip mean fake', verdicts.get('유령키워드지급일') === 'fake');
  ok('probe failure yields unknown, never fake', verdicts.get('네트워크실패키워드') === 'unknown');
  ok('unknown verdicts are not persisted', verifier.verdictFor('네트워크실패 키워드') === null);
  ok('real/fake verdicts are persisted to the cache file',
    fs.existsSync(cacheFile) && verifier.verdictFor('근로장려금 신청 방법')?.result === 'real');

  const callsBefore = probeCalls.length;
  const cachedRound = await verifier.verify(['근로장려금 신청 방법', '단백질보충제순위준비물'], 10);
  ok('cached verdicts skip network calls',
    probeCalls.length === callsBefore
      && cachedRound.get('근로장려금신청방법') === 'real'
      && cachedRound.get('단백질보충제순위준비물') === 'fake');

  const reloaded = new RealDemandVerifier({
    probe,
    cacheFile,
    requestDelayMs: 0,
    now: () => new Date(fixedNow),
  });
  ok('verdicts survive a cache file round-trip', reloaded.verdictFor('유령키워드지급일')?.result === 'fake');

  const futureCacheFile = path.join(tmpDir, 'future-real-demand-verdict.json');
  fs.writeFileSync(futureCacheFile, JSON.stringify({
    version: 1,
    verdicts: {
      '미래 위조 키워드': {
        result: 'real',
        via: 'extension',
        checkedAt: '2036-07-18T12:00:00.000Z',
      },
      '허용 시계 오차 키워드': {
        result: 'real',
        via: 'echo',
        checkedAt: '2026-07-18T12:04:00.000Z',
      },
    },
  }), 'utf8');
  const futureVerifier = new RealDemandVerifier({
    probe,
    cacheFile: futureCacheFile,
    requestDelayMs: 0,
    now: () => new Date(fixedNow),
  });
  ok('far-future cached verdicts never become current hidden-known proof',
    futureVerifier.verdictFor('미래 위조 키워드') === null);
  ok('small provider clock skew remains usable',
    futureVerifier.verdictFor('허용 시계 오차 키워드')?.result === 'real');

  const budgetRound = await verifier.verify(['예산초과 신규 키워드'], 0);
  ok('budget exhaustion yields unknown', budgetRound.get('예산초과신규키워드') === 'unknown');

  const outageProbe = async () => ({ ok: true, suggestions: [] as string[] });
  const outageVerifier = new RealDemandVerifier({ probe: outageProbe, requestDelayMs: 0 });
  const outageKeywords = Array.from({ length: 9 }, (_, i) => `장애의심 키워드 ${i + 1}`);
  const outageVerdicts = await outageVerifier.verify(outageKeywords, 20);
  ok('all-fake fresh batch is treated as suspicious and rolled back to unknown',
    outageKeywords.every((kw) => outageVerdicts.get(kw.toLowerCase().replace(/\s+/g, '')) === 'unknown')
      && outageVerifier.verdictFor(outageKeywords[0]) === null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`[real-demand-verifier.test] passed: ${passed} / failed: 0`);
}

run().catch((err) => {
  console.error('[real-demand-verifier.test] FAILED:', (err as Error).message);
  process.exit(1);
});
