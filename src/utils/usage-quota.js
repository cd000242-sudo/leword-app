const fs = require('fs');
const path = require('path');

// 간단한 사용량 쿼ота: 시간당 10회, 일일 100회
const HOURLY_LIMIT = 10;
const DAILY_LIMIT = 100;

function getStorePath() {
  try {
    // Electron 환경
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'usage-quota.json');
  } catch {
    // Node 환경
    let base;
    if (process.platform === 'win32') {
      base = process.env.APPDATA || process.env.USERPROFILE || process.cwd();
    } else if (process.platform === 'darwin') {
      base = path.join(process.env.HOME || '', 'Library', 'Application Support');
    } else {
      base = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config');
    }
    return path.join(base, 'blogger-gpt-cli', 'usage-quota.json');
  }
}

function readStore() {
  const file = getStorePath();
  try {
    if (fs.existsSync(file)) {
      const txt = fs.readFileSync(file, 'utf8');
      return JSON.parse(txt || '{}');
    }
  } catch {}
  return {};
}

function writeStore(data) {
  const file = getStorePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  } catch {}
}

// group: 'publish' | 'image' | 'crawl' 등
function checkAndIncrement(group) {
  const now = new Date();
  const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const dayKey = now.toISOString().slice(0, 10);  // YYYY-MM-DD
  const store = readStore();
  store[group] = store[group] || { hours: {}, days: {} };
  const g = store[group];
  g.hours[hourKey] = g.hours[hourKey] || 0;
  g.days[dayKey] = g.days[dayKey] || 0;

  // 오래된 키 정리(간단)
  try {
    for (const k of Object.keys(g.hours)) {
      if (k < hourKey) delete g.hours[k];
    }
    for (const k of Object.keys(g.days)) {
      if (k < dayKey) delete g.days[k];
    }
  } catch {}

  if (g.hours[hourKey] >= HOURLY_LIMIT) {
    return { ok: false, error: `시간당 호출 제한(최대 ${HOURLY_LIMIT}회)을 초과했습니다. 잠시 후 다시 시도해주세요.` };
  }
  if (g.days[dayKey] >= DAILY_LIMIT) {
    return { ok: false, error: `일일 호출 제한(최대 ${DAILY_LIMIT}회)을 초과했습니다. 내일 다시 시도해주세요.` };
  }

  g.hours[hourKey] += 1;
  g.days[dayKey] += 1;
  writeStore(store);
  return { ok: true };
}

module.exports = {
  checkAndIncrement,
  HOURLY_LIMIT,
  DAILY_LIMIT,
};







