const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'leword-mobile-api-image-manifest-v1';
const ALLOWED_FIELDS = Object.freeze([
  'schemaVersion',
  'repository',
  'commitSha',
  'imageRepository',
  'manifestDigest',
  'imageReference',
  'workflowRunId',
  'workflowName',
  'jobName',
]);

function requiredText(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function exactRepository(value, name = 'repository') {
  const text = requiredText(value, name);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) {
    throw new Error(`${name} is invalid`);
  }
  return text;
}

function exactCommitSha(value) {
  const text = requiredText(value, 'commitSha');
  if (!/^[0-9a-f]{40}$/.test(text)) throw new Error('commitSha must be a full lowercase SHA');
  return text;
}

function exactImageRepository(value) {
  const text = requiredText(value, 'imageRepository');
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(text)) {
    throw new Error('imageRepository must be an exact lowercase GHCR repository');
  }
  return text;
}

function exactManifestDigest(value) {
  const text = requiredText(value, 'manifestDigest');
  if (!/^sha256:[0-9a-f]{64}$/.test(text)) {
    throw new Error('manifestDigest must be an immutable sha256 digest');
  }
  return text;
}

function exactWorkflowRunId(value) {
  const text = requiredText(value, 'workflowRunId');
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error('workflowRunId must be a positive integer');
  return text;
}

function buildMobileApiImageManifest(input) {
  const repository = exactRepository(input?.repository);
  const commitSha = exactCommitSha(input?.commitSha);
  const imageRepository = exactImageRepository(input?.imageRepository);
  const manifestDigest = exactManifestDigest(input?.manifestDigest);
  const workflowRunId = exactWorkflowRunId(input?.workflowRunId);
  const workflowName = requiredText(input?.workflowName, 'workflowName');
  const jobName = requiredText(input?.jobName, 'jobName');
  return {
    schemaVersion: SCHEMA_VERSION,
    repository,
    commitSha,
    imageRepository,
    manifestDigest,
    imageReference: `${imageRepository}@${manifestDigest}`,
    workflowRunId,
    workflowName,
    jobName,
  };
}

function validateMobileApiImageManifest(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('image manifest must be an object');
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [...ALLOWED_FIELDS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error('image manifest fields do not match the strict schema');
  }
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error('image manifest schema is invalid');
  const manifest = buildMobileApiImageManifest(value);
  if (value.imageReference !== manifest.imageReference) {
    throw new Error('imageReference is not bound to imageRepository and manifestDigest');
  }
  const comparisons = [
    ['repository', exactRepository(expected?.repository, 'expected repository')],
    ['commitSha', exactCommitSha(expected?.commitSha)],
    ['imageRepository', exactImageRepository(expected?.imageRepository)],
    ['workflowRunId', exactWorkflowRunId(expected?.workflowRunId)],
    ['workflowName', requiredText(expected?.workflowName, 'expected workflowName')],
    ['jobName', requiredText(expected?.jobName, 'expected jobName')],
  ];
  for (const [field, expectedValue] of comparisons) {
    if (manifest[field] !== expectedValue) throw new Error(`image manifest ${field} mismatch`);
  }
  return manifest;
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index] || '');
    if (!raw.startsWith('--')) continue;
    const equals = raw.indexOf('=');
    if (equals > 2) {
      output[raw.slice(2, equals)] = raw.slice(equals + 1);
      continue;
    }
    const name = raw.slice(2);
    const next = argv[index + 1];
    if (next === undefined || String(next).startsWith('--')) throw new Error(`--${name} requires a value`);
    output[name] = String(next);
    index += 1;
  }
  return output;
}

function atomicWriteJson(filePath, value) {
  const resolved = path.resolve(requiredText(filePath, 'output'));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, resolved);
}

function readBoundedJson(filePath) {
  const resolved = path.resolve(requiredText(filePath, 'file'));
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('image manifest file is invalid');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function expectedFromArgs(args) {
  return {
    repository: args.repository,
    commitSha: args['commit-sha'],
    imageRepository: args['image-repository'],
    workflowRunId: args['workflow-run-id'],
    workflowName: args['workflow-name'],
    jobName: args['job-name'],
  };
}

function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'write') {
    const manifest = buildMobileApiImageManifest({
      ...expectedFromArgs(args),
      manifestDigest: args['manifest-digest'],
    });
    atomicWriteJson(args.output, manifest);
    return manifest;
  }
  if (command === 'validate') {
    const manifest = validateMobileApiImageManifest(
      readBoundedJson(args.file),
      expectedFromArgs(args),
    );
    if (args['github-output']) {
      fs.appendFileSync(path.resolve(args['github-output']), [
        `commit_sha=${manifest.commitSha}`,
        `manifest_digest=${manifest.manifestDigest}`,
        `image_repository=${manifest.imageRepository}`,
        `image_reference=${manifest.imageReference}`,
        `workflow_run_id=${manifest.workflowRunId}`,
        '',
      ].join('\n'), 'utf8');
    } else {
      process.stdout.write(`${JSON.stringify(manifest)}\n`);
    }
    return manifest;
  }
  throw new Error('usage: mobile-api-image-manifest.js <write|validate> [options]');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[mobile-api-image-manifest] ${(error && error.message) || String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildMobileApiImageManifest,
  validateMobileApiImageManifest,
  main,
};
