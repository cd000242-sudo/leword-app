import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createLewordApiServer } from '../../../apps/api/src/server';
import { LIVE_GOLDEN_CORE_CATEGORY_POLICIES } from '../../mobile/live-golden-category-policy';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';
import { naverBlogDocumentCountQueryKey } from '../naver-blog-api';

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
    server.close((error) => error ? reject(error) : resolve());
  });
}

const ADMIN_REVIEW_ROUTE = '/v1/admin/live-golden/review';
const WEB_SESSION_SECRET = 'phase2-independent-human-session-secret';

function forgeSignedWebSession(
  payload: Record<string, unknown>,
  secret = WEB_SESSION_SECRET,
): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64url');
  return `leword-web-v1.${payloadPart}.${signature}`;
}

async function loginWebSession(
  baseUrl: string,
  userId: string,
  password: string,
  options: { reviewPurpose?: boolean; adminLogin?: boolean } = {},
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/web/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      password,
      ...(options.reviewPurpose ? { sessionPurpose: 'live-golden-review' } : {}),
      ...(options.adminLogin ? { adminLogin: true } : {}),
    }),
  });
  const body: any = await response.json();
  assert('web session login succeeds', response.status === 200 && body.ok === true, JSON.stringify(body));
  return String(body.session?.accessToken || '');
}

