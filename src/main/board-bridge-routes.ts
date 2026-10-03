import type { IncomingMessage, ServerResponse } from 'http';
import type { BoardKey } from './board-cache';
import { isBriefProvider } from './topic-brief-preferences';

export interface BoardBridgeDeps {
  allowed: () => Promise<boolean>;
  read: (key: BoardKey) => Promise<unknown>;
  generateTitles: (keyword: string) => Promise<unknown>;
  getPreferences?: () => Promise<unknown>;
  savePreferences?: (provider: string) => Promise<unknown>;
}
export async function handleBoardRoute(req: IncomingMessage, res: ServerResponse, deps: BoardBridgeDeps,
  io: { readBody: (req: IncomingMessage) => Promise<string>; json: (res: ServerResponse, code: number, value: unknown) => void; siteOriginAllowed: (origin: string) => boolean }): Promise<boolean> {
  const url = String(req.url || '');
  if (!url.startsWith('/v1/bridge/boards/') && url !== '/v1/bridge/brief-titles') return false;
  res.setHeader('Cache-Control', 'no-store');
  const origin = String(req.headers.origin || '');
  if (origin && !io.siteOriginAllowed(origin)) { io.json(res, 403, { ok: false, error: '사이트에서만 읽을 수 있습니다.' }); return true; }
  const keys: BoardKey[] = ['topic-briefs', 'issue-niche', 'brief-titles'];
  const key = keys.find(k => url === `/v1/bridge/boards/${k}`);
  const preferences = url === '/v1/bridge/boards/preferences' && ['GET', 'POST'].includes(req.method || '');
  if (!(key && req.method === 'GET') && !preferences && !(url === '/v1/bridge/brief-titles' && req.method === 'POST')) {
    io.json(res, 404, { ok: false, error: '지원하지 않는 보드 경로입니다.' }); return true;
  }
  if (!await deps.allowed()) { io.json(res, 403, { ok: false, error: '앱의 유효한 라이선스를 확인해 주세요.' }); return true; }
  try {
    if (preferences) {
      if (!deps.getPreferences || !deps.savePreferences) { io.json(res, 503, { ok: false, error: '앱을 업데이트해 주세요.' }); return true; }
      if (req.method === 'GET') { io.json(res, 200, { ok: true, result: await deps.getPreferences() }); return true; }
      if (!origin || !String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        io.json(res, 403, { ok: false, error: '사이트의 설정 화면에서 변경해 주세요.' }); return true;
      }
      let input: { provider: string };
      try {
        input = JSON.parse(await io.readBody(req));
        if (!input || Array.isArray(input) || Object.keys(input).length !== 1 || !isBriefProvider(input.provider)) throw new Error();
      } catch { io.json(res, 400, { ok: false, error: '지원하는 생성 엔진을 선택해 주세요.' }); return true; }
      io.json(res, 200, { ok: true, result: await deps.savePreferences(input.provider) }); return true;
    }
    if (key) { io.json(res, 200, { ok: true, result: await deps.read(key) }); return true; }
    let keyword: string;
    try {
      const input = JSON.parse(await io.readBody(req));
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'keyword') || typeof input.keyword !== 'string') throw new Error();
      keyword = input.keyword.trim();
      if (keyword.length < 2 || keyword.length > 100 || /[\r\n\x00-\x1f]/.test(keyword)) throw new Error();
    } catch { io.json(res, 400, { ok: false, error: '검색어 하나만 입력해 주세요(2~100자).' }); return true; }
    io.json(res, 200, { ok: true, result: await deps.generateTitles(keyword) });
  } catch {
    // Agent errors may contain command paths, prompts, or authentication details.
    io.json(res, 503, { ok: false, error: '앱에서 결과를 준비하지 못했습니다. 기존 결과는 유지됩니다.' });
  }
  return true;
}
