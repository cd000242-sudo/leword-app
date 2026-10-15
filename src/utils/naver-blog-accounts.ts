import { blogKey } from './blog-class/profile-store';
export function advisorBlogIds(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    const rows = Array.isArray(parsed) ? parsed : parsed?.data;
    if (!Array.isArray(rows)) return [];
    return [...new Set(rows.filter((r) => r?.service === 'naver_blog').map((r) => blogKey(r.channelId)).filter((id): id is string => !!id))];
  } catch { return []; }
}
export function blogSessionPartition(blogId: string): string {
  const key = blogKey(blogId);
  if (!key) throw new Error('올바른 블로그 아이디가 필요합니다.');
  return `persist:naver-blog-${key}`;
}