(async () => {
  const previousWebLoginUsers = process.env['LEWORD_WEB_LOGIN_USERS'];
  const previousPanelLoginUrl = process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];
  const previousReviewPanelLoginUrl = process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'];
  const previousNodeEnv = process.env['NODE_ENV'];
  process.env['LEWORD_WEB_LOGIN_USERS'] = JSON.stringify([
    { userId: 'phase2-reviewer', password: 'human-review-password', tier: 'admin' },
    { userId: 'not-an-admin', password: 'standard-human-password', tier: 'standard' },
  ]);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-live-golden-review-api-'));
  const cohortFile = path.join(root, 'live-golden-review-cohort.json');
  const reviewFile = path.join(root, 'live-golden-human-review.json');
  const certificateFile = path.join(root, 'live-golden-phase2-entry-certificate.json');
  const measuredAt = new Date().toISOString();
  const rows = LIVE_GOLDEN_CORE_CATEGORY_POLICIES.flatMap((policy) => (
    Array.from({ length: 5 }, (_, index) => ({
      id: `${policy.key}-${index}`,
      keyword: `${policy.label} 숨은 수요 ${index + 1}`,
      category: policy.discoveryIds[0],
      intent: index % 2 === 0 ? 'Informational' : 'Transactional',
      evidence: ['real-demand-extension', 'autocomplete-exact-measured'],
      grade: 'S',
      score: 80,
      pcSearchVolume: 200,
      mobileSearchVolume: 800,
      totalSearchVolume: 1000,
      documentCount: 200,
      goldenRatio: 5,
      source: 'searchad-measured',
      isMeasured: true,
      searchVolumeSource: 'searchad',
      searchVolumeConfidence: 'high',
      searchVolumeBindingVersion: 'keyword-keyed-v2',
      searchVolumeMeasuredAt: measuredAt,
      isSearchVolumeEstimated: false,
      documentCountSource: 'naver-api',
      documentCountConfidence: 'high',
      documentCountQueryMode: 'broad',
      documentCountQueryKey: naverBlogDocumentCountQueryKey(`${policy.label} 숨은 수요 ${index + 1}`),
      documentCountMeasuredAt: measuredAt,
      isDocumentCountEstimated: false,
      discoveredAt: measuredAt,
      updatedAt: measuredAt,
      freshness: 'live',
      isPublicPreview: false,
      publicSearchVolumeLabel: '1k',
      publicDocumentCountLabel: '200',
      publicReason: 'fixture',
      rank: 1,
    }))
  ));
  let reviewCandidates: any[] = rows;
  const snapshot: any = {
    board: rows,
    verifiedSupply: rows,
    boardCount: rows.length,
    boardTarget: 72,
    boardUpdatedAt: measuredAt,
    pendingProbeQueueCount: 0,
  };
  const radar: any = {
    snapshot: () => snapshot,
    snapshotForInternalReview: () => ({ ...snapshot, reviewCandidates }),
    start: () => snapshot,
    stop: () => snapshot,
  };
  const createReviewServer = (storage: {
    cohortFile?: string;
    certificateFile?: string;
    authToken?: string;
    webSessionSecret?: string;
  } = {}) => createLewordApiServer({
    entitlementVerifier: async (token) => token === 'admin-secret'
      ? {
          ok: true,
          entitlement: { subjectId: 'phase2-reviewer', tier: 'admin', source: 'license-service' },
        }
      : token === 'standard-secret'
        ? {
            ok: true,
            entitlement: { subjectId: 'not-an-admin', tier: 'standard', source: 'license-service' },
          }
        : { ok: false, reason: 'fixture rejected' },
    ...(Object.prototype.hasOwnProperty.call(storage, 'authToken')
      ? { authToken: storage.authToken }
      : {}),
    webSessionSecret: Object.prototype.hasOwnProperty.call(storage, 'webSessionSecret')
      ? storage.webSessionSecret
      : WEB_SESSION_SECRET,
    liveGoldenRadar: radar,
    liveGoldenHumanReviewFile: reviewFile,
    liveGoldenReviewCohortFile: storage.cohortFile || cohortFile,
    liveGoldenPhase2CertificateFile: storage.certificateFile || certificateFile,
    notificationInbox: new MobileNotificationInbox(),
    prewarmService: null,
    prewarmScheduler: null,
  } as any);
  const server = createReviewServer();
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const initialReviewRootEntries = fs.readdirSync(root).sort();
    const initialReviewRootMtimeMs = fs.statSync(root).mtimeMs;
    const initialHealth = await fetch(`${baseUrl}/health`);
    const initialHealthBody: any = await initialHealth.json();
    assert('public health is read-only and never auto-freezes a review cohort',
      initialHealth.status === 200
        && initialHealthBody.liveGolden?.phase2Entry?.state === 'building-supply'
        && initialHealthBody.liveGolden?.reviewAuthConfigured === true
        && JSON.stringify(initialHealthBody.liveGolden?.reviewStorage) === JSON.stringify({
          configured: true,
          readable: true,
          writable: true,
        })
        && !fs.existsSync(cohortFile)
        && JSON.stringify(fs.readdirSync(root).sort()) === JSON.stringify(initialReviewRootEntries)
        && fs.statSync(root).mtimeMs === initialReviewRootMtimeMs,
      JSON.stringify(initialHealthBody.liveGolden));

    const originalAccessSync = fs.accessSync;
    (fs as any).accessSync = (target: fs.PathLike, mode?: number) => {
      if (
        path.resolve(String(target)) === path.resolve(root)
        && Number(mode || 0) & fs.constants.W_OK
      ) {
        const denied = new Error('fixture write denied') as NodeJS.ErrnoException;
        denied.code = 'EACCES';
        throw denied;
      }
      return originalAccessSync(target, mode);
    };
    try {
      const readOnlyStorageHealthResponse = await fetch(`${baseUrl}/health`);
      const readOnlyStorageHealth: any = await readOnlyStorageHealthResponse.json();
      assert('health separates readable review storage from parent-directory writability',
        JSON.stringify(readOnlyStorageHealth.liveGolden?.reviewStorage) === JSON.stringify({
          configured: true,
          readable: true,
          writable: false,
        })
          && !fs.existsSync(cohortFile),
        JSON.stringify(readOnlyStorageHealth.liveGolden));
    } finally {
      (fs as any).accessSync = originalAccessSync;
    }

    const unauthorized = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`);
    assert('blind review packet is admin-only', unauthorized.status === 401, String(unauthorized.status));

    const machineToken = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      headers: { Authorization: 'Bearer admin-secret' },
    });
    assert('static or machine admin tokens cannot perform human review',
      machineToken.status === 401,
      String(machineToken.status));

    const machinePromotion = await fetch(`${baseUrl}/v1/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'machine-license-bearer',
        password: 'admin-secret',
        sessionPurpose: 'live-golden-review',
        adminLogin: true,
      }),
    });
    assert('a generic machine-license bearer cannot be promoted into a human review session',
      machinePromotion.status === 401 || machinePromotion.status === 503,
      String(machinePromotion.status));

    let forgedPanelRequests = 0;
    const forgedPanel = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        forgedPanelRequests += 1;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          userId: 'forged-panel-admin',
          tier: 'admin',
          accessToken: 'forged-panel-token',
          request: raw ? JSON.parse(raw) : {},
        }));
      });
    });
    const forgedPanelPort = await listen(forgedPanel);
    const forgedPanelUrl = `http://127.0.0.1:${forgedPanelPort}/fake-admin`;
    const strictPanelUrl = 'https://review-auth.leaderspro.kr/session';
    const redirectingStrictPanelUrl = 'https://review-auth.leaderspro.kr/redirect';
    const originalFetch = global.fetch;
    let strictPanelFetches = 0;
    let unsafeConfiguredFetches = 0;
    const strictPanelPayloads: Array<Record<string, unknown>> = [];
    (global as any).fetch = async (input: any, init?: RequestInit) => {
      const requested = String(input || '');
      if (requested === strictPanelUrl) {
        strictPanelFetches += 1;
        strictPanelPayloads.push(JSON.parse(String(init?.body || '{}')));
        return new Response(JSON.stringify({ ok: false, message: 'fixture rejected' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (requested === redirectingStrictPanelUrl) {
        strictPanelFetches += 1;
        if (init?.redirect === 'manual') {
          return new Response(null, {
            status: 302,
            headers: { Location: forgedPanelUrl },
          });
        }
        return originalFetch(forgedPanelUrl, init);
      }
      if (
        requested === 'http://review-auth.leaderspro.kr/session'
        || requested === 'https://127.0.0.1/session'
        || requested === 'https://10.0.0.1/session'
        || requested === 'https://user:password@review-auth.leaderspro.kr/session'
        || requested.includes('script.google.com/macros/')
      ) {
        unsafeConfiguredFetches += 1;
        return originalFetch(forgedPanelUrl, init);
      }
      return originalFetch(input, init);
    };
    try {
      process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = strictPanelUrl;
      process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = strictPanelUrl;
      const bodyOverride = await fetch(`${baseUrl}/v1/web/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'ssrf-attacker',
          password: 'attacker-password',
          sessionPurpose: 'live-golden-review',
          panelServerUrl: forgedPanelUrl,
          appId: 'attacker-controlled-app',
          licenseCode: 'attacker-controlled-license',
        }),
      });
      const bodyOverrideJson: any = await bodyOverride.json();
      const forgedReviewRoute = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
        headers: {
          Authorization: `Bearer ${String(bodyOverrideJson.session?.accessToken || 'no-review-session-issued')}`,
        },
      });
      assert('strict review login ignores a body-supplied panel URL and never issues its forged admin session',
        bodyOverride.status === 401
          && !bodyOverrideJson.session?.accessToken
          && forgedPanelRequests === 0
          && forgedReviewRoute.status === 401
          && strictPanelFetches > 0
          && strictPanelPayloads.length === strictPanelFetches
          && strictPanelPayloads.every((payload) => (
            payload.action !== 'register'
            && payload.appId !== 'attacker-controlled-app'
            && !Object.prototype.hasOwnProperty.call(payload, 'code')
            && !Object.prototype.hasOwnProperty.call(payload, 'licenseCode')
          )),
        JSON.stringify({
          status: bodyOverride.status,
          body: bodyOverrideJson,
          forgedPanelRequests,
          strictPanelFetches,
          strictPanelPayloads,
          reviewStatus: forgedReviewRoute.status,
        }));

      const forgedRequestsBeforeProductionGeneralLogin = forgedPanelRequests;
      const strictFetchesBeforeProductionGeneralLogin = strictPanelFetches;
      process.env['NODE_ENV'] = 'production';
      let productionGeneralBodyOverride: Response;
      try {
        productionGeneralBodyOverride = await fetch(`${baseUrl}/v1/web/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'general-ssrf-attacker',
            password: 'attacker-password',
            panelServerUrl: forgedPanelUrl,
          }),
        });
      } finally {
        if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = previousNodeEnv;
      }
      const productionGeneralBody: any = await productionGeneralBodyOverride.json();
      assert('production general web login also ignores a body-supplied panel URL',
        productionGeneralBodyOverride.status === 401
          && !productionGeneralBody.session?.accessToken
          && forgedPanelRequests === forgedRequestsBeforeProductionGeneralLogin
          && strictPanelFetches > strictFetchesBeforeProductionGeneralLogin,
        JSON.stringify({
          status: productionGeneralBodyOverride.status,
          body: productionGeneralBody,
          forgedPanelRequests,
          strictPanelFetches,
        }));

      const unsafePanelUrls = [
        '',
        'http://review-auth.leaderspro.kr/session',
        'https://127.0.0.1/session',
        'https://10.0.0.1/session',
        'https://user:password@review-auth.leaderspro.kr/session',
      ];
      for (const unsafePanelUrl of unsafePanelUrls) {
        if (unsafePanelUrl) {
          process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = unsafePanelUrl;
          process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = unsafePanelUrl;
        } else {
          delete process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];
          delete process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'];
        }
        const beforeForgedRequests = forgedPanelRequests;
        const beforeUnsafeFetches = unsafeConfiguredFetches;
        const unsafeResponse = await fetch(`${baseUrl}/v1/web/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'unsafe-panel-attacker',
            password: 'attacker-password',
            sessionPurpose: 'live-golden-review',
          }),
        });
        const unsafeBody: any = await unsafeResponse.json();
        assert(`strict review login rejects an unsafe configured panel endpoint: ${unsafePanelUrl || 'missing'}`,
          unsafeResponse.status === 503
            && !unsafeBody.session?.accessToken
            && forgedPanelRequests === beforeForgedRequests
            && unsafeConfiguredFetches === beforeUnsafeFetches,
          JSON.stringify({
            unsafePanelUrl,
            status: unsafeResponse.status,
            body: unsafeBody,
            forgedPanelRequests,
            unsafeConfiguredFetches,
          }));
      }

      process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = redirectingStrictPanelUrl;
      process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = redirectingStrictPanelUrl;
      const beforeRedirectRequests = forgedPanelRequests;
      const redirectResponse = await fetch(`${baseUrl}/v1/web/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'redirect-attacker',
          password: 'attacker-password',
          sessionPurpose: 'live-golden-review',
        }),
      });
      const redirectBody: any = await redirectResponse.json();
      assert('strict review login rejects an off-origin redirect before contacting the redirected provider',
        redirectResponse.status === 401
          && !redirectBody.session?.accessToken
          && forgedPanelRequests === beforeRedirectRequests,
        JSON.stringify({
          status: redirectResponse.status,
          body: redirectBody,
          forgedPanelRequests,
          beforeRedirectRequests,
        }));
    } finally {
      (global as any).fetch = originalFetch;
      await close(forgedPanel);
      if (previousPanelLoginUrl === undefined) delete process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];
      else process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = previousPanelLoginUrl;
      if (previousReviewPanelLoginUrl === undefined) {
        delete process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'];
      } else {
        process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = previousReviewPanelLoginUrl;
      }
    }
    const adminSessionToken = await loginWebSession(
      baseUrl,
      'phase2-reviewer',
      'human-review-password',
      { reviewPurpose: true, adminLogin: true },
    );
    const standardSessionToken = await loginWebSession(
      baseUrl,
      'not-an-admin',
      'standard-human-password',
    );
    const auth = { Authorization: `Bearer ${adminSessionToken}` };
    const reviewTokenMetrics = await fetch(`${baseUrl}/v1/live-golden/snapshot`, { headers: auth });
    assert('a review-purpose token is rejected by general metrics endpoints',
      reviewTokenMetrics.status === 403,
      String(reviewTokenMetrics.status));
    const reviewTokenPublic = await fetch(`${baseUrl}/v1/public/live-golden`, { headers: auth });
    const reviewTokenPublicBody: any = await reviewTokenPublic.json();
    assert('a review-purpose token never unlocks the public Pro exact-metrics snapshot',
      reviewTokenPublic.status === 200
        && reviewTokenPublicBody.proSnapshot === undefined
        && reviewTokenPublicBody.snapshot === undefined,
      JSON.stringify(reviewTokenPublicBody));
    const standardSnapshotResponse = await fetch(`${baseUrl}/v1/live-golden/snapshot`, {
      headers: { Authorization: `Bearer ${standardSessionToken}` },
    });
    const standardSnapshot: any = await standardSnapshotResponse.json();
    assert('ordinary standard snapshots never serialize internal review candidates',
      standardSnapshotResponse.status === 200
        && standardSnapshot.snapshot?.reviewCandidates === undefined,
      JSON.stringify(standardSnapshot));
    const forbidden = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      headers: { Authorization: `Bearer ${standardSessionToken}` },
    });
    assert('a valid non-admin entitlement cannot access blind review',
      forbidden.status === 403,
      String(forbidden.status));
    const signedMachineSession = forgeSignedWebSession({
      subjectId: 'machine-admin',
      tier: 'admin',
      source: 'env-static-token',
      sessionPurpose: 'live-golden-review',
      expiresAt: null,
      issuedAt: new Date().toISOString(),
    });
    const signedMachine = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      headers: { Authorization: `Bearer ${signedMachineSession}` },
    });
    assert('even a signed static-token source cannot impersonate a human review session',
      signedMachine.status === 403,
      String(signedMachine.status));
    const expiredSession = forgeSignedWebSession({
      subjectId: 'expired-human-reviewer',
      tier: 'admin',
      source: 'license-service',
      sessionPurpose: 'live-golden-review',
      expiresAt: null,
      issuedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    });
    const expired = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      headers: { Authorization: `Bearer ${expiredSession}` },
    });
    assert('signed human sessions expire after the strict review window',
      expired.status === 401,
      String(expired.status));

    snapshot.board = rows.slice(0, 5);
    snapshot.verifiedSupply = snapshot.board;
    reviewCandidates = snapshot.board;
    snapshot.boardCount = snapshot.board.length;
    const insufficientResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const insufficient: any = await insufficientResponse.json();
    assert('review cohort is never frozen before the automated supply gate passes',
      insufficientResponse.status === 200
        && insufficient.phase2Entry?.state === 'building-supply'
        && insufficient.cohort === null
        && !fs.existsSync(cohortFile),
      JSON.stringify(insufficient));
    snapshot.board = rows;
    snapshot.verifiedSupply = rows;
    reviewCandidates = rows;
    snapshot.boardCount = rows.length;

    const packetResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const packet: any = await packetResponse.json();
    assert('automatic supply pass freezes a review cohort',
      packetResponse.status === 200
        && packet.ok === true
        && packet.cohort?.schemaVersion === 'live-golden-review-cohort-v2'
        && packet.cohort?.rows?.length === 60
        && packet.phase2Entry?.state === 'pending-human-review'
        && fs.existsSync(cohortFile),
      JSON.stringify(packet));
    assert('blind packet excludes ranking and measurement bias',
      packet.cohort.rows.every((row: any) => (
        typeof row.semanticHash === 'string'
          && typeof row.keyword === 'string'
          && row.totalSearchVolume === undefined
          && row.documentCount === undefined
          && row.score === undefined
          && row.grade === undefined
          && row.id === undefined
          && row.rank === undefined
          && row.source === undefined
          && row.evidence === undefined
      )), JSON.stringify(packet.cohort.rows[0]));
    const preReviewCohortBytes = fs.readFileSync(cohortFile, 'utf8');

    const staleFingerprint = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: 'stale-fingerprint',
        decisions: [],
      }),
    });
    assert('stale cohort submissions fail closed', staleFingerprint.status === 409, String(staleFingerprint.status));

    const decisions = packet.cohort.rows.map((row: any) => ({
      semanticHash: row.semanticHash,
      naturalKeyword: true,
      intentMatch: true,
      hiddenKnown: true,
      malformed: false,
      semanticDuplicate: false,
      platformResidue: false,
      sentenceResidue: false,
    }));

    const missingHiddenKnownReview = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        decisions: decisions.map((decision: any, index: number) => index === 0
          ? Object.fromEntries(Object.entries(decision).filter(([key]) => key !== 'hiddenKnown'))
          : decision),
      }),
    });
    const missingHiddenKnownBody: any = await missingHiddenKnownReview.json();
    assert('the review API requires an explicit hiddenKnown judgment for every blinded row',
      missingHiddenKnownReview.status === 400
        && missingHiddenKnownBody.code === 'invalid-review-decision-flags',
      JSON.stringify(missingHiddenKnownBody));

    const clientAggregate = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        reviewer: 'client-must-not-choose-reviewer',
        reviewedAt: '2000-01-01T00:00:00.000Z',
        precision: 1,
        decisions,
      }),
    });
    assert('client reviewer, timestamp, and aggregate claims are rejected',
      clientAggregate.status === 400,
      String(clientAggregate.status));

    const partialReview = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        decisions: decisions.slice(0, decisions.length - 1),
      }),
    });
    assert('the server rejects partial review instead of accepting a client aggregate',
      partialReview.status === 422,
      String(partialReview.status));

    const malformedReview = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        decisions: decisions.map((decision: any, index: number) => index === 0
          ? { ...decision, malformed: true }
          : decision),
      }),
    });
    const malformed: any = await malformedReview.json();
    assert('a single defect persists human-review-failed without issuing a certificate',
      malformedReview.status === 200
        && malformed.phase2Entry?.state === 'human-review-failed'
        && malformed.reviewSummary?.malformedCount === 1
        && malformed.certificate === null
        && !fs.existsSync(certificateFile),
      JSON.stringify(malformed));

    const rejectedCorrection = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        decisions,
      }),
    });
    assert('a failed cohort cannot be overwritten or re-reviewed under the same fingerprint',
      rejectedCorrection.status === 409
        && !fs.existsSync(certificateFile),
      String(rejectedCorrection.status));
    const failedPersistedCohort = JSON.parse(fs.readFileSync(cohortFile, 'utf8'));
    const failedPersistedCohortBytes = fs.readFileSync(cohortFile, 'utf8');
    const failedAuditFile = path.join(
      `${cohortFile}.audit`,
      `${packet.cohort.cohortId}.json`,
    );
    assert('failed decisions remain persisted for immutable audit',
      failedPersistedCohort.state === 'human-review-failed'
        && Object.values(failedPersistedCohort.decisions || {}).some(
          (decision: any) => decision.malformed === true,
        )
        && fs.existsSync(failedAuditFile), JSON.stringify(failedPersistedCohort));

    fs.writeFileSync(cohortFile, preReviewCohortBytes, 'utf8');
    const immediateRollbackResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const immediateRollback: any = await immediateRollbackResponse.json();
    assert('an immediate external rollback to pre-review bytes is blocked by the durable failed-review tombstone',
      immediateRollbackResponse.status === 500
        && immediateRollback.code === 'live-golden-failed-review-cohort-reuse'
        && !fs.existsSync(certificateFile),
      JSON.stringify(immediateRollback));
    fs.writeFileSync(cohortFile, failedPersistedCohortBytes, 'utf8');

    const failedSemanticRow = packet.cohort.rows[0];
    const failedSourceIndex = rows.findIndex((row: any) => (
      row.keyword === failedSemanticRow.keyword
        && row.category === failedSemanticRow.category
        && row.intent === failedSemanticRow.intent
    ));
    const nonFailedSourceIndex = (failedSourceIndex + 1) % rows.length;
    const retainedFailureRows = rows.map((row: any, index: number) => index === nonFailedSourceIndex ? {
      ...row,
      id: `${row.id}-changed-while-failure-remains`,
      keyword: `${row.keyword} unrelated change`,
      documentCountQueryKey: naverBlogDocumentCountQueryKey(`${row.keyword} unrelated change`),
    } : row);
    snapshot.board = retainedFailureRows;
    snapshot.verifiedSupply = retainedFailureRows;
    reviewCandidates = retainedFailureRows;
    const failedCohortBeforeBlockedSupersede = fs.readFileSync(cohortFile, 'utf8');
    const blockedSupersedeResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const blockedSupersede: any = await blockedSupersedeResponse.json();
    assert('fingerprint drift cannot supersede while any failed semantic hash remains',
      blockedSupersedeResponse.status === 200
        && blockedSupersede.cohort?.cohortId === packet.cohort.cohortId
        && blockedSupersede.phase2Entry?.state === 'building-supply'
        && fs.existsSync(failedAuditFile)
        && fs.readFileSync(cohortFile, 'utf8') === failedCohortBeforeBlockedSupersede,
      JSON.stringify(blockedSupersede));

    const replacementRows = rows.map((row: any, index: number) => index === failedSourceIndex ? {
      ...row,
      id: `${row.id}-safe-replacement`,
      keyword: `${row.keyword} safe replacement`,
      documentCountQueryKey: naverBlogDocumentCountQueryKey(`${row.keyword} safe replacement`),
    } : row);
    snapshot.board = replacementRows;
    snapshot.verifiedSupply = replacementRows;
    reviewCandidates = replacementRows;
    snapshot.boardCount = replacementRows.length;
    const resetPacketResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const resetPacket: any = await resetPacketResponse.json();
    assert('removing every failed semantic hash can supersede into a new full-review cohort',
      resetPacketResponse.status === 200
        && resetPacket.phase2Entry?.state === 'pending-human-review'
        && resetPacket.cohort?.cohortId !== packet.cohort.cohortId
        && resetPacket.cohort?.boardFingerprint !== packet.cohort.boardFingerprint
        && fs.existsSync(failedAuditFile),
      JSON.stringify(resetPacket));
    const failedAudit = JSON.parse(fs.readFileSync(failedAuditFile, 'utf8'));
    assert('superseded failed cohorts retain their full immutable audit artifact',
      /^[a-f0-9]{64}$/.test(failedAudit.artifactDigest || '')
        && failedAudit.failedCohort?.cohortId === packet.cohort.cohortId
        && failedAudit.failedCohort?.state === 'human-review-failed'
        && Object.values(failedAudit.failedCohort?.decisions || {}).some(
          (decision: any) => decision.malformed === true,
        ), JSON.stringify(failedAudit));

    const failedReplacementDecisions = resetPacket.cohort.rows.map((row: any, index: number) => ({
      semanticHash: row.semanticHash,
      naturalKeyword: true,
      intentMatch: true,
      hiddenKnown: index !== 0,
      malformed: false,
      semanticDuplicate: false,
      platformResidue: false,
      sentenceResidue: false,
    }));
    const failedReplacementResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: resetPacket.cohort.cohortId,
        boardFingerprint: resetPacket.cohort.boardFingerprint,
        decisions: failedReplacementDecisions,
      }),
    });
    const failedReplacement: any = await failedReplacementResponse.json();
    assert('the replacement cohort can independently fail blind review',
      failedReplacementResponse.status === 200
        && failedReplacement.phase2Entry?.state === 'human-review-failed',
      JSON.stringify(failedReplacement));
    const failedReplacementHealthResponse = await fetch(`${baseUrl}/health`);
    const failedReplacementHealth: any = await failedReplacementHealthResponse.json();
    assert('one obvious-head decision cannot report superiority or a passed health attestation',
      failedReplacementHealthResponse.status === 200
        && failedReplacementHealth.liveGolden?.phase2Entry?.state === 'human-review-failed'
        && failedReplacementHealth.liveGolden?.supply?.superiorityGate === 'fail'
        && failedReplacementHealth.liveGolden?.humanReviewAttestation?.qualityPassed === false
        && failedReplacementHealth.liveGolden?.humanReviewAttestation?.reason
          === 'human-review-obvious-head-present',
      JSON.stringify(failedReplacementHealth.liveGolden));

    snapshot.board = rows;
    snapshot.verifiedSupply = rows;
    reviewCandidates = rows;
    snapshot.boardCount = rows.length;
    const tombstonedReactivationResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      headers: auth,
    });
    const tombstonedReactivation: any = await tombstonedReactivationResponse.json();
    assert('a failed A cohort can never reactivate after A-to-B-to-A drift',
      tombstonedReactivationResponse.status === 500
        && tombstonedReactivation.code === 'live-golden-failed-review-cohort-reuse',
      JSON.stringify(tombstonedReactivation));

    const failedReplacementRow = resetPacket.cohort.rows[0];
    const failedReplacementSourceIndex = replacementRows.findIndex((row: any) => (
      row.keyword === failedReplacementRow.keyword
        && row.category === failedReplacementRow.category
        && row.intent === failedReplacementRow.intent
    ));
    const acceptedRows = replacementRows.map((row: any, index: number) => (
      index === failedReplacementSourceIndex
        ? {
            ...row,
            id: `${row.id}-second-safe-replacement`,
            keyword: `${row.keyword} second safe replacement`,
            documentCountQueryKey: naverBlogDocumentCountQueryKey(`${row.keyword} second safe replacement`),
          }
        : row
    ));
    snapshot.board = acceptedRows;
    snapshot.verifiedSupply = acceptedRows;
    reviewCandidates = acceptedRows;
    snapshot.boardCount = acceptedRows.length;
    const acceptedPacketResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const acceptedPacket: any = await acceptedPacketResponse.json();
    assert('a genuinely new cohort with the failed B semantic removed can proceed',
      acceptedPacketResponse.status === 200
        && acceptedPacket.phase2Entry?.state === 'pending-human-review'
        && acceptedPacket.cohort?.cohortId !== resetPacket.cohort.cohortId,
      JSON.stringify(acceptedPacket));

    const resetDecisions = acceptedPacket.cohort.rows.map((row: any) => ({
      semanticHash: row.semanticHash,
      naturalKeyword: true,
      intentMatch: true,
      hiddenKnown: true,
      malformed: false,
      semanticDuplicate: false,
      platformResidue: false,
      sentenceResidue: false,
    }));

    const cleanSubmissionBody = JSON.stringify({
      schemaVersion: 'live-golden-blind-review-submission-v2',
      cohortId: acceptedPacket.cohort.cohortId,
      boardFingerprint: acceptedPacket.cohort.boardFingerprint,
      decisions: resetDecisions,
    });
    const secondServer = createReviewServer();
    const secondPort = await listen(secondServer);
    const secondBaseUrl = `http://127.0.0.1:${secondPort}`;
    const concurrentSubmissions = await Promise.all([
      fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: cleanSubmissionBody,
      }),
      fetch(`${secondBaseUrl}${ADMIN_REVIEW_ROUTE}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: cleanSubmissionBody,
      }),
    ]);
    await close(secondServer);
    const acceptedIndex = concurrentSubmissions.findIndex((response) => response.status === 200);
    const conflictIndex = concurrentSubmissions.findIndex((response) => response.status === 409);
    assert('concurrent full reviews serialize to one acceptance and one conflict',
      acceptedIndex >= 0 && conflictIndex >= 0,
      concurrentSubmissions.map((response) => response.status).join(','));
    const submittedResponse = concurrentSubmissions[acceptedIndex];
    const submitted: any = await submittedResponse.json();
    assert('server-derived full review issues a decision-bound Phase 2 entry certificate',
      submittedResponse.status === 200
        && submitted.ok === true
        && submitted.phase2Entry?.state === 'eligible'
        && submitted.reviewSummary?.reviewed === 60
        && submitted.reviewSummary?.precision === 1
        && submitted.certificate?.schemaVersion === 'live-golden-phase2-entry-certificate-v2'
        && submitted.certificate?.hiddenKnownCount === 60
        && submitted.certificate?.obviousCount === 0
        && submitted.certificate?.cohortId === acceptedPacket.cohort.cohortId
        && /^[a-f0-9]{64}$/.test(submitted.certificate?.decisionDigest || '')
        && fs.existsSync(certificateFile),
      JSON.stringify(submitted));
    const persistedCohort = JSON.parse(fs.readFileSync(cohortFile, 'utf8'));
    assert('reviewer identity and timestamps come only from the authenticated server context',
      Object.values(persistedCohort.decisions || {}).every((decision: any) => (
        decision.reviewer === 'phase2-reviewer'
          && typeof decision.reviewedAt === 'string'
          && decision.reviewedAt !== '2000-01-01T00:00:00.000Z'
      )), JSON.stringify(Object.values(persistedCohort.decisions || {})[0]));

    snapshot.board = acceptedRows.slice(1);
    snapshot.verifiedSupply = snapshot.board;
    reviewCandidates = snapshot.board;
    snapshot.boardCount = snapshot.board.length;
    const missingRowResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const missingRow: any = await missingRowResponse.json();
    assert('a certificate cannot keep current Phase 2 eligibility when a frozen row is missing',
      missingRowResponse.status === 200
        && missingRow.phase2Entry?.state === 'building-supply'
        && missingRow.phase2Entry?.certificateIssued === true
        && missingRow.phase2Entry?.cohortVerifiedCount === 60
        && missingRow.phase2Entry?.currentMeasuredCohortCount === 59
        && missingRow.phase2Entry?.missingCohortRowCount === 1,
      JSON.stringify(missingRow));
    const missingHealthResponse = await fetch(`${baseUrl}/health`);
    const missingHealth: any = await missingHealthResponse.json();
    assert('health never reports superiority or Phase 2 eligibility for a 60-to-59 binding',
      missingHealthResponse.status === 200
        && missingHealth.liveGolden?.phase2Entry?.state === 'building-supply'
        && missingHealth.liveGolden?.phase2Entry?.reason === 'current-cohort-binding-inexact'
        && missingHealth.liveGolden?.supply?.superiorityGate !== 'pass',
      JSON.stringify(missingHealth.liveGolden));
    const missingRowSubmission = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: packet.cohort.cohortId,
        boardFingerprint: packet.cohort.boardFingerprint,
        decisions,
      }),
    });
    assert('POST rejects review while the current frozen supply gate is failing',
      missingRowSubmission.status === 409,
      String(missingRowSubmission.status));

    const refreshedAt = new Date(Date.parse(measuredAt) + 60_000).toISOString();
    snapshot.verifiedSupply = acceptedRows.map((row: any, index: number) => index === 0 ? {
      ...row,
      pcSearchVolume: 250,
      mobileSearchVolume: 850,
      totalSearchVolume: 1100,
      searchVolumeMeasuredAt: refreshedAt,
      documentCountMeasuredAt: refreshedAt,
      updatedAt: refreshedAt,
    } : row);
    reviewCandidates = [...snapshot.verifiedSupply, {
      ...acceptedRows[0],
      id: 'new-pending-row',
      keyword: '새로 발견한 검수 대기 키워드',
      documentCountQueryKey: naverBlogDocumentCountQueryKey('새로 발견한 검수 대기 키워드'),
      updatedAt: refreshedAt,
      searchVolumeMeasuredAt: refreshedAt,
      documentCountMeasuredAt: refreshedAt,
    }];
    snapshot.board = reviewCandidates;
    snapshot.boardCount = snapshot.board.length;
    snapshot.boardUpdatedAt = refreshedAt;

    const cohortBeforeReadOnlyHealth = fs.readFileSync(cohortFile, 'utf8');
    const readOnlyHealthResponse = await fetch(`${baseUrl}/health`);
    const readOnlyHealth: any = await readOnlyHealthResponse.json();
    assert('health projects current pending candidates without persisting reconciliation',
      readOnlyHealthResponse.status === 200
        && readOnlyHealth.liveGolden?.phase2Entry?.pendingCandidateCount === 1
        && fs.readFileSync(cohortFile, 'utf8') === cohortBeforeReadOnlyHealth,
      JSON.stringify(readOnlyHealth.liveGolden));

    const reconciledResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const reconciled: any = await reconciledResponse.json();
    assert('measurement refresh preserves identity but any pending semantic fails exact eligibility',
      reconciledResponse.status === 200
        && reconciled.cohort?.cohortId === acceptedPacket.cohort.cohortId
        && reconciled.cohort?.boardFingerprint === acceptedPacket.cohort.boardFingerprint
        && reconciled.cohort?.rows?.length === 60
        && reconciled.pendingCandidateCount === 1
        && reconciled.phase2Entry?.state === 'building-supply'
        && reconciled.phase2Entry?.reason === 'current-cohort-binding-inexact',
      JSON.stringify(reconciled));

    const healthResponse = await fetch(`${baseUrl}/health`);
    const health: any = await healthResponse.json();
    assert('health fails closed while an internal pending candidate makes the binding inexact',
      health.liveGolden?.phase2Entry?.state === 'building-supply'
        && health.liveGolden?.phase2Entry?.certificateIssued === true
        && health.liveGolden?.phase2Entry?.cohortVerifiedCount === 60
        && health.liveGolden?.phase2Entry?.pendingCandidateCount === 1
        && health.liveGolden?.supply?.superiorityGate !== 'pass'
        && health.liveGolden?.humanReviewAttestation?.version === 'v2-cohort',
      JSON.stringify(health.liveGolden));

    const legacyServer = createLewordApiServer({
      entitlementVerifier: async (token) => token === 'admin-secret'
        ? {
            ok: true,
            entitlement: { subjectId: 'legacy-admin', tier: 'admin', source: 'license-service' },
          }
        : { ok: false, reason: 'fixture rejected' },
      webSessionSecret: WEB_SESSION_SECRET,
      liveGoldenRadar: radar,
      liveGoldenHumanReviewFile: reviewFile,
      notificationInbox: new MobileNotificationInbox(),
      prewarmService: null,
      prewarmScheduler: null,
    });
    const legacyPort = await listen(legacyServer);
    try {
      const legacyHealthResponse = await fetch(`http://127.0.0.1:${legacyPort}/health`);
      const legacyHealth: any = await legacyHealthResponse.json();
      assert('legacy human-review health behavior is preserved when v2 storage is unconfigured',
        legacyHealthResponse.status === 200
          && legacyHealth.liveGolden?.phase2Entry === undefined
          && JSON.stringify(legacyHealth.liveGolden?.reviewStorage) === JSON.stringify({
            configured: false,
            readable: false,
            writable: false,
          })
          && legacyHealth.liveGolden?.humanReviewAttestation?.version === 'legacy-v1'
          && legacyHealth.liveGolden?.supply?.superiorityGate === 'pending-human-review',
        JSON.stringify(legacyHealth.liveGolden));
      const unconfiguredReview = await fetch(
        `http://127.0.0.1:${legacyPort}${ADMIN_REVIEW_ROUTE}`,
        { headers: auth },
      );
      assert('admin review route fails closed when v2 persistence is not configured',
        unconfiguredReview.status === 503,
        String(unconfiguredReview.status));
    } finally {
      await close(legacyServer);
    }

    const malformedRoot = path.join(root, 'malformed-storage');
    fs.mkdirSync(malformedRoot);
    const malformedCohortFile = path.join(malformedRoot, 'live-golden-review-cohort.json');
    const malformedCertificateFile = path.join(malformedRoot, 'live-golden-phase2-entry-certificate.json');
    fs.writeFileSync(malformedCohortFile, '{not-json', 'utf8');
    const malformedBefore = fs.readFileSync(malformedCohortFile, 'utf8');
    const malformedEntriesBefore = fs.readdirSync(malformedRoot).sort();
    const malformedServer = createReviewServer({
      cohortFile: malformedCohortFile,
      certificateFile: malformedCertificateFile,
    });
    const malformedPort = await listen(malformedServer);
    try {
      const malformedHealthResponse = await fetch(`http://127.0.0.1:${malformedPort}/health`);
      const malformedHealth: any = await malformedHealthResponse.json();
      assert('health reports malformed existing review artifacts as unreadable without probing writes',
        malformedHealthResponse.status === 200
          && malformedHealth.liveGolden?.phase2Entry?.state === 'building-supply'
          && malformedHealth.liveGolden?.phase2Entry?.reason === 'live-golden-review-cohort-storage-invalid'
          && JSON.stringify(malformedHealth.liveGolden?.reviewStorage) === JSON.stringify({
            configured: true,
            readable: false,
            writable: true,
          })
          && fs.readFileSync(malformedCohortFile, 'utf8') === malformedBefore
          && JSON.stringify(fs.readdirSync(malformedRoot).sort()) === JSON.stringify(malformedEntriesBefore),
        JSON.stringify(malformedHealth.liveGolden));
    } finally {
      await close(malformedServer);
    }

    const sharedAuthRoot = path.join(root, 'shared-auth-secret');
    fs.mkdirSync(sharedAuthRoot);
    const sharedAuthSecret = 'shared-machine-and-review-secret-0123456789';
    const sharedAuthServer = createReviewServer({
      cohortFile: path.join(sharedAuthRoot, 'live-golden-review-cohort.json'),
      certificateFile: path.join(sharedAuthRoot, 'live-golden-phase2-entry-certificate.json'),
      authToken: sharedAuthSecret,
      webSessionSecret: sharedAuthSecret,
    });
    const sharedAuthPort = await listen(sharedAuthServer);
    const sharedAuthBaseUrl = `http://127.0.0.1:${sharedAuthPort}`;
    try {
      const sharedAuthHealthResponse = await fetch(`${sharedAuthBaseUrl}/health`);
      const sharedAuthHealth: any = await sharedAuthHealthResponse.json();
      assert('a signing secret equal to the machine bearer is not review auth',
        sharedAuthHealth.liveGolden?.reviewAuthConfigured === false,
        JSON.stringify(sharedAuthHealth.liveGolden));

      const forgedReviewToken = forgeSignedWebSession({
        subjectId: 'forged-machine-reviewer',
        tier: 'admin',
        source: 'configured-web-login',
        expiresAt: null,
        issuedAt: new Date().toISOString(),
        sessionPurpose: 'live-golden-review',
      }, sharedAuthSecret);
      const forgedReview = await fetch(`${sharedAuthBaseUrl}${ADMIN_REVIEW_ROUTE}`, {
        headers: { Authorization: `Bearer ${forgedReviewToken}` },
      });
      const forgedReviewBody: any = await forgedReview.json();
      assert('machine-secret HMAC forgery is fail-closed before review token verification',
        forgedReview.status === 503 && forgedReviewBody.code === 'admin-auth-unconfigured',
        JSON.stringify(forgedReviewBody));

      const sharedGeneralLogin = await fetch(`${sharedAuthBaseUrl}/v1/web/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'not-an-admin', password: 'standard-human-password' }),
      });
      assert('general web login compatibility remains available with the legacy signing fallback',
        sharedGeneralLogin.status === 200,
        String(sharedGeneralLogin.status));
      const sharedReviewLogin = await fetch(`${sharedAuthBaseUrl}/v1/web/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'phase2-reviewer',
          password: 'human-review-password',
          sessionPurpose: 'live-golden-review',
        }),
      });
      const sharedReviewLoginBody: any = await sharedReviewLogin.json();
      assert('review-purpose login is unavailable when the independent secret is invalid',
        sharedReviewLogin.status === 503
          && sharedReviewLoginBody.code === 'admin-auth-unconfigured',
        JSON.stringify(sharedReviewLoginBody));
    } finally {
      await close(sharedAuthServer);
    }

    const shortAuthRoot = path.join(root, 'short-auth-secret');
    fs.mkdirSync(shortAuthRoot);
    const shortAuthServer = createReviewServer({
      cohortFile: path.join(shortAuthRoot, 'live-golden-review-cohort.json'),
      certificateFile: path.join(shortAuthRoot, 'live-golden-phase2-entry-certificate.json'),
      authToken: 'independent-machine-token-0123456789',
      webSessionSecret: 'too-short',
    });
    const shortAuthPort = await listen(shortAuthServer);
    try {
      const shortAuthHealthResponse = await fetch(`http://127.0.0.1:${shortAuthPort}/health`);
      const shortAuthHealth: any = await shortAuthHealthResponse.json();
      assert('a review signing secret shorter than 32 UTF-8 bytes fails closed',
        shortAuthHealth.liveGolden?.reviewAuthConfigured === false,
        JSON.stringify(shortAuthHealth.liveGolden));
    } finally {
      await close(shortAuthServer);
    }

    const reviewProviderEnvNames = [
      'LEWORD_WEB_LOGIN_USERS',
      'LEWORD_ADMIN_LOGIN_ID',
      'LEWORD_ADMIN_LOGIN_PASSWORD',
      'LEWORD_ADMIN_LOGIN_PASSWORD_SHA256',
      'LEWORD_ADMIN_PANEL_LOGIN_ID',
      'LEWORD_ADMIN_PANEL_LOGIN_ID_SHA256',
      'LEWORD_ADMIN_PANEL_LOGIN_PASSWORD',
      'LEWORD_ADMIN_PANEL_LOGIN_PASSWORD_SHA256',
      'LEWORD_MOBILE_PANEL_LOGIN_URL',
      'LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL',
    ] as const;
    const reviewProviderEnv = Object.fromEntries(
      reviewProviderEnvNames.map((name) => [name, process.env[name]]),
    );
    try {
      for (const name of reviewProviderEnvNames) delete process.env[name];
      process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = 'https://general-login.example.com/session';
      const generalPanelOnlyRoot = path.join(root, 'general-panel-only');
      fs.mkdirSync(generalPanelOnlyRoot);
      const generalPanelOnlyServer = createReviewServer({
        cohortFile: path.join(generalPanelOnlyRoot, 'live-golden-review-cohort.json'),
        certificateFile: path.join(generalPanelOnlyRoot, 'live-golden-phase2-entry-certificate.json'),
      });
      const generalPanelOnlyPort = await listen(generalPanelOnlyServer);
      try {
        const response = await fetch(`http://127.0.0.1:${generalPanelOnlyPort}/health`);
        const health: any = await response.json();
        assert('a signing secret plus the general panel fallback is not strict review auth readiness',
          health.liveGolden?.reviewAuthConfigured === false
            && health.liveGolden?.reviewAuth?.ready === false
            && health.liveGolden?.reviewAuth?.configuredAdmin === false
            && health.liveGolden?.reviewAuth?.strictProviderConfigured === false,
          JSON.stringify(health.liveGolden?.reviewAuth));
      } finally {
        await close(generalPanelOnlyServer);
      }

      for (const [label, expiresAt] of [
        ['expired', '2020-01-01T00:00:00.000Z'],
        ['invalid-expiry', 'not-an-iso-date'],
      ]) {
        process.env['LEWORD_WEB_LOGIN_USERS'] = JSON.stringify([{
          userId: `${label}-admin`,
          password: 'configured-admin-password',
          tier: 'admin',
          expiresAt,
        }]);
        const invalidAdminRoot = path.join(root, label);
        fs.mkdirSync(invalidAdminRoot);
        const invalidAdminServer = createReviewServer({
          cohortFile: path.join(invalidAdminRoot, 'live-golden-review-cohort.json'),
          certificateFile: path.join(invalidAdminRoot, 'live-golden-phase2-entry-certificate.json'),
        });
        const invalidAdminPort = await listen(invalidAdminServer);
        try {
          const response = await fetch(`http://127.0.0.1:${invalidAdminPort}/health`);
          const health: any = await response.json();
          assert(`${label} configured admin cannot make strict review auth ready`,
            health.liveGolden?.reviewAuthConfigured === false
              && health.liveGolden?.reviewAuth?.configuredAdmin === false,
            JSON.stringify(health.liveGolden?.reviewAuth));
        } finally {
          await close(invalidAdminServer);
        }
      }

      const dynamicAdminRoot = path.join(root, 'dynamic-admin-expiry');
      fs.mkdirSync(dynamicAdminRoot);
      process.env['LEWORD_WEB_LOGIN_USERS'] = JSON.stringify([{
        userId: 'dynamic-expiry-admin',
        password: 'configured-admin-password',
        tier: 'admin',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }]);
      const dynamicAdminServer = createReviewServer({
        cohortFile: path.join(dynamicAdminRoot, 'live-golden-review-cohort.json'),
        certificateFile: path.join(dynamicAdminRoot, 'live-golden-phase2-entry-certificate.json'),
      });
      const dynamicAdminPort = await listen(dynamicAdminServer);
      try {
        const readyResponse = await fetch(`http://127.0.0.1:${dynamicAdminPort}/health`);
        const readyHealth: any = await readyResponse.json();
        assert('active configured admin initially makes review auth ready',
          readyHealth.liveGolden?.reviewAuthConfigured === true
            && readyHealth.liveGolden?.reviewAuth?.configuredAdmin === true,
          JSON.stringify(readyHealth.liveGolden?.reviewAuth));

        process.env['LEWORD_WEB_LOGIN_USERS'] = JSON.stringify([{
          userId: 'dynamic-expiry-admin',
          password: 'configured-admin-password',
          tier: 'admin',
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        }]);
        const expiredResponse = await fetch(`http://127.0.0.1:${dynamicAdminPort}/health`);
        const expiredHealth: any = await expiredResponse.json();
        assert('health dynamically becomes not-ready when the configured admin expires after server start',
          expiredHealth.liveGolden?.reviewAuthConfigured === false
            && expiredHealth.liveGolden?.reviewAuth?.ready === false
            && expiredHealth.liveGolden?.reviewAuth?.configuredAdmin === false,
          JSON.stringify(expiredHealth.liveGolden?.reviewAuth));
      } finally {
        await close(dynamicAdminServer);
      }
      delete process.env['LEWORD_WEB_LOGIN_USERS'];

      process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = 'https://review-auth.leword.app/session';
      const strictProviderRoot = path.join(root, 'strict-provider-only');
      fs.mkdirSync(strictProviderRoot);
      const strictProviderServer = createReviewServer({
        cohortFile: path.join(strictProviderRoot, 'live-golden-review-cohort.json'),
        certificateFile: path.join(strictProviderRoot, 'live-golden-phase2-entry-certificate.json'),
      });
      const strictProviderPort = await listen(strictProviderServer);
      try {
        const response = await fetch(`http://127.0.0.1:${strictProviderPort}/health`);
        const health: any = await response.json();
        assert('an explicit validated strict-review HTTPS provider satisfies the configuration contract without an external probe',
          health.liveGolden?.reviewAuthConfigured === true
            && health.liveGolden?.reviewAuth?.ready === true
            && health.liveGolden?.reviewAuth?.provider === 'strict-review-https'
            && health.liveGolden?.reviewAuth?.strictProviderConfigured === true,
          JSON.stringify(health.liveGolden?.reviewAuth));
      } finally {
        await close(strictProviderServer);
      }
    } finally {
      for (const name of reviewProviderEnvNames) {
        const previous = reviewProviderEnv[name];
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
    assert('cohort and certificate writes leave no partial temporary files behind',
      fs.readdirSync(root).every((filename) => !filename.includes('.tmp')),
      fs.readdirSync(root).join(','));

    const externallyRolledBackCohort = {
      ...failedAudit.failedCohort,
      state: 'review-target-frozen',
      decisions: {},
      pendingCandidates: [],
      missingSemanticHashes: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(cohortFile, `${JSON.stringify(externallyRolledBackCohort, null, 2)}\n`, 'utf8');
    const rollbackResponse = await fetch(`${baseUrl}${ADMIN_REVIEW_ROUTE}`, { headers: auth });
    const rollbackBody: any = await rollbackResponse.json();
    assert('a tombstone rejects an externally rolled-back non-failed cohort file',
      rollbackResponse.status === 500
        && rollbackBody.code === 'live-golden-failed-review-cohort-reuse',
      JSON.stringify(rollbackBody));

    const staleLockRoot = path.join(root, 'stale-lock-storage');
    fs.mkdirSync(staleLockRoot);
    const staleLockCohortFile = path.join(staleLockRoot, 'cohort.json');
    const staleLockCertificateFile = path.join(staleLockRoot, 'certificate.json');
    const staleLockDirectory = `${staleLockCohortFile}.lock`;
    fs.mkdirSync(staleLockDirectory);
    const staleOwner = {
      schemaVersion: 'live-golden-review-lock-v1',
      token: 'a'.repeat(32),
      pid: process.pid,
      createdAtMs: Date.now() - (10 * 60 * 1000),
    };
    const staleOwnerFile = path.join(staleLockDirectory, 'owner.json');
    fs.writeFileSync(staleOwnerFile, `${JSON.stringify(staleOwner)}\n`, 'utf8');
    const staleTime = new Date(Date.now() - (10 * 60 * 1000));
    fs.utimesSync(staleLockDirectory, staleTime, staleTime);
    const staleOwnerBefore = fs.readFileSync(staleOwnerFile, 'utf8');
    const staleLockServer = createReviewServer({
      cohortFile: staleLockCohortFile,
      certificateFile: staleLockCertificateFile,
    });
    const staleLockPort = await listen(staleLockServer);
    try {
      const staleLockResponse = await fetch(
        `http://127.0.0.1:${staleLockPort}${ADMIN_REVIEW_ROUTE}`,
        { headers: auth },
      );
      const staleLockBody: any = await staleLockResponse.json();
      assert('a stale lease is preserved and fails closed instead of fencing an old writer too late',
        staleLockResponse.status === 500
          && staleLockBody.code === 'live-golden-review-lock-stale-manual-recovery-required'
          && fs.readFileSync(staleOwnerFile, 'utf8') === staleOwnerBefore
          && !fs.existsSync(staleLockCohortFile),
        JSON.stringify(staleLockBody));
    } finally {
      await close(staleLockServer);
    }

    const defectPassRaceRoot = path.join(root, 'defect-pass-race');
    fs.mkdirSync(defectPassRaceRoot);
    const defectPassCohortFile = path.join(defectPassRaceRoot, 'cohort.json');
    const defectPassCertificateFile = path.join(defectPassRaceRoot, 'certificate.json');
    snapshot.board = rows;
    snapshot.verifiedSupply = rows;
    reviewCandidates = rows;
    snapshot.boardCount = rows.length;
    const defectPassServerA = createReviewServer({
      cohortFile: defectPassCohortFile,
      certificateFile: defectPassCertificateFile,
    });
    const defectPassServerB = createReviewServer({
      cohortFile: defectPassCohortFile,
      certificateFile: defectPassCertificateFile,
    });
    const [defectPassPortA, defectPassPortB] = await Promise.all([
      listen(defectPassServerA),
      listen(defectPassServerB),
    ]);
    try {
      const defectPassBaseA = `http://127.0.0.1:${defectPassPortA}`;
      const defectPassBaseB = `http://127.0.0.1:${defectPassPortB}`;
      const defectPassPacketResponse = await fetch(
        `${defectPassBaseA}${ADMIN_REVIEW_ROUTE}`,
        { headers: auth },
      );
      const defectPassPacket: any = await defectPassPacketResponse.json();
      assert('defect/pass race fixture freezes a shared cohort',
        defectPassPacketResponse.status === 200
          && defectPassPacket.cohort?.rows?.length === 60,
        JSON.stringify(defectPassPacket));
      const passDecisions = defectPassPacket.cohort.rows.map((row: any) => ({
        semanticHash: row.semanticHash,
        naturalKeyword: true,
        intentMatch: true,
        hiddenKnown: true,
        malformed: false,
        semanticDuplicate: false,
        platformResidue: false,
        sentenceResidue: false,
      }));
      const defectDecisions = passDecisions.map((decision: any, index: number) => (
        index === 0 ? { ...decision, malformed: true } : decision
      ));
      const submissionBase = {
        schemaVersion: 'live-golden-blind-review-submission-v2',
        cohortId: defectPassPacket.cohort.cohortId,
        boardFingerprint: defectPassPacket.cohort.boardFingerprint,
      };
      const defectPassResponses = await Promise.all([
        fetch(`${defectPassBaseA}${ADMIN_REVIEW_ROUTE}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...submissionBase, decisions: passDecisions }),
        }),
        fetch(`${defectPassBaseB}${ADMIN_REVIEW_ROUTE}`, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...submissionBase, decisions: defectDecisions }),
        }),
      ]);
      const defectPassBodies: any[] = await Promise.all(
        defectPassResponses.map((response) => response.json()),
      );
      const acceptedRaceIndex = defectPassResponses.findIndex((response) => response.status === 200);
      const rejectedRaceIndex = defectPassResponses.findIndex((response) => response.status === 409);
      const persistedRaceCohort = JSON.parse(fs.readFileSync(defectPassCohortFile, 'utf8'));
      const acceptedRaceState = defectPassBodies[acceptedRaceIndex]?.phase2Entry?.state;
      assert('two server instances serialize a defect/pass race to exactly one durable outcome',
        acceptedRaceIndex >= 0
          && rejectedRaceIndex >= 0
          && persistedRaceCohort.state === acceptedRaceState
          && fs.existsSync(defectPassCertificateFile) === (acceptedRaceState === 'eligible'),
        JSON.stringify({
          statuses: defectPassResponses.map((response) => response.status),
          bodies: defectPassBodies,
          persistedState: persistedRaceCohort.state,
        }));
    } finally {
      await Promise.all([close(defectPassServerA), close(defectPassServerB)]);
    }

    const symlinkTarget = path.join(root, 'symlink-storage-target');
    const symlinkParent = path.join(root, 'symlink-storage-parent');
    fs.mkdirSync(symlinkTarget);
    fs.symlinkSync(symlinkTarget, symlinkParent, 'junction');
    let symlinkStorageRejected = false;
    try {
      createReviewServer({
        cohortFile: path.join(symlinkParent, 'cohort.json'),
        certificateFile: path.join(symlinkParent, 'certificate.json'),
      });
    } catch (error) {
      symlinkStorageRejected = (error as any)?.code === 'live-golden-review-storage-path-invalid';
    }
    assert('review persistence rejects a symlinked parent component at server startup',
      symlinkStorageRejected);

    const replacementRaceRoot = path.join(root, 'replacement-race');
    fs.mkdirSync(replacementRaceRoot);
    const replacementRaceCohortFile = path.join(replacementRaceRoot, 'cohort.json');
    const replacementRaceCertificateFile = path.join(replacementRaceRoot, 'certificate.json');
    snapshot.board = rows;
    snapshot.verifiedSupply = rows;
    reviewCandidates = rows;
    snapshot.boardCount = rows.length;
    const replacementRaceServer = createReviewServer({
      cohortFile: replacementRaceCohortFile,
      certificateFile: replacementRaceCertificateFile,
    });
    const replacementRacePort = await listen(replacementRaceServer);
    try {
      const replacementRaceBaseUrl = `http://127.0.0.1:${replacementRacePort}`;
      const frozenResponse = await fetch(`${replacementRaceBaseUrl}${ADMIN_REVIEW_ROUTE}`, {
        headers: auth,
      });
      assert('replacement-race fixture freezes before the attack', frozenResponse.status === 200);
      const displacedCohortFile = `${replacementRaceCohortFile}.displaced`;
      const originalReadSync = fs.readSync;
      let replacementRaceArmed = true;
      (fs as any).readSync = (...args: any[]) => {
        const bytesRead = (originalReadSync as any)(...args);
        if (replacementRaceArmed) {
          replacementRaceArmed = false;
          fs.renameSync(replacementRaceCohortFile, displacedCohortFile);
          fs.copyFileSync(displacedCohortFile, replacementRaceCohortFile);
        }
        return bytesRead;
      };
      let replacementRaceResponse: Response;
      try {
        replacementRaceResponse = await fetch(`${replacementRaceBaseUrl}${ADMIN_REVIEW_ROUTE}`, {
          headers: auth,
        });
      } finally {
        (fs as any).readSync = originalReadSync;
      }
      const replacementRaceBody: any = await replacementRaceResponse.json();
      assert('descriptor read fails closed when the cohort path is replaced mid-read',
        replacementRaceResponse.status === 500
          && replacementRaceBody.code === 'live-golden-review-storage-race-detected',
        JSON.stringify(replacementRaceBody));
    } finally {
      await close(replacementRaceServer);
    }
  } finally {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
    if (previousWebLoginUsers === undefined) delete process.env['LEWORD_WEB_LOGIN_USERS'];
    else process.env['LEWORD_WEB_LOGIN_USERS'] = previousWebLoginUsers;
    if (previousPanelLoginUrl === undefined) delete process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'];
    else process.env['LEWORD_MOBILE_PANEL_LOGIN_URL'] = previousPanelLoginUrl;
    if (previousReviewPanelLoginUrl === undefined) {
      delete process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'];
    } else {
      process.env['LEWORD_MOBILE_LIVE_GOLDEN_REVIEW_PANEL_LOGIN_URL'] = previousReviewPanelLoginUrl;
    }
    if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousNodeEnv;
  }

  console.log('[live-golden-review-api-server.test] passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
