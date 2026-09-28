import type { IncomingMessage, ServerResponse } from 'http';
import type { BoardKey } from './board-cache';

export interface BoardBridgeDeps {
  allowed: () => Promise<boolean>;
  read: (key: BoardKey) => Promise<unknown>;
  generateTitles: (keyword: string) => Promise<unknown>;
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
  if (!(key && req.method === 'GET') && !(url === '/v1/bridge/brief-titles' && req.method === 'POST')) {
    io.json(res, 404, { ok: false, error: '지원하지 않는 보드 경로입니다.' }); return true;
  }
  if (!await deps.allowed()) { io.json(res, 403, { ok: false, error: '앱의 유효한 라이선스를 확인해 주세요.' }); return true; }
  try {
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
