/**
 * updater-autostart-regression.test.ts
 *
 * "나중에" 선택 후 앱 종료 시 설치는 진행하되 LEWORD가 마음대로 다시 뜨지 않도록
 * 자동 업데이트 실행 경로를 정적 회귀 테스트로 고정한다.
 */

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`FAIL ${name}${detail ? ' - ' + detail : ''}`);
  }
}

const root = path.join(__dirname, '..', '..', '..');
const updater = fs.readFileSync(path.join(root, 'src', 'updater.ts'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
const selfHeal = fs.readFileSync(path.join(root, 'src', 'self-heal.ts'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const installer = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');

assert('quitAndInstall no longer force-runs unconditionally',
  !/quitAndInstall\(false,\s*true\)/.test(updater)
    && /quitAndInstall\(false,\s*runAfterInstall\)/.test(updater),
  'unconditional forceRunAfter remains');

assert('"지금 재시작" path is the only explicit auto-relaunch path',
  /installDownloadedUpdate\(\{\s*runAfterInstall:\s*true\s*\}\)/.test(updater)
    && /명시적 재시작만 자동 실행/.test(updater),
  'explicit restart path missing');

assert('"나중에" then quit installs without relaunching',
  /installDownloadedUpdate\(\{\s*runAfterInstall:\s*false\s*\}\)/.test(main)
    && /설치 후 앱은 자동 실행하지 않습니다/.test(updater),
  'later/quit path still relaunches');

assert('NSIS finish page does not auto-run app by package config',
  /"runAfterFinish"\s*:\s*false/.test(packageJson),
  'package nsis.runAfterFinish is not false');

assert('installer customInstall does not ExecShell LEWORD',
  !/^\s*ExecShell\b/m.test(installer),
  'installer customInstall still has ExecShell');

assert('self-heal keeps RunOnce auto-start disabled',
  /auto install is disabled/.test(selfHeal)
    && /RunOnce auto-update entry disabled\/cleaned/.test(selfHeal)
    && !/reg add/i.test(selfHeal),
  'RunOnce auto-start can be registered');

assert('update progress never leaves the app hidden behind the update modal',
  /update flow active; keep main window visible/.test(main)
    && /keywordWindow\?\.show\(\);/.test(main)
    && /Users should be able to keep using LEWORD/.test(updater)
    && !/show 스킵/.test(main)
    && !/try \{ win\.hide\(\); \} catch \{\}/.test(updater),
  'update flow can still hide or skip the main app window');

console.log(`\n[updater-autostart-regression.test] passed: ${passed} / failed: ${failed}`);
if (failed > 0) {
  failures.forEach(f => console.error('  ' + f));
  process.exit(1);
}
process.exit(0);
