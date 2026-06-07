import http from 'http';
import {
  createMobileWordPressDraft,
  publishMobileWordPressDraft,
  refreshMobileWordPressCategories,
  upsertMobileWordPressSite,
} from '../../mobile/wordpress-publishing';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-wordpress-rest] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
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
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

(async () => {
  const requests: Array<{ method?: string; url?: string; auth?: string; body?: any }> = [];
  const expectedAuth = `Basic ${Buffer.from('writer:app pass').toString('base64')}`;
  const wpServer = http.createServer(async (req, res) => {
    const bodyText = req.method === 'POST' ? await readBody(req) : '';
    requests.push({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body: bodyText ? JSON.parse(bodyText) : null,
    });

    if (req.url?.startsWith('/wp-json/wp/v2/categories')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([
        { id: 12, name: '정책', count: 7 },
        { id: 15, name: '생활', count: 2 },
      ]));
      return;
    }

    if (req.url === '/wp-json/wp/v2/posts' && req.method === 'POST') {
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        id: 321,
        link: 'https://example.test/?p=321',
        status: 'draft',
        title: { rendered: requests[requests.length - 1].body?.title || '' },
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ message: 'not found' }));
  });

  const port = await listen(wpServer);
  const now = new Date('2026-06-06T00:00:00.000Z');
  const filePath = `${process.env['TMP'] || process.env['TEMP'] || '.'}/leword-mobile-wordpress-rest-${Date.now()}.json`;

  try {
    const saved = upsertMobileWordPressSite({
      filePath,
      now: () => now,
      input: {
        siteUrl: `http://127.0.0.1:${port}`,
        username: 'writer',
        applicationPassword: 'app pass',
      },
    });

    const categories = await refreshMobileWordPressCategories({
      filePath,
      siteId: saved.site.id,
      now: () => now,
    });

    assert('category refresh calls WordPress REST with basic auth',
      requests[0].url?.startsWith('/wp-json/wp/v2/categories')
        && requests[0].auth === expectedAuth);
    assert('category refresh stores categories in shared snapshot',
      categories.site.categories.length === 2
        && categories.site.categories[0].id === '12'
        && categories.snapshot.sites.items[0].categories[1].name === '생활'
        && !JSON.stringify(categories.snapshot).includes('app pass'));

    const draft = createMobileWordPressDraft({
      filePath,
      now: () => now,
      input: {
        siteId: saved.site.id,
        title: '정책 지원금 모바일 초안',
        keyword: '정책 지원금',
        content: '<p>정책 지원금 키워드 정리</p>',
        categoryId: '12',
        categoryName: '정책',
      },
    });

    const published = await publishMobileWordPressDraft({
      filePath,
      now: () => now,
      input: {
        draftId: draft.draft.id,
        status: 'draft',
      },
    });

    const postRequest = requests.find((item) => item.url === '/wp-json/wp/v2/posts');
    assert('publish sends draft post to WordPress REST',
      postRequest?.auth === expectedAuth
        && postRequest.body.title === '정책 지원금 모바일 초안'
        && postRequest.body.status === 'draft'
        && postRequest.body.categories[0] === 12);
    assert('publish result stores WordPress post identity without secrets',
      published.result.postId === '321'
        && published.result.postUrl === 'https://example.test/?p=321'
        && published.snapshot.drafts.items[0].wpPostId === '321'
        && published.snapshot.drafts.items[0].status === 'wp-draft'
        && !JSON.stringify(published.snapshot).includes('app pass'));

    console.log('[mobile-wordpress-rest] passed');
  } finally {
    await close(wpServer);
  }
})();
