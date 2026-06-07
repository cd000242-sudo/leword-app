const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const DEFAULT_SCAN_PATHS = [
  '.codex-build-cache',
  'docs/mobile-store-assets.json',
  'docs/mobile-store-compliance.json',
  'docs/mobile-store-listing.json',
  'apps/mobile/eas.json',
  'apps/mobile/.env.production.example',
  'apps/api/.env.production.example',
];

const TEXT_EXTENSIONS = new Set([
  '.env',
  '.example',
  '.json',
  '.md',
  '.ps1',
  '.txt',
  '.yml',
  '.yaml',
]);

const ALLOWED_SECRET_VALUES = new Set([
  'true',
  'false',
  '<expo-token>',
  '<naver-client-id>',
  '<naver-client-secret>',
  '<naver-search-ad-access-license>',
  '<naver-search-ad-secret-key>',
  '<naver-search-ad-customer-id>',
  '<mobile-smoke-token>',
  '<base64-google-play-service-account-json>',
  '<apple-id@example.com>',
  '<app-store-connect-app-id>',
  '<apple-team-id>',
  '<apple-app-specific-password>',
  '<base64-app-store-connect-p8>',
  '<app-store-connect-api-key-issuer-id>',
  '<app-store-connect-api-key-id>',
  '<leword_mobile_reviewer_token_ready>',
]);

const SECRET_PATTERNS = [
  {
    name: 'GitHub token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    name: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
  },
  {
    name: 'PEM private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/g,
  },
  {
    name: 'Google service account private_key',
    pattern: /"private_key"\s*:\s*"[^"]*PRIVATE KEY[^"]*"/g,
  },
  {
    name: 'Google service account JSON',
    pattern: /"type"\s*:\s*"service_account"[\s\S]{0,500}"private_key_id"\s*:\s*"[A-Za-z0-9_-]{10,}"/g,
  },
  {
    name: 'Expo token',
    pattern: /\bexpo_[A-Za-z0-9_-]{20,}\b/g,
  },
];

function readArg(argv, name, fallback = '') {
  const equals = argv.find((arg) => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function resolvePath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
}

function toRelativePath(absolutePath) {
  return path.relative(root, absolutePath).replace(/\\/g, '/');
}

function isTextFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.env.production.example')) return true;
  return TEXT_EXTENSIONS.has(path.extname(lower));
}

function collectFiles(scanPaths = DEFAULT_SCAN_PATHS) {
  const files = [];

  for (const scanPath of scanPaths) {
    const resolved = resolvePath(scanPath);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      if (isTextFile(resolved)) files.push(resolved);
      continue;
    }
    if (!stat.isDirectory()) continue;

    const stack = [resolved];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const child = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(child);
        } else if (entry.isFile() && isTextFile(child)) {
          files.push(child);
        }
      }
    }
  }

  return [...new Set(files)].sort();
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function isAllowedGhSecretValue(value) {
  const trimmed = String(value || '').trim();
  if (ALLOWED_SECRET_VALUES.has(trimmed)) return true;
  if (/^<[^>]+>$/.test(trimmed)) return true;
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return true;
  if (/^https:\/\/(api\.)?leword\.app(?:\/[A-Za-z0-9/_-]+)?$/.test(trimmed)) return true;
  if (/^[0-9]{1,4}$/.test(trimmed)) return true;
  return false;
}

function scanGhSecretCommands(text, file) {
  const findings = [];
  const pattern = /gh secret set\s+([A-Z0-9_]+)\s+--body\s+(['"]?)([^\r\n'"]+)\2/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[3].trim();
    if (!isAllowedGhSecretValue(value)) {
      findings.push({
        file,
        line: lineNumberForIndex(text, match.index),
        type: 'GitHub secret command contains concrete value',
        evidence: `${match[1]}=${redact(value)}`,
      });
    }
  }
  return findings;
}

function redact(value) {
  const text = String(value || '');
  if (text.length <= 8) return '[redacted]';
  return `${text.slice(0, 4)}...[redacted]...${text.slice(-4)}`;
}

function scanText(text, file = '<inline>') {
  const findings = [];

  for (const rule of SECRET_PATTERNS) {
    let match;
    rule.pattern.lastIndex = 0;
    while ((match = rule.pattern.exec(text)) !== null) {
      findings.push({
        file,
        line: lineNumberForIndex(text, match.index),
        type: rule.name,
        evidence: redact(match[0]),
      });
    }
  }

  return findings.concat(scanGhSecretCommands(text, file));
}

function collectMobileReleaseSecretScan(options = {}) {
  const scanPaths = options.scanPaths || DEFAULT_SCAN_PATHS;
  const files = options.files || collectFiles(scanPaths);
  const findings = [];

  for (const filePath of files) {
    const absolutePath = resolvePath(filePath);
    if (!fs.existsSync(absolutePath)) continue;
    const text = fs.readFileSync(absolutePath, 'utf8');
    findings.push(...scanText(text, toRelativePath(absolutePath)));
  }

  return {
    generatedAt: new Date().toISOString(),
    ok: findings.length === 0,
    summary: {
      scannedFiles: files.length,
      findings: findings.length,
    },
    scanPaths,
    findings,
    checks: [
      {
        name: 'Mobile release artifacts contain no concrete secrets',
        ok: findings.length === 0,
        detail: findings.length === 0
          ? 'scanned release artifacts, setup drafts, store manifests, and mobile env examples'
          : 'remove concrete tokens/private keys from generated release artifacts before upload',
        severity: 'required',
      },
    ],
    blockers: findings.length === 0 ? [] : findings,
  };
}

function writeJson(report, outPath) {
  if (!outPath) return null;
  const resolved = resolvePath(outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolved;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const scanPaths = argv.includes('--paths')
    ? readArg(argv, '--paths', '').split(',').map((item) => item.trim()).filter(Boolean)
    : DEFAULT_SCAN_PATHS;
  const report = collectMobileReleaseSecretScan({ scanPaths });
  const written = writeJson(report, readArg(argv, '--out', ''));
  console.log(JSON.stringify({ ...report, written }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  collectFiles,
  collectMobileReleaseSecretScan,
  isAllowedGhSecretValue,
  scanText,
  writeJson,
};
