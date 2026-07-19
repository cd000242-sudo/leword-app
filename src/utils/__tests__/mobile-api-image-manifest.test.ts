const {
  buildMobileApiImageManifest,
  validateMobileApiImageManifest,
} = require('../../../scripts/mobile-api-image-manifest');

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const commitSha = 'a'.repeat(40);
const manifestDigest = `sha256:${'b'.repeat(64)}`;
const repository = 'cd000242-sudo/leword-app';
const imageRepository = 'ghcr.io/cd000242-sudo/leword-mobile-api';
const workflowRunId = '123456789';

const manifest = buildMobileApiImageManifest({
  repository,
  commitSha,
  imageRepository,
  manifestDigest,
  workflowRunId,
  workflowName: 'Mobile API and App Release',
  jobName: 'Build and publish production API image',
});

assert('release manifest records the immutable registry identity',
  manifest.schemaVersion === 'leword-mobile-api-image-manifest-v1'
    && manifest.repository === repository
    && manifest.commitSha === commitSha
    && manifest.imageRepository === imageRepository
    && manifest.manifestDigest === manifestDigest
    && manifest.imageReference === `${imageRepository}@${manifestDigest}`
    && manifest.workflowRunId === workflowRunId);

const validated = validateMobileApiImageManifest(manifest, {
  repository,
  commitSha,
  imageRepository,
  workflowRunId,
  workflowName: 'Mobile API and App Release',
  jobName: 'Build and publish production API image',
});
assert('exact release manifest validates', validated.imageReference === manifest.imageReference);

for (const [name, value] of [
  ['repository', 'attacker/fork'],
  ['commitSha', 'c'.repeat(40)],
  ['imageRepository', 'ghcr.io/attacker/leword-mobile-api'],
  ['manifestDigest', 'sha256:latest'],
  ['workflowRunId', '999'],
] as const) {
  let rejected = false;
  try {
    validateMobileApiImageManifest({ ...manifest, [name]: value }, {
      repository,
      commitSha,
      imageRepository,
      workflowRunId,
      workflowName: 'Mobile API and App Release',
      jobName: 'Build and publish production API image',
    });
  } catch {
    rejected = true;
  }
  assert(`manifest rejects mismatched ${name}`, rejected);
}

let extraFieldRejected = false;
try {
  validateMobileApiImageManifest({ ...manifest, mutableTag: 'latest' }, {
    repository,
    commitSha,
    imageRepository,
    workflowRunId,
    workflowName: 'Mobile API and App Release',
    jobName: 'Build and publish production API image',
  });
} catch {
  extraFieldRejected = true;
}
assert('manifest schema rejects unbound extra fields', extraFieldRejected);

console.log('[mobile-api-image-manifest.test] passed');

export {};
