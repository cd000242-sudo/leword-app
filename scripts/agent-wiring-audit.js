#!/usr/bin/env node
/*
 * 에이전트 연동 배선 점검 — "화면마다 다른 답을 하는" 상태를 끝내기 위한 하네스.
 *
 * 왜 만들었나(사장님 지시 2026-08-22):
 *   "사용자 입장에서 에이전트가 무조건 연동되고 플랜과 사용량 확인이 잘돼야 한다.
 *    내가 쓰다가 이런 에러가 뜬 거면 하네스가 문제 있는 거 아니냐.
 *    구독이 낮거나 구독이 안 돼서 안 되는 것 외엔 잘돼야 한다."
 *
 *   실제로 같은 순간에 세 화면이 서로 다른 말을 했다:
 *     앱 모달        → 클로드·코덱스·제미나이·그록 전부 "연동됨"
 *     내 API 키 탭   → "연동됨(앱·구독)"
 *     유튜브 글감 카드 → "내 API 키 탭에서 엔진 하나만 연동하면 글감 추론이 됩니다"
 *
 * 무엇을 재나(전부 실측, 추정 없음):
 *   ① 앱 브리지가 살아 있나 · 엔진 4종의 installed/loggedIn/available/plan
 *   ② 말만 available 인지, **진짜 추론이 돌아가는지**(짧은 프롬프트 왕복)
 *   ③ 사이트 기능마다 어느 경로를 쓰나 — 앱 브리지인가, 서버 토큰인가
 *   ④ 서버(워커) 경로가 요구하는 자격이 실제로 있나
 *
 * 실행: node scripts/agent-wiring-audit.js [--run]   (--run 이면 ② 실행 왕복까지)
 * 구독으로 도는 경로라 ② 도 추가 비용은 없다. 다만 시간이 걸려 기본은 끈다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BRIDGE = 'http://127.0.0.1:47615';
const SITE_REPO = process.env.LEWORD_SITE_REPO
  || path.join(__dirname, '..', 'tmp', 'leaderspro-admin-work');
const WORKER = process.env.LEWORD_WORKER_FILE
  || path.join(__dirname, '..', 'tmp', 'cf-worker', 'worker.js');
const ENGINES = ['claude', 'codex', 'gemini', 'grok'];
const DO_RUN = process.argv.includes('--run');

const findings = [];
const fail = (area, message, detail) => findings.push({ level: 'fail', area, message, detail });
const warn = (area, message, detail) => findings.push({ level: 'warn', area, message, detail });

async function ask(pathname, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BRIDGE + pathname, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, error: String((error && error.message) || error) };
  } finally {
    clearTimeout(timer);
  }
}

/** ① 브리지 상태 — 앱이 CLI 넷을 실제로 찔러 본 결과다. */
async function auditBridge() {
  console.log('\n① 앱 브리지 상태');
  const probe = await ask('/v1/bridge/status', undefined, 30_000);
  if (probe.status !== 200 || !probe.body || !probe.body.ok) {
    fail('브리지', '앱 브리지에 닿지 않습니다(앱이 꺼져 있거나 포트가 다릅니다).', probe.error || `HTTP ${probe.status}`);
    console.log('   ❌ 연결 실패:', probe.error || probe.status);
    return null;
  }
  console.log(`   앱 ${probe.body.app} v${probe.body.version}`);
  const agents = new Map((probe.body.agents || []).map((a) => [a.provider, a]));
  for (const engine of ENGINES) {
    const agent = agents.get(engine);
    if (!agent) {
      fail('브리지', `${engine}: 상태 응답에 아예 없습니다.`);
      console.log(`   ❌ ${engine.padEnd(7)} 응답에 없음`);
      continue;
    }
    const mark = agent.available ? '✅' : (agent.installed ? '⚠️ ' : '❌');
    console.log(`   ${mark} ${engine.padEnd(7)} 설치 ${agent.installed ? 'O' : 'X'} · 로그인 ${agent.loggedIn ? 'O' : 'X'}`
      + ` · 플랜 "${agent.plan || ''}" · ${String(agent.detail || '').slice(0, 44)}`);
    /*
     * 플랜은 사장님이 화면에서 보는 값이다. 다만 **알 수 있는 것과 없는 것**을
     * 갈라야 한다 — 안 그러면 고칠 수 없는 경고가 영원히 남아 하네스를 못 믿는다.
     *   클로드 : `claude` 상태가 구독 유형을 준다(예: max) — 비면 배선이 샌 것이다.
     *   코덱스 : 인증 파일 id_token 에 chatgpt_plan_type 이 있다 — 비면 못 읽은 것.
     *   제미나이·그록 : CLI 가 플랜을 아예 안 알려 준다(실측). 비어 있는 게 사실이다.
     */
    const PLAN_KNOWABLE = new Set(['claude', 'codex']);
    if (agent.available && !String(agent.plan || '').trim()) {
      if (PLAN_KNOWABLE.has(engine)) {
        fail('플랜', `${engine}: 플랜을 알 수 있는 엔진인데 빈 값입니다(배선이 샜습니다).`, String(agent.detail || ''));
      } else {
        console.log(`      ↳ 플랜 미제공(${engine} CLI 가 안 알려 줌) — 화면도 그렇게 적어야 한다`);
      }
    }
    if (agent.installed && !agent.loggedIn) {
      warn('로그인', `${engine}: 설치는 됐는데 로그인 전입니다.`, String(agent.detail || ''));
    }
  }
  return agents;
}

