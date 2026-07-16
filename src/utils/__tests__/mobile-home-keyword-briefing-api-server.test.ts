import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createLewordApiServer } from '../../../apps/api/src/server';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) resolve(address.port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
}

(async () => {
  const previousFile = process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-home-briefing-'));
  process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'] = path.join(tempDir, 'briefing.json');

  const server = createLewordApiServer({
    executor: async () => { throw new Error('not used'); },
    entitlementVerifier: async (token) => {
      if (token === 'admin-session') return {
          ok: true,
          entitlement: {
            subjectId: 'admin',
            tier: 'admin',
            source: 'fixture',
          },
        };
      if (token === 'standard-session') return {
        ok: true,
        entitlement: {
          subjectId: 'standard-user',
          tier: 'standard',
          source: 'fixture',
        },
      };
      return { ok: false, reason: 'invalid token' };
    },
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const noVerifierServer = createLewordApiServer({
      executor: async () => { throw new Error('not used'); },
      entitlementVerifier: null,
    });
    const noVerifierPort = await listen(noVerifierServer);
    try {
      const noVerifierGet = await request(`http://127.0.0.1:${noVerifierPort}/v1/admin/home-keyword-briefing`, {
        headers: { Authorization: 'Bearer anything' },
      });
      const noVerifierPut = await request(`http://127.0.0.1:${noVerifierPort}/v1/admin/home-keyword-briefing`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer anything',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 0, briefing: { rows: [] } }),
      });
      assert('admin GET fails closed when verifier is absent', noVerifierGet.status === 503, String(noVerifierGet.status));
      assert('admin PUT fails closed when verifier is absent', noVerifierPut.status === 503, String(noVerifierPut.status));
    } finally {
      await close(noVerifierServer);
    }

    const emptyResponse = await request(`${baseUrl}/v1/public/home-keyword-briefing`);
    const empty: any = await emptyResponse.json();
    assert('public read starts empty', emptyResponse.status === 200 && empty.ok === true && empty.briefing === null);

    const reviewedRows = [
      { keyword: '<b>트로이</b> 왓슨', searchVolume: 32770, documentCount: 1156, opportunity: 999 },
      { keyword: '트로이 왓슨', searchVolume: 32770, documentCount: 1156, opportunity: 999 },
      { keyword: '신규 검색어', searchVolume: 120, documentCount: 0, opportunity: 0 },
      ...Array.from({ length: 94 }, (_, index) => ({
        keyword: `검수 키워드 ${index + 1}`,
        searchVolume: 1000 + index,
        documentCount: 20 + index,
        opportunity: 999,
      })),
    ];
    const input = {
      expectedRevision: 0,
      briefing: {
        title: '<img src=x onerror=alert(1)>부방장 검수본',
        author: '부방장',
        sourceImages: [{ name: 'sheet.png', sha256: 'a'.repeat(64), width: 633, height: 760 }],
        rows: reviewedRows,
      },
    };

    const unauthorized = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert('admin write requires bearer session', unauthorized.status === 401, String(unauthorized.status));

    const forbidden = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'GET',
      headers: { Authorization: 'Bearer standard-session' },
    });
    assert('non-admin session cannot read admin snapshot', forbidden.status === 403, String(forbidden.status));

    const oversized = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expectedRevision: 0, briefing: { ...input.briefing, title: 'x'.repeat(70_000) } }),
    });
    assert('oversized snapshot is rejected before parsing', oversized.status === 413, String(oversized.status));

    const malformedInputs: Array<{ name: string; body: unknown }> = [
      {
        name: 'missing expectedRevision',
        body: { briefing: input.briefing },
      },
      {
        name: 'numeric garbage in searchVolume',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: 'bad', searchVolume: 'abc1', documentCount: 0 }] },
        },
      },
      {
        name: 'numeric garbage in documentCount',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: 'bad', searchVolume: 1, documentCount: 'garbage' }] },
        },
      },
      {
        name: 'boolean numeric value',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: 'bad', searchVolume: true, documentCount: 0 }] },
        },
      },
      {
        name: 'object keyword',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: { text: 'bad' }, searchVolume: 1, documentCount: 0 }] },
        },
      },
      {
        name: 'unsafe integer',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: 'bad', searchVolume: Number.MAX_SAFE_INTEGER + 1, documentCount: 0 }] },
        },
      },
      {
        name: 'out-of-range OCR confidence',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, rows: [{ keyword: 'bad', searchVolume: 1, documentCount: 0, ocrConfidence: 101 }] },
        },
      },
      {
        name: 'malformed source image',
        body: {
          expectedRevision: 0,
          briefing: { ...input.briefing, sourceImages: [{ name: { value: 'sheet.png' }, sha256: 'a'.repeat(64), width: '633px', height: 760 }] },
        },
      },
    ];
    for (const malformedInput of malformedInputs) {
      const response = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer admin-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(malformedInput.body),
      });
      assert(`${malformedInput.name} rejects the whole snapshot`, response.status === 422, await response.text());
    }

    const afterMalformed: any = await request(`${baseUrl}/v1/public/home-keyword-briefing`).then((response) => response.json());
    assert('malformed attempts do not create a snapshot', afterMalformed.briefing === null, JSON.stringify(afterMalformed));

    const briefingFile = process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE']!;
    fs.writeFileSync(briefingFile, '{not-json', 'utf8');
    const corruptRead = await request(`${baseUrl}/v1/public/home-keyword-briefing`);
    const corruptReadBody = await corruptRead.text();
    assert('corrupt storage returns service unavailable', corruptRead.status === 503, `${corruptRead.status}: ${corruptReadBody}`);
    assert('corrupt storage response does not leak the file path', !corruptReadBody.includes(tempDir), corruptReadBody);
    const corruptWrite = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    assert('corrupt storage cannot be overwritten as revision zero', corruptWrite.status === 503, await corruptWrite.text());
    fs.unlinkSync(briefingFile);

    const publishedResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const published: any = await publishedResponse.json();
    assert('admin publishes revision one', publishedResponse.status === 200 && published.briefing?.revision === 1, JSON.stringify(published));
    assert('all 97 reviewed rows are preserved', published.briefing.rows.length === 97, String(published.briefing.rows.length));
    assert('raw duplicate rows are preserved', published.briefing.rows[0].keyword === published.briefing.rows[1].keyword);
    assert('HTML markup is removed', !published.briefing.title.includes('<') && !published.briefing.rows[0].keyword.includes('<'));
    assert('opportunity is server-recomputed', published.briefing.rows[0].opportunity === 28.32);
    assert('zero document count is valid', published.briefing.rows[2].opportunity === 120);

    const originalRenameSync = fs.renameSync;
    fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
      if (path.resolve(String(newPath)) === path.resolve(briefingFile)) {
        throw Object.assign(new Error('fixture rename failure'), { code: 'EIO' });
      }
      return originalRenameSync(oldPath, newPath);
    }) as typeof fs.renameSync;
    try {
      const failedWrite = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer admin-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expectedRevision: 1,
          briefing: { ...input.briefing, title: 'must not replace the stored snapshot' },
        }),
      });
      const failedWriteBody = await failedWrite.text();
      assert('atomic storage write failure returns service unavailable', failedWrite.status === 503, `${failedWrite.status}: ${failedWriteBody}`);
      assert('storage write failure does not leak the file path', !failedWriteBody.includes(tempDir), failedWriteBody);
    } finally {
      fs.renameSync = originalRenameSync;
    }
    const afterFailedWrite: any = await request(`${baseUrl}/v1/public/home-keyword-briefing`).then((response) => response.json());
    assert(
      'atomic storage write failure preserves the existing snapshot',
      afterFailedWrite.briefing?.revision === 1 && afterFailedWrite.briefing?.title === '부방장 검수본',
      JSON.stringify(afterFailedWrite),
    );

    const firstRead: any = await request(`${baseUrl}/v1/public/home-keyword-briefing`).then((response) => response.json());
    const secondRead: any = await request(`${baseUrl}/v1/public/home-keyword-briefing`).then((response) => response.json());
    assert('public snapshot is immutable across reads', JSON.stringify(firstRead.briefing) === JSON.stringify(secondRead.briefing));

    const currentRevisionNoopResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...input, expectedRevision: 1 }),
    });
    const currentRevisionNoop: any = await currentRevisionNoopResponse.json();
    assert(
      'unchanged current-revision publish is a no-op',
      currentRevisionNoopResponse.status === 200
        && currentRevisionNoop.briefing?.revision === 1
        && currentRevisionNoop.briefing?.publishedAt === published.briefing.publishedAt,
      JSON.stringify(currentRevisionNoop),
    );

    const idempotentResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const idempotent: any = await idempotentResponse.json();
    assert('identical retry is idempotent', idempotentResponse.status === 200 && idempotent.briefing?.revision === 1, JSON.stringify(idempotent));

    const malformedResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: 1,
        briefing: { ...input.briefing, rows: [...input.briefing.rows, { keyword: '', searchVolume: 10, documentCount: 1 }] },
      }),
    });
    assert('malformed row rejects the whole snapshot', malformedResponse.status === 422, await malformedResponse.text());

    const staleResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...input, briefing: { ...input.briefing, title: 'stale overwrite' } }),
    });
    const stale: any = await staleResponse.json();
    assert('stale changed write is rejected', staleResponse.status === 409 && stale.code === 'revision-conflict' && stale.currentRevision === 1, JSON.stringify(stale));

    const afterConflict: any = await request(`${baseUrl}/v1/public/home-keyword-briefing`).then((response) => response.json());
    assert('conflict does not mutate public snapshot', afterConflict.briefing?.title === '부방장 검수본', JSON.stringify(afterConflict));

    const updatedResponse = await request(`${baseUrl}/v1/admin/home-keyword-briefing`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-session',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expectedRevision: 1,
        briefing: { ...input.briefing, title: '부방장 2차 검수본' },
      }),
    });
    const updated: any = await updatedResponse.json();
    assert('new reviewed content atomically replaces the file', updatedResponse.status === 200 && updated.briefing?.revision === 2, JSON.stringify(updated));

    const restartedServer = createLewordApiServer({
      executor: async () => { throw new Error('not used'); },
      entitlementVerifier: async () => ({ ok: false, reason: 'not needed for public read' }),
    });
    const restartedPort = await listen(restartedServer);
    try {
      const afterRestart: any = await request(`http://127.0.0.1:${restartedPort}/v1/public/home-keyword-briefing`)
        .then((response) => response.json());
      assert('snapshot survives API restart', afterRestart.briefing?.revision === 2 && afterRestart.briefing?.rows?.length === 97, JSON.stringify(afterRestart));
    } finally {
      await close(restartedServer);
    }

    console.log('[mobile-home-keyword-briefing-api-server.test] passed');
  } finally {
    await close(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previousFile === undefined) delete process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'];
    else process.env['LEWORD_HOME_KEYWORD_BRIEFING_FILE'] = previousFile;
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
