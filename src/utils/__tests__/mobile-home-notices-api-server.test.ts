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
  const previousFile = process.env['LEWORD_HOME_NOTICES_FILE'];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-home-notices-api-'));
  const noticesFile = path.join(tempDir, 'home-notices.json');
  process.env['LEWORD_HOME_NOTICES_FILE'] = noticesFile;

  const server = createLewordApiServer({
    executor: async () => { throw new Error('not used'); },
    entitlementVerifier: async (token) => {
      if (token === 'admin-session') return {
        ok: true,
        entitlement: { subjectId: 'admin', tier: 'admin', source: 'fixture' },
      };
      if (token === 'standard-session') return {
        ok: true,
        entitlement: { subjectId: 'member', tier: 'standard', source: 'fixture' },
      };
      return { ok: false, reason: 'invalid token' };
    },
  });
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const noticeInput = {
    expectedRevision: 0,
    notices: {
      notices: [
        {
          id: 'free-trial-20260717',
          badge: '업데이트',
          date: '2026.07.17',
          title: '<strong>무료 체험</strong> 및 다음 자동화 안내',
          preview: '네이버·워드프레스·티스토리·블로그스팟 자동화를 하루 3회씩 이용할 수 있습니다.',
          body: '<script>alert(1)</script>무료 체험은 하루 3회입니다.\n\n유료 사용자는 무제한으로 이용할 수 있습니다.',
        },
        {
          id: 'daily-keywords-20260716',
          badge: '안내',
          date: '2026-07-16',
          title: '매일 키워드 업데이트',
          preview: '홈과 LEWORD 앱에서 전체 흐름을 확인하세요.',
          body: '매일 키워드를 업데이트합니다.',
        },
      ],
    },
  };

  try {
    const noVerifierServer = createLewordApiServer({
      executor: async () => { throw new Error('not used'); },
      entitlementVerifier: null,
    });
    const noVerifierPort = await listen(noVerifierServer);
    try {
      for (const method of ['GET', 'PUT']) {
        const response = await request(`http://127.0.0.1:${noVerifierPort}/v1/admin/home-notices`, {
          method,
          headers: { Authorization: 'Bearer anything', 'Content-Type': 'application/json' },
          ...(method === 'PUT' ? { body: JSON.stringify(noticeInput) } : {}),
        });
        assert(`admin ${method} fails closed without verifier`, response.status === 503, await response.text());
      }
    } finally {
      await close(noVerifierServer);
    }

    const emptyResponse = await request(`${baseUrl}/v1/public/home-notices`);
    const empty: any = await emptyResponse.json();
    assert('public GET starts empty and is not cached',
      emptyResponse.status === 200
        && empty.ok === true
        && empty.notices === null
        && emptyResponse.headers.get('cache-control') === 'no-store',
      JSON.stringify(empty));

    const unauthorized = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(noticeInput),
    });
    assert('admin write requires Bearer auth', unauthorized.status === 401, String(unauthorized.status));

    const forbidden = await request(`${baseUrl}/v1/admin/home-notices`, {
      headers: { Authorization: 'Bearer standard-session' },
    });
    assert('standard tier cannot read admin snapshot', forbidden.status === 403, String(forbidden.status));

    const oversized = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...noticeInput,
        notices: { notices: [{ ...noticeInput.notices.notices[0], body: 'x'.repeat(70_000) }] },
      }),
    });
    assert('request body size guard rejects oversized notice snapshot', oversized.status === 413, await oversized.text());

    const invalidBodies: Array<{ name: string; body: unknown }> = [
      { name: 'missing expectedRevision', body: { notices: noticeInput.notices } },
      { name: 'boolean revision', body: { ...noticeInput, expectedRevision: false } },
      { name: 'non-object snapshot', body: { expectedRevision: 0, notices: [] } },
      { name: 'object body', body: { expectedRevision: 0, notices: { notices: [{ ...noticeInput.notices.notices[0], body: { html: 'bad' } }] } } },
      { name: 'invalid calendar date', body: { expectedRevision: 0, notices: { notices: [{ ...noticeInput.notices.notices[0], date: '2026-02-30' }] } } },
      { name: 'duplicate id', body: { expectedRevision: 0, notices: { notices: [noticeInput.notices.notices[0], noticeInput.notices.notices[0]] } } },
    ];
    for (const invalid of invalidBodies) {
      const response = await request(`${baseUrl}/v1/admin/home-notices`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
        body: JSON.stringify(invalid.body),
      });
      assert(`${invalid.name} rejects the whole snapshot`, response.status === 422, await response.text());
    }
    const afterInvalid: any = await request(`${baseUrl}/v1/public/home-notices`).then((response) => response.json());
    assert('invalid attempts do not create partial state', afterInvalid.notices === null, JSON.stringify(afterInvalid));

    fs.writeFileSync(noticesFile, '{corrupt-json', 'utf8');
    const corruptRead = await request(`${baseUrl}/v1/public/home-notices`);
    const corruptReadBody = await corruptRead.text();
    assert('corrupt public storage returns 503', corruptRead.status === 503, corruptReadBody);
    assert('storage error does not leak absolute path', !corruptReadBody.includes(tempDir), corruptReadBody);
    const corruptWrite = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify(noticeInput),
    });
    assert('corrupt storage is never overwritten as revision zero', corruptWrite.status === 503, await corruptWrite.text());
    fs.unlinkSync(noticesFile);

    const publishResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify(noticeInput),
    });
    const published: any = await publishResponse.json();
    assert('admin publishes revision one', publishResponse.status === 200 && published.notices?.revision === 1, JSON.stringify(published));
    assert('markup cannot reach public notice fields',
      published.notices.notices.every((notice: Record<string, string>) => !/[<>]/.test(Object.values(notice).join(' '))),
      JSON.stringify(published));
    assert('server canonicalizes date and latest order',
      published.notices.notices[0].id === 'free-trial-20260717' && published.notices.notices[0].date === '2026-07-17',
      JSON.stringify(published));
    assert('admin response does not expose storage path', !JSON.stringify(published).includes(tempDir), JSON.stringify(published));

    const originalRenameSync = fs.renameSync;
    fs.renameSync = ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
      if (path.resolve(String(newPath)) === path.resolve(noticesFile)) {
        throw Object.assign(new Error('fixture rename failure'), { code: 'EIO' });
      }
      return originalRenameSync(oldPath, newPath);
    }) as typeof fs.renameSync;
    try {
      const failedWrite = await request(`${baseUrl}/v1/admin/home-notices`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: 1,
          notices: { notices: [{ ...noticeInput.notices.notices[0], title: 'must not replace current snapshot' }] },
        }),
      });
      const failedWriteBody = await failedWrite.text();
      assert('atomic rename failure returns generic 503', failedWrite.status === 503, failedWriteBody);
      assert('atomic write error does not leak path', !failedWriteBody.includes(tempDir), failedWriteBody);
    } finally {
      fs.renameSync = originalRenameSync;
    }
    const afterFailedWrite: any = await request(`${baseUrl}/v1/public/home-notices`).then((response) => response.json());
    assert('atomic failure preserves previous snapshot', afterFailedWrite.notices?.revision === 1, JSON.stringify(afterFailedWrite));

    for (const expectedRevision of [1, 0]) {
      const noOpResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
        method: 'PUT',
        headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...noticeInput, expectedRevision }),
      });
      const noOp: any = await noOpResponse.json();
      assert(`identical publish is no-op at expected revision ${expectedRevision}`,
        noOpResponse.status === 200
          && noOp.notices?.revision === 1
          && noOp.notices?.publishedAt === published.notices.publishedAt,
        JSON.stringify(noOp));
    }

    const staleResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 0,
        notices: { notices: [{ ...noticeInput.notices.notices[0], title: 'stale overwrite' }] },
      }),
    });
    const stale: any = await staleResponse.json();
    assert('stale changed write returns CAS conflict',
      staleResponse.status === 409 && stale.code === 'revision-conflict' && stale.currentRevision === 1,
      JSON.stringify(stale));

    const updateResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 1,
        notices: { notices: [{ ...noticeInput.notices.notices[0], title: '관리자 수정 공지' }] },
      }),
    });
    const updated: any = await updateResponse.json();
    assert('valid update creates revision two', updateResponse.status === 200 && updated.notices?.revision === 2, JSON.stringify(updated));

    const adminReadResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
      headers: { Authorization: 'Bearer admin-session' },
    });
    const adminRead: any = await adminReadResponse.json();
    assert('admin reads current revision without path disclosure',
      adminReadResponse.status === 200
        && adminRead.currentRevision === 2
        && adminRead.notices?.notices[0]?.title === '관리자 수정 공지'
        && !JSON.stringify(adminRead).includes(tempDir),
      JSON.stringify(adminRead));

    const restartedServer = createLewordApiServer({
      executor: async () => { throw new Error('not used'); },
      entitlementVerifier: async () => ({ ok: false, reason: 'public read only' }),
    });
    const restartedPort = await listen(restartedServer);
    try {
      const afterRestart: any = await request(`http://127.0.0.1:${restartedPort}/v1/public/home-notices`)
        .then((response) => response.json());
      assert('notice snapshot survives API restart', afterRestart.notices?.revision === 2, JSON.stringify(afterRestart));
    } finally {
      await close(restartedServer);
    }

    const clearResponse = await request(`${baseUrl}/v1/admin/home-notices`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 2, notices: { notices: [] } }),
    });
    const cleared: any = await clearResponse.json();
    assert('admin can intentionally clear every notice',
      clearResponse.status === 200 && cleared.notices?.revision === 3 && cleared.notices?.notices.length === 0,
      JSON.stringify(cleared));

    console.log('[mobile-home-notices-api-server.test] passed');
  } finally {
    await close(server);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previousFile === undefined) delete process.env['LEWORD_HOME_NOTICES_FILE'];
    else process.env['LEWORD_HOME_NOTICES_FILE'] = previousFile;
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
