const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const apiPort = Number(process.env.LEWORD_API_PORT || 34983);

function findLanIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.family !== 'IPv4' || entry.internal) continue;
      if (/^(127|169\.254)\./.test(entry.address)) continue;
      return entry.address;
    }
  }
  return '127.0.0.1';
}

const lanIp = process.env.LEWORD_MOBILE_DEV_HOST || findLanIp();
const apiUrl = process.env.EXPO_PUBLIC_LEWORD_API_URL || `http://${lanIp}:${apiPort}`;
let shuttingDown = false;
const children = [];

function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(0), 300);
}

function spawnLogged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    env: options.env || process.env,
    shell: options.shell ?? (process.platform === 'win32'),
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`[mobile-dev] ${name} exited with ${code}`);
    stopAll();
  });

  return child;
}

console.log('');
console.log('[LEWORD mobile dev]');
console.log(`API URL for phone: ${apiUrl}`);
console.log('Open Expo Go on the phone and scan the QR code printed by Expo.');
console.log('Phone and this PC must be on the same Wi-Fi network.');
console.log('');

children.push(spawnLogged('api', 'npm', ['--prefix', 'apps/api', 'run', 'start'], {
  env: {
    ...process.env,
    LEWORD_API_HOST: process.env.LEWORD_API_HOST || '0.0.0.0',
    LEWORD_API_PORT: String(apiPort),
  },
}));

setTimeout(() => {
  children.push(spawnLogged(
    'expo',
    process.execPath,
    [
      'scripts/run-mobile-command.js',
      '--cwd',
      'apps/mobile',
      '--',
      'npx',
      'expo',
      'start',
      '--lan',
    ],
    {
      env: {
        ...process.env,
        EXPO_PUBLIC_LEWORD_API_URL: apiUrl,
      },
      shell: false,
    },
  ));
}, 1200);

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
