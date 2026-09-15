import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildGoldenLocalStages, GOLDEN_LOCAL_PROGRESS_CHANNEL, SITE_BOARD_URL } from '../golden-local-plan';

/**
 * 이 PC 황금키워드 찾기 배선(2026-09-15, 상위호환 2단계).
 * 안 불리는 모듈 · 설치판에 빠진 파일 · Bright Data 로 새는 길 · 추정치를 적는 화면을 막는다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('설치판에 실린다', () => {
  const files: string[] = JSON.parse(read('package.json')).build.files;
  const stages = buildGoldenLocalStages({ scriptsDir: 'scripts', workDir: 'w', stateFile: 's', destFile: 'd', topics: ['영화'] });
  const scripts = stages.map((stage) => path.basename(stage.script));

  it('연결 파일 · 네 스크립트 · 그 스크립트가 부르는 옆 파일이 build.files 에 있다', () => {
    const needed = new Set(['app-script-shim.js', ...scripts]);
    for (const name of scripts) {
      for (const match of read(`scripts/${name}`).matchAll(/require\('\.\/([^']+)'\)/g)) {
        needed.add(match[1].endsWith('.js') ? match[1] : `${match[1]}.js`);
      }
    }
    for (const name of needed) expect(files, name).toContain(`scripts/${name}`);
  });

  it('스크립트가 부르는 ../src 모듈은 전부 src 에 있다 — 컴파일본(dist)으로 실린다', () => {
    for (const name of scripts) {
      for (const match of read(`scripts/${name}`).matchAll(/require\('\.\.\/src\/([^']+)'\)/g)) {
        expect(fs.existsSync(path.join(root, 'src', `${match[1]}.ts`)), `${name} → ${match[1]}`).toBe(true);
      }
    }
    expect(files).toContain('dist/**/*');
  });
});

describe('앱에 배선된다', () => {
  const handler = read('src/main/handlers/golden-local.ts');

  it('진행 채널이 프리로드 허용 목록에 있다', () => {
    expect(read('preload.ts')).toContain(`'${GOLDEN_LOCAL_PROGRESS_CHANNEL}',`);
  });

  it('핸들러를 등록하고 새벽 차례를 켜고, 앱을 닫을 때 끈다', () => {
    const orchestrator = read('src/main/keywordMasterIpcHandlers.ts');
    expect(orchestrator).toContain("from './handlers/golden-local'");
    expect(orchestrator).toMatch(/setupGoldenLocalHandlers\(\);\s*\n\s*startGoldenLocalScheduler\(\);/);
    const stopAt = orchestrator.indexOf('export function stopMyLaneSchedulers');
    expect(stopAt).toBeGreaterThan(-1);
    expect(orchestrator.slice(stopAt, stopAt + 400)).toContain('stopGoldenLocalScheduler();');
  });

  it('자식 프로세스는 앱 실행 파일의 노드 모드 + 연결 파일 — Bright Data 토큰은 비워서 넘긴다', () => {
    expect(handler).toContain('execPath: process.execPath');
    expect(handler).toContain("ELECTRON_RUN_AS_NODE: '1'");
    expect(handler).toContain("LEWORD_APP_USER_DATA: app.getPath('userData')");
    expect(handler).toContain("BRIGHTDATA_TOKEN: ''");
    expect(handler).toContain("LEWORD_CHROME_PATH: findChromePath() || ''");
    expect(handler).toContain("'app-script-shim.js'");
    expect(handler).not.toMatch(/fetcher=brightdata/);
  });

  it('앱을 닫으면 자식 프로세스를 트리째 끊는다', () => {
    expect(handler).toMatch(/app\.on\('before-quit', \(\) => \{ requestAbort\(true\); \}\)/);
  });

  it('새벽 차례는 5시 이후 하루 한 번 — 자리 감시가 도는 중이면 기다린다', () => {
    expect(handler).toContain('export const GOLDEN_LOCAL_RUN_HOUR = 5;');
    expect(handler).toContain('isWatchDue(state.nightly.lastRunAt, new Date(), GOLDEN_LOCAL_RUN_HOUR)');
    expect(handler).toContain('isSeatWatchRunning()');
    expect(read('src/main/handlers/seat-watch.ts')).toContain('export function isSeatWatchRunning(): boolean');
  });

  it('발굴 화면의 사이트 판 행에 이 PC 판을 합친다 — 사이트 판 주소는 한 곳', () => {
    const board = read('src/main/handlers/preemption-board.ts');
    expect(board).toContain("buildSiteGoldenRows(localBoard, category, reseats, 'app-board')");
    expect(board).toContain('mergeGoldenBoardRows(siteRows, localRows)');
    expect(board).toContain(`const PUBLISHED = '${SITE_BOARD_URL}';`);
  });
});

