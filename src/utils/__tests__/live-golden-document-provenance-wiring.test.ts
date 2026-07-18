import * as fs from 'fs';
import * as path from 'path';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const mdpEngine = fs.readFileSync(path.join(__dirname, '..', 'mdp-engine.ts'), 'utf8');

assert(
  'MDP result contract carries canonical document-count provenance to the desktop uploader',
  /documentCountSource\?:/.test(mdpEngine)
    && /documentCountConfidence\?:/.test(mdpEngine)
    && /documentCountQueryMode\?:/.test(mdpEngine)
    && /documentCountMeasuredAt\?:/.test(mdpEngine)
    && /isDocumentCountEstimated\?:/.test(mdpEngine),
);
assert(
  'MDP result construction preserves document-count provenance from the measured signal',
  /documentCountSource:\s*sig\.documentCountSource/.test(mdpEngine)
    && /documentCountConfidence:\s*sig\.documentCountConfidence/.test(mdpEngine)
    && /documentCountQueryMode:\s*sig\.documentCountQueryMode/.test(mdpEngine)
    && /documentCountMeasuredAt:\s*sig\.documentCountMeasuredAt/.test(mdpEngine)
    && /isDocumentCountEstimated:\s*sig\.isDocumentCountEstimated/.test(mdpEngine),
);
assert(
  'MDP scoring rejects missing, stale, estimated, and non-broad document measurements',
  /hasFreshCanonicalNaverDocumentCount\(sig\)/.test(mdpEngine)
    && !mdpEngine.includes('const docCount = sig.documentCount || 0')
    && !mdpEngine.includes('docCount === 0 ? 10'),
);

console.log('[live-golden-document-provenance-wiring.test] passed');