/** ② 진짜 도는가 — 상태가 available 이라고 말하는 것과 실행되는 것은 다른 사실이다. */
async function auditRun(agents) {
  console.log('\n② 실제 추론 왕복(--run)');
  if (!DO_RUN) { console.log('   (건너뜀 — --run 을 붙이면 잽니다)'); return; }
  for (const engine of ENGINES) {
    const agent = agents && agents.get(engine);
    if (!agent || !agent.available) { console.log(`   ─  ${engine.padEnd(7)} available 아님 — 실행 안 함`); continue; }
    const started = Date.now();
    const result = await ask('/v1/bridge/kin-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: '테스트: 이 문장에 "확인"이라고만 답해 주세요',
        body: '', withLink: false, blogUrl: '', provider: engine,
      }),
    }, 150_000);
    const took = Math.round((Date.now() - started) / 1000);
    const answer = result.body && result.body.result && result.body.result.answer;
    if (result.status === 200 && result.body && result.body.ok && String(answer || '').trim()) {
      console.log(`   ✅ ${engine.padEnd(7)} ${took}초 · ${String(answer).replace(/\s+/g, ' ').slice(0, 40)}`);
    } else {
      const why = (result.body && result.body.error) || result.error || `HTTP ${result.status}`;
      fail('실행', `${engine}: 상태는 available 인데 실제 추론이 실패했습니다.`, String(why).slice(0, 160));
      console.log(`   ❌ ${engine.padEnd(7)} ${took}초 · ${String(why).slice(0, 70)}`);
    }
  }
}

/**
 * ③ 사이트 기능이 어느 경로를 쓰나.
 *
 * 서버(워커)만 부르는 화면은 앱이 아무리 연동돼 있어도 "연동하세요"를 띄운다 —
 * 워커는 클라우드에서 도는지라 이 PC 의 CLI 로그인에 닿을 수 없기 때문이다.
 * 그 화면이 앱 브리지 폴백을 갖고 있는지 코드에서 확인한다.
 */