describe('발굴 화면의 이 PC 판 패널', () => {
  const html = read('ui/keyword-master.html');
  const panelStart = html.indexOf('<div id="goldenLocalPanel"');
  const panel = html.slice(panelStart, html.indexOf('<!-- 진행 상태 -->', panelStart));
  const tableStart = html.indexOf('function displayGoldenResults(results)');
  const script = html.slice(html.indexOf('window.goldenIsBoardRow = function'), tableStart);

  it('발굴 조건 줄 바로 아래에 찾기 · 멈추기 · 새벽 자동이 있다', () => {
    expect(panelStart).toBeGreaterThan(html.indexOf('id="goldenCondBody"'));
    expect(panel).toContain('onclick="goldenLocalRun()"');
    expect(panel).toContain('onclick="goldenLocalAbort()"');
    expect(panel).toContain('onchange="goldenLocalToggleAuto(this.checked)"');
  });

  it('메인 채널을 부르고 진행을 구독한다 — 끝나면 사이트 판 행을 다시 받는다', () => {
    for (const channel of ['golden-local-status', 'golden-local-topics', 'golden-local-run', 'golden-local-abort', 'golden-local-auto']) {
      expect(script, channel).toContain(`'${channel}'`);
    }
    expect(script).toContain(`window.electronAPI.on('${GOLDEN_LOCAL_PROGRESS_CHANNEL}'`);
    expect(script).toMatch(/p\.type === 'run-end'[\s\S]{0,500}window\.loadGoldenSiteRows\(\)/);
    const load = html.slice(html.indexOf('window.loadGoldenSiteRows = async function'), html.indexOf('window.goldenMergeSiteRows = function'));
    expect(load).toContain('window.goldenLocalRefresh()');
  });

  it('걸릴 시간을 지어내지 않는다 — 지난 시간만 적는다', () => {
    expect(panel + script).not.toMatch(/예상|남은 시간|약 \d+분|분 걸/);
    expect(script).toContain('지난 시간');
  });

  it('이 PC 판 줄은 판 줄로 그리고 배지 · 자리 칸 · 개수를 따로 적는다', () => {
    const table = html.slice(tableStart, html.indexOf('const laneEsc'));
    expect(table).not.toContain("item.source === 'site-board' ? window.");
    expect(table).toContain('window.goldenIsBoardRow(item) ? window.goldenSiteBadge(item)');
    expect(table).toContain('window.goldenIsBoardRow(item) ? window.goldenSiteSeatHtml(item)');
    expect(table).toContain("<span>이 PC 판 ${results.filter((r) => r && r.source === 'app-board').length}개</span>");
    const helpers = html.slice(html.indexOf('window.goldenSiteBadge = function'), html.indexOf('window.goldenIsBoardRow = function'));
    expect(helpers).toContain("item.source === 'app-board'");
    expect(helpers).toContain('이 PC 가 잼');
    expect(helpers).toContain('사이트가 잼');
  });

  it('마지막 회차는 고른 주제 행과 스크립트가 센 요약 숫자를 그대로 적는다 — "끝"만 적지 않는다', () => {
    // 연기 시험(2026-09-15): 인테리어·DIY 회차가 자리 통과 14행 → 발행 3행 · 고른 주제 0행이었는데 패널에는 "끝"만 보였다.
    const handler = read('src/main/handlers/golden-local.ts');
    expect(handler).toContain('pickedRows: boardRows(topics)');
    expect(handler).toMatch(/event\.line\.kind === 'summary' && event\.line\.stage !== 'trim'/);
    expect(script).toContain("'고른 주제 ' + last.pickedRows + '행'");
    expect(script).toContain('last.summaries.filter(Boolean)');
  });
});
