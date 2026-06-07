import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  addMobileKeywordGroup,
  deleteMobileKeywordGroup,
  readMobileKeywordGroupSnapshot,
  updateMobileKeywordGroup,
} from '../../mobile/keyword-groups';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

const filePath = path.join(os.tmpdir(), `leword-mobile-keyword-groups-${process.pid}.json`);
try {
  fs.rmSync(filePath, { force: true });

  const empty = readMobileKeywordGroupSnapshot({
    filePath,
    now: () => new Date('2026-06-06T00:00:00.000Z'),
  });
  assert('empty keyword group snapshot starts empty', empty.total === 0);
  assert('empty snapshot keeps storage label', empty.storage === 'pc-keyword-groups-json');

  const created = addMobileKeywordGroup({
    filePath,
    now: () => new Date('2026-06-06T00:01:00.000Z'),
    input: {
      name: '여름 원피스 후보',
      keywords: ['원피스 추천', ' 여름 원피스 ', '원피스 추천', ''],
    },
  });
  assert('created group is returned', created.group.name === '여름 원피스 후보');
  assert('created group deduplicates keywords', created.group.keywords.length === 2, created.group.keywords.join(','));
  assert('created group has deterministic mobile id prefix', created.group.id.startsWith('mobile_group_'));
  assert('snapshot total increments after create', created.snapshot.total === 1);

  const updated = updateMobileKeywordGroup({
    filePath,
    now: () => new Date('2026-06-06T00:02:00.000Z'),
    id: created.group.id,
    updates: {
      keywords: ['린넨 원피스', '여름 원피스'],
    },
  });
  assert('updated group keeps existing name', updated.group?.name === '여름 원피스 후보');
  assert('updated group replaces normalized keywords', updated.group?.keywords.join('|') === '린넨 원피스|여름 원피스');
  assert('updated group timestamp changes', updated.group?.updatedAt === '2026-06-06T00:02:00.000Z');

  const deleted = deleteMobileKeywordGroup({
    filePath,
    now: () => new Date('2026-06-06T00:03:00.000Z'),
    id: created.group.id,
  });
  assert('delete reports removal', deleted.removed === true);
  assert('snapshot total decrements after delete', deleted.snapshot.total === 0);

  fs.writeFileSync(filePath, JSON.stringify([{
    id: 'pc_group_1',
    name: 'PC 기존 그룹',
    keywords: ['지원금', '정책브리핑'],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
  }]), 'utf8');
  const legacy = readMobileKeywordGroupSnapshot({
    filePath,
    now: () => new Date('2026-06-06T00:04:00.000Z'),
  });
  assert('reads existing PC keyword groups', legacy.groups[0]?.id === 'pc_group_1');
  assert('existing PC groups are marked pc-json source', legacy.groups[0]?.source === 'pc-json');
  assert('existing PC groups expose keyword count', legacy.groups[0]?.keywordCount === 2);
} finally {
  fs.rmSync(filePath, { force: true });
}

console.log('[mobile-keyword-groups] passed');
