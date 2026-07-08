/**
 * 📄 LEWORD 가이드(콘텐츠) 페이지 서버렌더러
 *
 * 핵심: 초기 HTML에 글 본문을 정적으로 담는다(클라 fetch 아님) → Googlebot/애드센스 크롤러가 실제 콘텐츠를 본다.
 * SEO 완비(title/desc/canonical/OG/Twitter/JSON-LD Article+FAQ) + 애드센스 인아티클 유닛.
 * 브라이트-v3 라이트-그린 아티클 레이아웃(가독성 우선, max-width 740).
 */
import { GuideArticle, GuideIndexEntry } from './guide-store';

const SITE_BASE = process.env['LEWORD_SITE_BASE_URL'] || 'https://leaderspro.kr';
const ADSENSE_CLIENT = 'ca-pub-4008574892672964';
// 소유자가 애드센스 콘솔에서 '글 내 광고(in-article)' 유닛 생성 후 슬롯ID를 여기(env)에 넣으면 수동 유닛 렌더.
// 비어 있어도 오토애드(콘솔 토글)로 렌더되므로 무방.
const ADSENSE_ARTICLE_SLOT = process.env['ADSENSE_ARTICLE_SLOT'] || '';

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function attr(s: string): string {
  return esc(s).replace(/\n/g, ' ');
}
function safeUrl(u: string): string {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '#';
}

/** 인라인 마크다운(이스케이프된 텍스트에 적용): **강조**, *기울임*, `코드`, [텍스트](url) */
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => `<a href="${attr(safeUrl(u))}" rel="noopener">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** 의존성 없는 최소 마크다운 → HTML (본문은 신뢰된 생성물이지만 방어적으로 이스케이프 후 변환) */
function mdToHtml(md: string): string {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const para: string[] = [];
  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(esc(para.join(' ')))}</p>`); para.length = 0; }
  };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flushPara(); closeList(); i++; continue; }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{2,4})\s+(.*)$/))) {
      flushPara(); closeList();
      const level = Math.min(4, m[1].length);
      out.push(`<h${level}>${inline(esc(m[2]))}</h${level}>`);
    } else if ((m = t.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
      out.push(`<li>${inline(esc(m[1]))}</li>`);
    } else if ((m = t.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
      out.push(`<li>${inline(esc(m[1]))}</li>`);
    } else if ((m = t.match(/^>\s?(.*)$/))) {
      flushPara(); closeList();
      out.push(`<blockquote>${inline(esc(m[1]))}</blockquote>`);
    } else {
      closeList();
      para.push(t);
    }
    i++;
  }
  flushPara(); closeList();
  return out.join('\n');
}

const ADSENSE_LOADER =
  `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;

/** 인아티클 광고 유닛(슬롯ID 있을 때만 수동 렌더; 없으면 오토애드가 대신 채움) */
function adUnit(): string {
  if (!ADSENSE_ARTICLE_SLOT) return '';
  return `<div class="ad"><ins class="adsbygoogle" style="display:block;text-align:center" data-ad-layout="in-article" data-ad-format="fluid" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${ADSENSE_ARTICLE_SLOT}"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

