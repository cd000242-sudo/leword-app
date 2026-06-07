import {
  createMobileWordPressDraft,
  readMobileWordPressSnapshot,
  upsertMobileWordPressSite,
} from '../../mobile/wordpress-publishing';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-wordpress-publishing] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const now = new Date('2026-06-06T00:00:00.000Z');
const filePath = `${process.env['TMP'] || process.env['TEMP'] || '.'}/leword-mobile-wordpress-${Date.now()}.json`;

const empty = readMobileWordPressSnapshot({ filePath, now: () => now });
assert('empty snapshot uses shared PC WordPress storage',
  empty.storage === 'pc-wordpress-publishing-json'
    && empty.configured === false
    && empty.sites.total === 0
    && empty.drafts.total === 0);

const saved = upsertMobileWordPressSite({
  filePath,
  now: () => now,
  input: {
    label: 'LEWORD 블로그',
    siteUrl: 'example.com',
    username: 'publisher@example.com',
    applicationPassword: 'secret-application-password',
    defaultCategoryId: '7',
    defaultCategoryName: '정책',
    categories: [{ id: '7', name: '정책', count: 12 }],
  },
});

assert('site is normalized without exposing password',
  saved.site.siteUrl === 'https://example.com'
    && saved.site.usernameMasked === 'pu***@example.com'
    && saved.site.hasApplicationPassword === true
    && !JSON.stringify(saved.snapshot).includes('secret-application-password'));
assert('snapshot is configured after site save',
  saved.snapshot.configured === true
    && saved.snapshot.sites.total === 1
    && saved.snapshot.sites.items[0].categories[0].name === '정책');

const draft = createMobileWordPressDraft({
  filePath,
  now: () => now,
  input: {
    title: '원피스 추천 키워드 정리',
    keyword: '원피스 추천',
    content: '검색량과 문서수를 확인한 뒤 발행할 초안입니다.',
    categoryId: '7',
    categoryName: '정책',
    tags: ['원피스 추천', '여름 키워드'],
  },
});

assert('mobile draft is queued for the configured WordPress site',
  draft.draft.id.startsWith('mobile_wp_draft_')
    && draft.draft.siteId === saved.site.id
    && draft.draft.status === 'draft'
    && draft.draft.contentLength > 0
    && draft.snapshot.drafts.total === 1);
assert('draft snapshot keeps publish metadata',
  draft.snapshot.drafts.items[0].keyword === '원피스 추천'
    && draft.snapshot.drafts.items[0].categoryName === '정책'
    && draft.snapshot.drafts.items[0].tags.includes('여름 키워드'));

console.log('[mobile-wordpress-publishing] passed');
