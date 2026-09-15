import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import type { GoldenLocalStage } from '../golden-local-plan';
import { startGoldenLocalRun, type GoldenLocalEvent } from '../golden-local-runner';

/**
 * 네 단계 실행기(2026-09-15, 황금키워드 상위호환 2단계).
 * 진짜 자식 프로세스를 노드로 띄워 본다 — 문자열 비교로는 멈추기 · 끊긴 한글 · 뒤 단계 안 부르기를 못 잡는다.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-local-runner-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const noopShim = path.join(dir, 'noop-shim.js');
fs.writeFileSync(noopShim, "'use strict';\n", 'utf8');

function script(name: string, body: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function run(stages: GoldenLocalStage[]) {
  const events: GoldenLocalEvent[] = [];
  const handle = startGoldenLocalRun(stages, {
    execPath: process.execPath,
    shimPath: noopShim,
    cwd: dir,
    env: { ...process.env },
    onEvent: (event) => events.push(event),
  });
  return { handle, events };
}

const lineTexts = (events: GoldenLocalEvent[]) => events.flatMap((event) => (event.type === 'line' ? [event.line.text] : []));

const TOPIC_LINE = '  OK 인테리어·DIY        씨앗 396 → 완결 14262(조각 838·이탈 0 제외) → 수요통과 699(식음 30·부패 0·카드 7 제외) → 무료선별   2 제외 → 후보  80건  4235초';

describe('네 단계 실행기', () => {
  it('차례로 돌고 알아본 줄만 넘긴다 — 비밀값 줄 · 모듈 로그는 빠진다', async () => {
    const candidates = script('ok-candidates.js', [
      "console.log('[ENV] Config 파일 경로: C:/x/config.json');",
      "console.log(\"  customerIdValue: '1234567'\");",
      `console.log(${JSON.stringify(TOPIC_LINE)});`,
    ].join('\n'));
    const trim = script('ok-trim.js', "console.log('후보 342 → 320건 (주제당 80)');");
    const { handle, events } = run([
      { key: 'candidates', label: '후보 찾기', script: candidates, args: [] },
      { key: 'trim', label: '후보 다듬기', script: trim, args: [] },
    ]);
    const result = await handle.done;
    expect(result).toMatchObject({ ok: true, aborted: false, completed: ['candidates', 'trim'], stoppedAt: null });
    expect(events.map((event) => event.type)).toEqual(['stage-start', 'line', 'stage-end', 'stage-start', 'line', 'stage-end']);
    expect(lineTexts(events)).toEqual(['인테리어·DIY — 씨앗 396개 · 문장 14262개에서 후보 80건 (71분)', '후보 342건을 320건으로 다듬었습니다']);
    expect(JSON.stringify({ events, tail: result.tail })).not.toMatch(/1234567|customerId|config\.json/);
  });

  it('인자를 스크립트에 그대로 넘긴다', async () => {
    const echo = script('echo-args.js', "console.log('후보 ' + process.argv.slice(2).length + ' → ' + process.argv.slice(2).length + '건');");
    const { handle, events } = run([{ key: 'trim', label: '후보 다듬기', script: echo, args: ['--in=a b.json', '--keep=80'] }]);
    await handle.done;
    expect(lineTexts(events)).toEqual(['후보 2건을 2건으로 다듬었습니다']);
  });

  it('한 단계가 실패하면 뒤 단계는 부르지 않는다', async () => {
    const marker = path.join(dir, 'never-ran.txt');
    const failing = script('fail.js', "console.error('실패: 검색광고 429'); process.exit(1);");
    const never = script('never.js', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');`);
    const { handle, events } = run([
      { key: 'candidates', label: '후보 찾기', script: failing, args: [] },
      { key: 'trim', label: '후보 다듬기', script: never, args: [] },
    ]);
    const result = await handle.done;
    expect(result).toMatchObject({ ok: false, aborted: false, completed: [], stoppedAt: 'candidates', exitCode: 1 });
    expect(result.message).toBe('후보 찾기 단계가 실패했습니다(종료 코드 1). 실패: 검색광고 429');
    expect(events.filter((event) => event.type === 'stage-start')).toHaveLength(1);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('할 것이 없어 멈춘 단계는 실패가 아니다 — 뒤 단계는 부르지 않는다', async () => {
    const empty = script('batch-empty.js', "console.error('중단 — 검색량 조건만으로 후보 전량이 탈락한다.'); process.exit(3);");
    const publish = script('publish-never.js', 'process.exit(0);');
    const { handle, events } = run([
      { key: 'batch', label: '자리 재기', script: empty, args: [] },
      { key: 'publish', label: '이 PC 판에 싣기', script: publish, args: [] },
    ]);
    const result = await handle.done;
    expect(result).toMatchObject({ ok: true, aborted: false, stoppedAt: 'batch', exitCode: 3 });
    expect(events.filter((event) => event.type === 'stage-start')).toHaveLength(1);
  });

  it('멈추면 도는 프로세스를 끊고 멈춤으로 끝난다', async () => {
    const forever = script('forever.js', "console.log('후보 1 → 1건'); setInterval(() => {}, 1000);");
    const { handle, events } = run([
      { key: 'trim', label: '후보 다듬기', script: forever, args: [] },
      { key: 'publish', label: '이 PC 판에 싣기', script: forever, args: [] },
    ]);
    await new Promise<void>((resolve) => {
      const wait = setInterval(() => {
        if (events.some((event) => event.type === 'line')) {
          clearInterval(wait);
          resolve();
        }
      }, 20);
    });
    handle.abort();
    const result = await handle.done;
    expect(result).toMatchObject({ ok: false, aborted: true, stoppedAt: 'trim' });
    expect(events.filter((event) => event.type === 'stage-start')).toHaveLength(1);
  }, 20000);

  it('한글이 청크 경계에서 잘려도 줄을 그대로 읽는다', async () => {
    const bytes = [...Buffer.from('후보 342 → 320건 (주제당 80)\n', 'utf8')];
    const split = script('split.js', [
      `const bytes = Buffer.from(${JSON.stringify(bytes)});`,
      'process.stdout.write(bytes.subarray(0, 4));',
      'setTimeout(() => process.stdout.write(bytes.subarray(4)), 50);',
    ].join('\n'));
    const { handle, events } = run([{ key: 'trim', label: '후보 다듬기', script: split, args: [] }]);
    await handle.done;
    expect(lineTexts(events)).toEqual(['후보 342건을 320건으로 다듬었습니다']);
  });

  it('프로그램을 못 띄우면 실패로 끝난다', async () => {
    const handle = startGoldenLocalRun([{ key: 'trim', label: '후보 다듬기', script: 'x.js', args: [] }], {
      execPath: path.join(dir, 'no-such-program.exe'),
      shimPath: noopShim,
      cwd: dir,
      env: { ...process.env },
    });
    const result = await handle.done;
    expect(result).toMatchObject({ ok: false, aborted: false, stoppedAt: 'trim' });
  });
});