const GUIDE_CSS = `
  :root{--bg:#EAF3EC;--surface:#fff;--surface-2:#F6FAF7;--border:#DCE7DF;--text:#13241A;--text-2:#566A5D;--text-3:#8AA092;--green:#16A34A;--green-2:#22C55E;--green-soft:#DCFCE7}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--text);line-height:1.75;
    background:radial-gradient(800px 420px at 88% -8%,rgba(74,222,128,.18),transparent 60%),var(--bg)}
  .wrap{max-width:740px;margin:0 auto;padding:28px 20px 80px}
  .top{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .brand{font-weight:800;font-size:17px;color:var(--text);text-decoration:none}
  .brand b{color:var(--green)}
  .bc{font-size:12px;color:var(--text-3)}
  .bc a{color:var(--text-2);text-decoration:none}
  .cat{display:inline-block;font-size:12px;font-weight:700;color:var(--green);background:var(--green-soft);border:1px solid #BBF7D0;padding:4px 11px;border-radius:20px;margin-bottom:12px}
  h1{font-size:30px;font-weight:800;letter-spacing:-.6px;line-height:1.3;margin:6px 0 10px}
  .meta{font-size:12px;color:var(--text-3);margin-bottom:20px}
  article{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:30px 30px 34px;box-shadow:0 6px 24px rgba(20,60,35,.06)}
  article h2{font-size:22px;font-weight:800;letter-spacing:-.4px;margin:32px 0 10px;padding-top:6px}
  article h3{font-size:18px;font-weight:800;margin:24px 0 8px}
  article p{margin:0 0 16px;font-size:16px;color:#1c2b22}
  article ul,article ol{margin:0 0 16px;padding-left:22px}
  article li{margin:6px 0}
  article a{color:var(--green);font-weight:600}
  article blockquote{margin:0 0 16px;padding:12px 16px;background:var(--surface-2);border-left:3px solid var(--green);border-radius:8px;color:var(--text-2)}
  article code{background:var(--surface-2);border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-size:14px}
  .ad{margin:26px 0;min-height:90px;display:flex;align-items:center;justify-content:center}
  .faq{margin-top:30px}
  .faq h2{font-size:20px}
  .faq details{background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:10px}
  .faq summary{font-weight:700;cursor:pointer}
  .faq p{margin:8px 0 0;color:var(--text-2)}
  .cta{margin-top:30px;padding:20px;background:linear-gradient(135deg,#ECFDF3,#E0F2FE);border:1px solid #C7F0D5;border-radius:14px;text-align:center}
  .cta a{display:inline-block;margin-top:10px;padding:11px 22px;background:linear-gradient(135deg,var(--green),var(--green-2));color:#fff;font-weight:800;border-radius:10px;text-decoration:none}
  .foot{margin-top:30px;font-size:12px;color:var(--text-3);text-align:center}
  .card{display:block;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;text-decoration:none;color:inherit;box-shadow:0 4px 16px rgba(20,60,35,.05)}
  .card:hover{border-color:var(--green-2)}
  .card b{display:block;font-size:16px;font-weight:800;margin-bottom:4px}
  .card span{font-size:13px;color:var(--text-2)}
`;

function head(opts: {
  title: string; description: string; canonical: string; ogType: string; jsonLd?: string;
}): string {
  return `<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)}</title>
<meta name="description" content="${attr(opts.description)}"/>
<meta name="robots" content="index,follow,max-image-preview:large"/>
<link rel="canonical" href="${attr(opts.canonical)}"/>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" rel="stylesheet"/>
<meta property="og:type" content="${esc(opts.ogType)}"/>
<meta property="og:title" content="${attr(opts.title)}"/>
<meta property="og:description" content="${attr(opts.description)}"/>
<meta property="og:url" content="${attr(opts.canonical)}"/>
<meta property="og:site_name" content="LEWORD"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${attr(opts.title)}"/>
<meta name="twitter:description" content="${attr(opts.description)}"/>
${ADSENSE_LOADER}
${opts.jsonLd ? `<script type="application/ld+json">${opts.jsonLd}</script>` : ''}
<style>${GUIDE_CSS}</style>`;
}

export function guidePageUrl(slug: string): string {
  return `${SITE_BASE}/leword/guide/${slug}`;
}

