'use strict';

function isAffiliateLoginUrl(value) {
  const url = new URL(value);
  return url.hostname === 'nid.naver.com'
    || (url.hostname === 'business.toss.im' && url.pathname.startsWith('/account'))
    || /(?:^|\/)login(?:\/|$)/.test(url.pathname);
}

async function continueAuthenticatedPage(page, target, { timeoutMs = 600000 } = {}) {
  if (!isAffiliateLoginUrl(page.url())) return;
  // 세션 전용 쿠키도 사용 가능하도록 인증 직후 동일 브라우저에서 수집한다.
  await page.waitForFunction(() => {
    const url = new URL(window.location.href);
    return url.hostname !== 'nid.naver.com'
      && !(url.hostname === 'business.toss.im' && url.pathname.startsWith('/account'))
      && !/(?:^|\/)login(?:\/|$)/.test(url.pathname);
  }, { timeout: timeoutMs, polling: 1000 });
  await page.goto(target, { waitUntil: 'networkidle2', timeout: 45000 });
}

module.exports = { isAffiliateLoginUrl, continueAuthenticatedPage };
