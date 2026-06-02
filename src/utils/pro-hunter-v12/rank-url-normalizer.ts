export interface NaverBlogPostIdentity {
  blogId: string;
  postNo: string;
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeId(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function extractNaverBlogPostIdentity(url: string): NaverBlogPostIdentity | null {
  const raw = decodeOnce(String(url || '').trim());
  if (!raw) return null;

  const postView = raw.match(/PostView\.naver\?([^#\s]+)/i);
  if (postView) {
    const query = postView[1];
    const blogId = query.match(/(?:^|&)blogId=([^&#]+)/i);
    const logNo = query.match(/(?:^|&)logNo=(\d+)/i);
    if (blogId && logNo) {
      return {
        blogId: normalizeId(decodeOnce(blogId[1])),
        postNo: logNo[1],
      };
    }
  }

  const pathPost = raw.match(/(?:m\.)?blog\.naver\.com\/([^/?#]+)\/(\d+)/i);
  if (pathPost) {
    return {
      blogId: normalizeId(decodeOnce(pathPost[1])),
      postNo: pathPost[2],
    };
  }

  const redirectedPathPost = raw.match(/(?:url|u|target)=https?:\/\/(?:m\.)?blog\.naver\.com\/([^/?&#]+)\/(\d+)/i);
  if (redirectedPathPost) {
    return {
      blogId: normalizeId(decodeOnce(redirectedPathPost[1])),
      postNo: redirectedPathPost[2],
    };
  }

  return null;
}

export function isSameNaverBlogPost(a: string, b: string): boolean {
  const left = extractNaverBlogPostIdentity(a);
  const right = extractNaverBlogPostIdentity(b);
  if (!left || !right) return false;
  return left.blogId === right.blogId && left.postNo === right.postNo;
}