/** 단일 가이드 글 페이지 — 서버렌더 정적 HTML */
export function renderGuidePage(a: GuideArticle): string {
  const canonical = guidePageUrl(a.slug);
  const bodyHtml = mdToHtml(a.markdown);
  // 본문 중간에 광고 1개 삽입(첫 </h2> 뒤) + 본문 끝 광고 1개
  const mid = adUnit();
  let injected = bodyHtml;
  if (mid) {
    const firstH2End = bodyHtml.indexOf('</h2>');
    if (firstH2End >= 0) {
      const at = firstH2End + 5;
      injected = bodyHtml.slice(0, at) + '\n' + mid + '\n' + bodyHtml.slice(at);
    }
  }
  const faqHtml = (a.faq && a.faq.length)
    ? `<section class="faq"><h2>자주 묻는 질문</h2>${a.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${inline(esc(f.a))}</p></details>`).join('')}</section>`
    : '';

  const articleLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title, description: a.description,
    datePublished: new Date(a.publishedAt || a.createdAt).toISOString(),
    dateModified: new Date(a.updatedAt).toISOString(),
    author: { '@type': 'Organization', name: 'LEWORD' },
    publisher: { '@type': 'Organization', name: 'LEWORD' },
    mainEntityOfPage: canonical,
  };
  const faqLd = (a.faq && a.faq.length)
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: a.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    : null;
  const jsonLd = JSON.stringify(faqLd ? [articleLd, faqLd] : articleLd);

  const pubDate = new Date(a.publishedAt || a.createdAt).toISOString().slice(0, 10);
  return `<!doctype html><html lang="ko"><head>${head({ title: `${a.title} | LEWORD`, description: a.description, canonical, ogType: 'article', jsonLd })}</head>
<body><div class="wrap">
  <div class="top"><a class="brand" href="${SITE_BASE}/leword">💎 <b>LEWORD</b></a><span class="bc">· <a href="${SITE_BASE}/leword/guide">가이드</a></span></div>
  ${a.category ? `<span class="cat">${esc(a.category)}</span>` : ''}
  <h1>${esc(a.title)}</h1>
  <div class="meta">발행 ${pubDate} · 실측 데이터 기반 · LEWORD</div>
  <article>${injected}${adUnit()}${faqHtml}</article>
  <div class="cta">이 키워드, 내 블로그로 이길 수 있을까? <b>LEWORD</b>에서 실측 검색량·문서수·승산을 확인하세요.<br/><a href="${SITE_BASE}/leword">황금키워드 무료로 보기 →</a></div>
  <div class="foot">© LEWORD · leaderspro.kr</div>
</div></body></html>`;
}

/** 가이드 인덱스(허브) 페이지 — 내부링크 + 색인 */
export function renderGuideIndex(entries: GuideIndexEntry[]): string {
  const canonical = `${SITE_BASE}/leword/guide`;
  const listLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: entries.slice(0, 50).map((e, idx) => ({ '@type': 'ListItem', position: idx + 1, url: guidePageUrl(e.slug), name: e.title })),
  };
  const cards = entries.length
    ? entries.map((e) => `<a class="card" href="/leword/guide/${e.slug}">${e.category ? `<span class="cat" style="margin-bottom:8px">${esc(e.category)}</span>` : ''}<b>${esc(e.title)}</b><span>${esc(e.description)}</span></a>`).join('')
    : '<p>아직 발행된 가이드가 없습니다.</p>';
  return `<!doctype html><html lang="ko"><head>${head({ title: 'LEWORD 키워드·블로그 가이드', description: '실측 데이터 기반 고수익 키워드·블로그 SEO 가이드 모음. LEWORD가 찾은 저경쟁 황금키워드로 바로 글 쓰는 법.', canonical, ogType: 'website', jsonLd: JSON.stringify(listLd) })}</head>
<body><div class="wrap">
  <div class="top"><a class="brand" href="${SITE_BASE}/leword">💎 <b>LEWORD</b></a><span class="bc">· 가이드</span></div>
  <h1>키워드·블로그 가이드</h1>
  <div class="meta">LEWORD 실측 데이터로 쓴 저경쟁 고수익 키워드 공략 가이드</div>
  ${cards}
  <div class="foot">© LEWORD · leaderspro.kr</div>
</div></body></html>`;
}

/** sitemap.xml (발행 가이드 + 메인) */
export function renderSitemap(entries: GuideIndexEntry[]): string {
  const urls = [
    { loc: `${SITE_BASE}/leword`, lastmod: new Date().toISOString() },
    { loc: `${SITE_BASE}/leword/guide`, lastmod: new Date().toISOString() },
    ...entries.map((e) => ({ loc: guidePageUrl(e.slug), lastmod: new Date(e.publishedAt).toISOString() })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod.slice(0, 10)}</lastmod></url>`)
    .join('\n')}\n</urlset>`;
}

export function renderRobots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_BASE}/sitemap.xml\n`;
}