function auditSiteWiring() {
  console.log('\n③ 사이트 화면별 경로');
  const dir = path.join(SITE_REPO, 'spa', 'src', 'components', 'leword');
  if (!fs.existsSync(dir)) {
    warn('사이트', '사이트 레포를 못 찾아 배선을 확인하지 못했습니다.', dir);
    console.log('   (건너뜀 —', dir, '없음)');
    return;
  }
  const screens = [
    { file: 'YoutubeTab.tsx', label: '유튜브 글감' },
    { file: 'KinGoldenTab.tsx', label: '지식인 답변' },
    /*
     * 레이더는 추론 말고도 **브라이트데이터 키**가 있어야 도는 화면이다.
     * 그 키는 어차피 내 API 키 탭에 넣어야 하므로, 같은 자리에서 엔진 토큰도
     * 넣는 것이 자연스럽다. 앱 폴백을 붙여도 BD 키가 없으면 못 도니까
     * 여기서는 "서버 전용"이 정상이고, 대신 **화면이 그 사실을 말하는지** 본다.
     */
    { file: 'RadarTab.tsx', label: '외부유입 레이더', serverOnly: 'BrightData 키' },
    { file: 'AnalyzeTab.tsx', label: '글 진단' },
    { file: 'GoldenTab.tsx', label: '황금 보드' },
    { file: 'AffiliateTab.tsx', label: '제휴' },
  ];
  for (const screen of screens) {
    const full = path.join(dir, screen.file);
    if (!fs.existsSync(full)) continue;
    const code = fs.readFileSync(full, 'utf8');
    // 워커를 부르는 화면인가 — needs-keys 를 돌려받을 수 있는 경로다.
    const usesWorker = /from '\.\.\/\.\.\/lib\/keywordApi'/.test(code)
      && /fetch[A-Z]\w+\(/.test(code);
    const usesBridge = /from '\.\.\/\.\.\/lib\/bridge'/.test(code);
    let mark = '✅';
    let note = '앱 폴백 있음';
    if (screen.serverOnly) {
      /*
       * 서버 전용 화면은 "왜 앱으로 안 되는지"를 말해 줘야 한다.
       * 그냥 "엔진을 연동하세요"만 뜨면, 앱에서 네 엔진이 다 연동된 사용자는
       * 무엇을 더 해야 하는지 알 수가 없다(사장님이 겪은 그 화면이다).
       */
      const explains = new RegExp(String(screen.serverOnly).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(code)
        || /브라이트|brightdata/i.test(code);
      if (explains) {
        note = `서버 전용(${screen.serverOnly} 필요) · 화면이 그 자격을 안내함`;
      } else {
        mark = '❌';
        note = `서버 전용(${screen.serverOnly} 필요)인데 화면이 그 사실을 안 알려 준다`;
        fail('안내', `${screen.label}: ${screen.serverOnly}가 따로 필요한데 화면이 "엔진 연동"만 안내합니다.`, screen.file);
      }
    } else if (usesWorker && !usesBridge) {
      mark = '❌';
      note = '서버만 부름 — 앱이 연동돼 있어도 "연동하세요"가 뜬다';
      fail('배선', `${screen.label}: 서버 경로만 있고 앱 브리지 폴백이 없습니다.`, screen.file);
    } else if (!usesWorker && usesBridge) {
      note = '앱만 부름';
    } else if (!usesWorker && !usesBridge) {
      note = '추론 경로 없음(정적 데이터 화면)';
    }
    console.log(`   ${mark} ${screen.label.padEnd(12)} ${note}`);
  }
}

/** ④ 서버 경로가 요구하는 자격 — 무엇이 있어야 needs-keys 를 안 뱉나. */
function auditWorkerRequirement() {
  console.log('\n④ 서버(워커)가 요구하는 자격');
  if (!fs.existsSync(WORKER)) {
    warn('워커', '워커 파일을 못 찾아 요구 자격을 확인하지 못했습니다.', WORKER);
    console.log('   (건너뜀 —', WORKER, '없음)');
    return;
  }
  const code = fs.readFileSync(WORKER, 'utf8');
  const hit = code.match(/function hasAnyEngine\(keys\)\s*\{[\s\S]*?\n\}/);
  if (!hit) {
    warn('워커', 'hasAnyEngine 을 못 찾았습니다 — 요구 자격을 확인하지 못했습니다.');
    return;
  }
  const wanted = [...hit[0].matchAll(/k\.(\w+)/g)].map((m) => m[1]);
  console.log('   서버가 인정하는 자격:', wanted.join(' · ') || '(없음)');
  const needsCount = (code.match(/error: 'needs-keys'/g) || []).length;
  console.log(`   needs-keys 를 돌려주는 기능: ${needsCount}곳`);
  console.log('   ※ 이 자격은 전부 **사이트에 저장된 토큰**이다. 이 PC 의 CLI 로그인은');
  console.log('     클라우드에서 못 쓴다 — 그래서 앱만 연동된 상태로 서버 기능을 부르면');
  console.log('     "연동하세요"가 뜨는 것이 정상 동작이다. 화면이 앱으로 넘어가야 한다.');
}

(async () => {
  console.log('='.repeat(66));
  console.log('에이전트 연동 배선 점검  ' + new Date().toISOString().slice(0, 19));
  console.log('='.repeat(66));

  const agents = await auditBridge();
  await auditRun(agents);
  auditSiteWiring();
  auditWorkerRequirement();

  console.log('\n' + '='.repeat(66));
  const fails = findings.filter((f) => f.level === 'fail');
  const warns = findings.filter((f) => f.level === 'warn');
  console.log(`판정: 치명 ${fails.length}건 · 경고 ${warns.length}건`);
  for (const item of [...fails, ...warns]) {
    console.log(`  ${item.level === 'fail' ? '❌' : '⚠️ '} [${item.area}] ${item.message}`);
    if (item.detail) console.log(`       ${String(item.detail).slice(0, 100)}`);
  }
  process.exitCode = fails.length > 0 ? 1 : 0;
})();
