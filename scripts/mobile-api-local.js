const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const port = String(process.env.LEWORD_API_PORT || 34983);
const host = process.env.LEWORD_API_HOST || '0.0.0.0';

function findLanIps() {
  const result = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue;
      if (/^(127|169\.254)\./.test(entry.address)) continue;
      result.push(entry.address);
    }
  }
  return result;
}

const lanIps = findLanIps();
const publicApiUrl = process.env.LEWORD_PUBLIC_API_URL
  || (lanIps[0] ? `http://${lanIps[0]}:${port}` : `http://127.0.0.1:${port}`);

console.log('');
console.log('[LEWORD mobile API local]');
console.log(`Listening host: ${host}:${port}`);
console.log(`Phone API URL: ${publicApiUrl}`);
console.log('Keep this terminal open while testing the installed APK.');
console.log('');

const child = spawn('npm', ['--prefix', 'apps/api', 'run', 'start'], {
  cwd: root,
  env: {
    ...process.env,
    LEWORD_API_HOST: host,
    LEWORD_API_PORT: port,
    LEWORD_PUBLIC_API_URL: publicApiUrl,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
