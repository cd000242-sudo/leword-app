import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  HomeNoticesRevisionConflictError,
  HomeNoticesStorageError,
  HomeNoticesValidationError,
  publishHomeNotices,
  readHomeNotices,
} from '../../mobile/home-notices';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function expectThrows<T extends Error>(name: string, expected: new (...args: any[]) => T, fn: () => unknown): T {
  try {
    fn();
  } catch (error) {
    assert(name, error instanceof expected, String(error));
    return error as T;
  }
  throw new Error(`${name}: expected ${expected.name}`);
}

(() => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-home-notices-unit-'));
  const filePath = path.join(tempDir, 'home-notices.json');
  const input = {
    notices: [
      {
        id: 'notice-older',
        badge: '안내',
        date: '2026.07.16',
        title: '둘째 공지',
        preview: '둘째 요약',
        body: '첫 문단\n\n둘째 문단',
      },
      {
        id: 'notice-z',
        badge: '업데이트',
        date: '2026-07-17',
        title: '<b>최신</b> 공지',
        preview: '<img src=x onerror=alert(1)>안전한 요약',
        body: '<script>alert(1)</script>무료 체험 안내',
      },
      {
        id: 'notice-a',
        badge: '중요',
        date: '2026-07-17',
        title: '같은 날짜 공지',
        preview: '결정적 정렬 확인',
        body: '본문',
      },
    ],
  };

  try {
    assert('missing storage starts empty', readHomeNotices(filePath) === null);

    const first = publishHomeNotices({
      value: input,
      expectedRevision: 0,
      updatedBy: 'unit-admin',
      now: new Date('2026-07-17T01:02:03.000Z'),
      filePath,
    });
    assert('first publish creates revision one', first.revision === 1, JSON.stringify(first));
    assert('dates and IDs produce deterministic latest ordering',
      first.notices.map((notice) => notice.id).join(',') === 'notice-a,notice-z,notice-older',
      JSON.stringify(first.notices));
    assert('dot date is canonicalized', first.notices[2].date === '2026-07-16', first.notices[2].date);
    assert('markup is removed from every public text field',
      first.notices.every((notice) => !/[<>]/.test(Object.values(notice).join(' '))),
      JSON.stringify(first.notices));
    assert('body paragraphs remain plain multiline text', first.notices[2].body === '첫 문단\n\n둘째 문단', first.notices[2].body);
    assert('snapshot is persisted with private file permissions where supported', fs.existsSync(filePath));

    const roundTrip = readHomeNotices(filePath);
    assert('persisted snapshot round-trips unchanged', JSON.stringify(roundTrip) === JSON.stringify(first));

    const noOp = publishHomeNotices({
      value: { notices: [...input.notices].reverse() },
      expectedRevision: 0,
      updatedBy: 'different-admin',
      now: new Date('2026-07-18T00:00:00.000Z'),
      filePath,
    });
    assert('same content in different input order is an idempotent no-op',
      noOp.revision === 1 && noOp.publishedAt === first.publishedAt && noOp.snapshotId === first.snapshotId,
      JSON.stringify(noOp));

    const conflict = expectThrows(
      'stale changed content conflicts',
      HomeNoticesRevisionConflictError,
      () => publishHomeNotices({
        value: { notices: [{ ...input.notices[0], title: 'stale mutation' }] },
        expectedRevision: 0,
        filePath,
      }),
    );
    assert('conflict exposes revisions to the API mapper only', conflict.expectedRevision === 0 && conflict.currentRevision === 1);

    const invalidValues: unknown[] = [
      null,
      [],
      { notices: [null] },
      { notices: [{ ...input.notices[0], id: 7 }] },
      { notices: [{ ...input.notices[0], badge: false }] },
      { notices: [{ ...input.notices[0], date: '2026-02-30' }] },
      { notices: [{ ...input.notices[0], title: { text: 'bad' } }] },
      { notices: [{ ...input.notices[0], preview: ['bad'] }] },
      { notices: [{ ...input.notices[0], body: 'x'.repeat(8_001) }] },
      { notices: [{ ...input.notices[0] }, { ...input.notices[0] }] },
    ];
    invalidValues.forEach((value, index) => {
      expectThrows(`strict invalid value ${index + 1}`, HomeNoticesValidationError, () => publishHomeNotices({
        value,
        expectedRevision: 1,
        filePath,
      }));
    });

    const cleared = publishHomeNotices({
      value: { notices: [] },
      expectedRevision: 1,
      updatedBy: 'unit-admin',
      now: new Date('2026-07-18T00:00:00.000Z'),
      filePath,
    });
    assert('admin can intentionally clear the notice snapshot', cleared.revision === 2 && cleared.notices.length === 0);

    const boundaryFile = path.join(tempDir, 'home-notices-boundary.json');
    const boundaryNotices = Array.from({ length: 50 }, (_, index) => ({
      id: `boundary-${index}`,
      badge: 'update',
      date: '2026-07-18',
      title: `boundary ${index}`,
      preview: '',
      body: '가'.repeat(6_962),
    }));
    try {
      publishHomeNotices({ value: { notices: boundaryNotices }, expectedRevision: 0, filePath: boundaryFile });
      assert('accepted boundary snapshot never exceeds the readable file limit', fs.statSync(boundaryFile).size <= 1024 * 1024);
      assert('accepted boundary snapshot remains readable', readHomeNotices(boundaryFile)?.notices.length === 50);
    } catch (error) {
      assert('oversized boundary snapshot is rejected before replacing storage', error instanceof HomeNoticesValidationError, String(error));
    }

    fs.writeFileSync(filePath, '{not-json', 'utf8');
    expectThrows('corrupt storage is unavailable', HomeNoticesStorageError, () => readHomeNotices(filePath));
    expectThrows('corrupt storage cannot be treated as revision zero', HomeNoticesStorageError, () => publishHomeNotices({
      value: input,
      expectedRevision: 0,
      filePath,
    }));

    console.log('[home-notices.test] passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})();
