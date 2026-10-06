/**
 * 비서 도구 실행기(2026-10-06) — 모델이 [도구] 로 청한 실측을 앱의 기존 함수로 돌린다.
 *
 * 비용: 검색광고 · 오픈 API(사용자 키, 무료 쿼터) · 내 PC 크로미엄(자리 실측). 브라이트데이터(유료)는 쓰지 않는다.
 * 결과는 잰 사실만 문장으로 — 못 잰 값은 "못 잼"이라 적고 0 으로 메우지 않는다(추정치 금지).
 */
import type { SeatRow } from './handlers/seat-measure';
import {
  createToolBudget,
  type ToolCall,
  type ToolResult,
} from '../utils/assistant/assistant-tools';

const KO = (value: number) => value.toLocaleString('ko-KR');
const VERDICT_KO: Readonly<Record<string, string>> = { open: '열림', contested: '반열림', locked: '잠김', card: '카드답' };

/** 내 블로그 기록(blog-class readBlogClassForAssistant) 중 비서가 읽는 부분. */
export interface AssistantBlogView {
  blogId: string;
  measuredAt: string;
  topicProfile?: { words: Array<{ word: string; posts: number }>; recentWords: Array<{ word: string; posts: number }>; declaredTopic: string | null; totalPosts: number | null } | null;
  wonRows?: Array<{ keyword: string; blogRank: number | null; searchVolume: number | null; documentCount: number | null; facing: number | null }>;
  band?: { volumeMin: number; volumeMax: number; wonCount: number; nearCount: number; measuredCount: number } | null;
  recentTitles?: Array<{ title: string; publishedOn: string | null }>;
}

export interface AssistantToolDeps {
  readBlog(): AssistantBlogView | null;
  readTodayPlan(): { day: string; keywords: Array<{ keyword: string; topic: string; searchVolume: number | null; seat: { verdict?: string | null } | null }> } | null;
  volumes(keywords: string[]): Promise<Map<string, number | null>>;
  docs(keywords: string[]): Promise<Map<string, number | null>>;
  expand(seed: string): Promise<{ autocomplete: string[]; related: Array<{ keyword: string; volume: number | null }> }>;
  seat(keywords: string[]): Promise<SeatRow[]>;
  homefeedBoard(): Promise<any | null>;
  advisorLatest(): { day?: string; homefeedTitles?: Array<{ title: string }> } | null;
  titleGuide(): { rules: string[]; samples: string[] };
  /** 사이트 공개 판(추천키워드 · 글감) — 못 받으면 null. */
  sitePicks(): Promise<any | null>;
  news(keyword: string): Promise<Array<{ title: string; description: string; pubDate: string; link: string }>>;
  siteBriefs(): Promise<any | null>;
}

const flat = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const lookup = <T>(map: Map<string, T>, keyword: string): T | undefined => map.get(keyword) ?? map.get(flat(keyword))
  ?? [...map.entries()].find(([key]) => flat(key) === flat(keyword))?.[1];

function blogText(view: AssistantBlogView | null, plan: ReturnType<AssistantToolDeps['readTodayPlan']>): string {
  if (!view) return '기록 없음 — 사용자가 아직 앱에서 [내 크기 재기]를 안 했다. 하라고 안내해라.';
  const lines = [`블로그 ${view.blogId} · ${String(view.measuredAt).slice(0, 10)} 에 잼`];
  const topic = view.topicProfile;
  if (topic) {
    lines.push(`대표 주제(설정): ${topic.declaredTopic || '없음'} · 글 ${topic.totalPosts ?? '?'}편`);
    if (topic.words.length) lines.push(`제목에 자주 쓴 말(글 수): ${topic.words.slice(0, 20).map((w) => `${w.word}(${w.posts})`).join(', ')}`);
    if (topic.recentWords.length) lines.push(`최근 90일 자주 쓴 말: ${topic.recentWords.slice(0, 12).map((w) => `${w.word}(${w.posts})`).join(', ')}`);
  }
  const rows = (view.wonRows || []).filter((row) => row.blogRank !== null).sort((a, b) => (a.blogRank ?? 99) - (b.blogRank ?? 99));
  if (rows.length) {
    lines.push('내 글이 실제로 붙어 본 검색어(블로그 탭 순위 · 월 검색량 · 문서수 · 정면 글):');
    for (const row of rows.slice(0, 20)) {
      lines.push(`- ${row.keyword}: ${row.blogRank}위 · ${row.searchVolume === null ? '검색량 못 잼' : KO(row.searchVolume)} · ${row.documentCount === null ? '문서수 못 잼' : KO(row.documentCount)} · 정면 ${row.facing ?? '못 잼'}`);
    }
  } else {
    lines.push('순위를 잰 검색어가 아직 없다.');
  }
  lines.push(view.band
    ? `내 크기: 30위 안에 붙어 본 말의 월 검색량 ${KO(view.band.volumeMin)}~${KO(view.band.volumeMax)} (첫 페이지 ${view.band.wonCount} · 11~30위 ${view.band.nearCount} / 잰 ${view.band.measuredCount})`
    : '내 크기: 30위 안 기록이 없어 검색량 범위를 못 정했다.');
  if (view.recentTitles?.length) lines.push(`최근 글 제목: ${view.recentTitles.slice(0, 12).map((p) => `"${p.title}"`).join(' / ')}`);
  if (plan?.keywords?.length) {
    lines.push(`앱 '오늘 쓸 글 10'(${plan.day} 통계 기준): ${plan.keywords.slice(0, 10).map((k) => `${k.keyword}[${k.topic}, ${k.searchVolume === null ? '검색량 못 잼' : KO(k.searchVolume)}, ${k.seat?.verdict ? VERDICT_KO[k.seat.verdict] ?? k.seat.verdict : '자리 안 잼'}]`).join(', ')}`);
  }
  return lines.join('\n');
}

function seatLine(row: SeatRow): string {
  if (row.status !== 'ok' || !row.verdict) return `- ${row.keyword}: 못 잼(${row.status === 'blocked' ? '네이버가 잠시 막음' : '열기 실패'})`;
  const parts = [
    `판정 ${VERDICT_KO[row.verdict] ?? row.verdict}`,
    `정면 ${row.facing ?? '?'}/${row.sampled ?? '?'}`,
    row.vacancy ? `${row.vacancy}번째 자리 빔` : '빈자리 없음',
    row.ads === null || row.ads === undefined ? null : `광고 ${row.ads}`,
    row.aiBriefing ? 'AI 브리핑 있음' : null,
    row.cards && row.cards.length ? `답 카드: ${row.cards.join('·')}` : null,
    row.staleDays === null || row.staleDays === undefined ? null : `상위 글 중앙 ${row.staleDays}일 전`,
  ].filter(Boolean);
  const titles = (row.topTitles || []).slice(0, 3).map((t) => `"${t}"`).join(' / ');
  return `- ${row.keyword}: ${parts.join(' · ')}${titles ? `\n  상위 제목: ${titles}` : ''}`;
}

const SITE_PICK_CAP = 12;
/** 주제 이름이 맞으면 그 주제만, 아니면 전체. 모르는 이름은 전체 목록을 주고 알려 준다. */
function matchCategory(names: string[], wanted: string | undefined): string[] | null {
  if (!wanted) return null;
  const want = flat(wanted);
  const hit = names.filter((n) => flat(n) === want || flat(n).includes(want) || want.includes(flat(n)));
  return hit.length ? hit : null;
}

function picksText(board: any | null, category: string | undefined): string {
  const topics: any[] = Array.isArray(board?.topics) ? board.topics : [];
  if (!topics.length) return '추천키워드 판을 받지 못했다.';
  const names = topics.map((t) => String(t.topic));
  const picked = matchCategory(names, category);
  if (category && !picked) return `"${category}" 주제는 없다. 주제 이름: ${names.join(', ')}`;
  const lines = [`추천키워드(${String(board.builtAt || '').slice(0, 16).replace('T', ' ')} UTC 판 · 자리는 재지 않은 값):`];
  for (const t of topics.filter((x) => !picked || picked.includes(String(x.topic)))) {
    lines.push(`[${t.topic}]`);
    for (const r of (t.rows || []).slice(0, picked ? 20 : 3)) {
      lines.push(`- ${r.keyword}: 월 검색량 ${r.searchVolume == null ? '못 잼' : KO(r.searchVolume)} · 문서 ${r.documentCount == null ? '못 잼' : KO(r.documentCount)} · 황금비 ${r.ratio ?? '?'}`);
    }
  }
  return lines.join('\n');
}

const TIMING_KO: Readonly<Record<string, string>> = { NOW: '지금 쓸 것', NEXT: '일정 전', ALWAYS: '상시' };
function briefsText(board: any | null, category: string | undefined): string {
  const items: any[] = Array.isArray(board?.briefs) ? board.briefs : [];
  if (!items.length) return '글감 판을 받지 못했다.';
  const names = [...new Set(items.map((b) => String(b.field)))];
  const picked = matchCategory(names, category);
  if (category && !picked) return `"${category}" 분야 글감은 이번 판에 없다. 있는 분야: ${names.join(', ')}`;
  const rows = items.filter((b) => !picked || picked.includes(String(b.field)));
  if (!rows.length) return `${category} 분야 글감은 이번 판에 없다(뉴스가 안 잡혔다).`;
  return [`글감(${String(board.builtAt || '').slice(0, 16).replace('T', ' ')} UTC 판):`, ...rows.slice(0, 15).map((b) => {
    const size = b.searchVolume == null ? '검색량 못 잼' : `월 검색량 ${KO(b.searchVolume)}`;
    const docs = b.documentCount == null ? '문서 못 잼' : `문서 ${KO(b.documentCount)}`;
    return `- [${b.field} · ${TIMING_KO[b.timing] || b.timing}] ${b.coreKeyword}: ${size} · ${docs} · 정면 ${b.serpFacing ?? '?'}/10 (${b.serpFit || '자리 미측정'}) — 제목 "${b.title || ''}"`;
  })].join('\n');
}

function homefeedText(board: any | null, advisor: ReturnType<AssistantToolDeps['advisorLatest']>): string {
  const lines: string[] = [];
  const candidates: any[] = Array.isArray(board?.candidates) ? board.candidates : [];
  if (candidates.length) {
    const counts = new Map<string, number>();
    for (const c of candidates) counts.set(String(c.category || '기타'), (counts.get(String(c.category || '기타')) ?? 0) + 1);
    lines.push(`벤치마크 판(${String(board.generatedAt || '').slice(0, 16).replace('T', ' ')} UTC 수집 · 소재 ${candidates.length}개) 분야별 소재 수: ${[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    const top = [...candidates].sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || (Number(b.priority) || 0) - (Number(a.priority) || 0)).slice(0, 15);
    lines.push('지금 여러 채널이 같이 다루는 소재(분야 · 채널 수 · 홈판 제목 초안):');
    for (const c of top) {
      const channels = Array.isArray(c.sources) ? new Set(c.sources.map((s: any) => s?.id || s?.name)).size : 0;
      const title = Array.isArray(c.homeTitles) && c.homeTitles.length ? ` · 초안 "${c.homeTitles[0]}"` : '';
      lines.push(`- ${c.keyword} [${c.category || '기타'} · 채널 ${channels}]${title}`);
    }
  } else {
    lines.push('벤치마크 판을 받지 못했다.');
  }
  const real = advisor?.homefeedTitles || [];
  lines.push(real.length
    ? `어제(${advisor?.day || '?'}) 실제 홈판 상위 글 제목(앱이 네이버 어드바이저로 잰 것): ${real.slice(0, 20).map((r) => `"${r.title}"`).join(' / ')}`
    : '실제 홈판 상위 기록 없음(앱에서 네이버 로그인 후 홈판 유입 수집을 해야 생긴다).');
  return lines.join('\n');
}

export async function runAssistantTools(
  calls: readonly ToolCall[],
  deps: AssistantToolDeps,
  budget: ReturnType<typeof createToolBudget>,
  onProgress?: (label: string) => void,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    try {
      if (call.tool === 'my_blog') {
        onProgress?.('내 블로그 기록 읽는 중');
        results.push({ tool: call.tool, ok: true, text: blogText(deps.readBlog(), deps.readTodayPlan()) });
      } else if (call.tool === 'volume' || call.tool === 'docs' || call.tool === 'seat') {
        const { allowed, dropped } = budget.take(call.tool, call.args.keywords || []);
        const tail = dropped.length ? `\n(상한이라 안 잰 것: ${dropped.join(', ')})` : '';
        if (!allowed.length) { results.push({ tool: call.tool, ok: false, text: `이번 질문의 상한을 다 썼거나 이미 잰 말이다.${tail}` }); continue; }
        if (call.tool === 'seat') {
          onProgress?.(`자리 재는 중 (${allowed.length}개 · 약 ${allowed.length * 5}초)`);
          const rows = await deps.seat(allowed);
          results.push({ tool: call.tool, ok: true, text: rows.map(seatLine).join('\n') + tail });
        } else {
          onProgress?.(call.tool === 'volume' ? '검색량 조회 중' : '문서수 조회 중');
          const map = await (call.tool === 'volume' ? deps.volumes(allowed) : deps.docs(allowed));
          const unit = call.tool === 'volume' ? '월 검색량' : '블로그 문서';
          results.push({ tool: call.tool, ok: true, text: allowed.map((k) => { const v = lookup(map, k); return `- ${k}: ${v === null || v === undefined ? '못 잼(정확한 값 없음)' : `${unit} ${KO(v)}`}`; }).join('\n') + tail });
        }
      } else if (call.tool === 'expand') {
        onProgress?.(`'${call.args.seed}' 연관어 찾는 중`);
        const { autocomplete, related } = await deps.expand(call.args.seed || '');
        const rel = related.filter((r) => r.keyword).sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, 20);
        results.push({ tool: call.tool, ok: true, text: [
          `자동완성: ${autocomplete.slice(0, 15).join(', ') || '없음'}`,
          `검색광고 연관어(월 검색량): ${rel.map((r) => `${r.keyword}(${r.volume === null ? '못 잼' : KO(r.volume)})`).join(', ') || '없음'}`,
        ].join('\n') });
      } else if (call.tool === 'homefeed_now') {
        onProgress?.('지금 홈판 흐름 읽는 중');
        results.push({ tool: call.tool, ok: true, text: homefeedText(await deps.homefeedBoard(), deps.advisorLatest()) });
      } else if (call.tool === 'picks') {
        onProgress?.('추천키워드 판 읽는 중');
        results.push({ tool: call.tool, ok: true, text: picksText(await deps.sitePicks(), call.args.category) });
      } else if (call.tool === 'briefs') {
        onProgress?.('글감 판 읽는 중');
        results.push({ tool: call.tool, ok: true, text: briefsText(await deps.siteBriefs(), call.args.category) });
      } else if (call.tool === 'news') {
        onProgress?.(`'${call.args.seed}' 뉴스 찾는 중`);
        const items = await deps.news(call.args.seed || '');
        results.push({ tool: call.tool, ok: true, text: items.length
          ? items.slice(0, 8).map((n) => `- ${n.title} (${n.pubDate.slice(0, 16)})\n  ${n.description}`).join('\n')
          : `"${call.args.seed}" 뉴스가 최근에 없다 — 이 사실은 재료에 없다.` });
      } else if (call.tool === 'title_guide') {
        const guide = deps.titleGuide();
        results.push({ tool: call.tool, ok: true, text: [...guide.rules, '실제 홈판 제목 본보기:', ...guide.samples.map((s) => `- ${s}`)].join('\n') });
      }
    } catch (error: any) {
      // 실패 원문엔 경로가 섞일 수 있다 — 짧은 사유만.
      const reason = /키|key|license|인증|401|403/i.test(String(error?.message)) ? '키가 없거나 인증이 막혔다(설정 · 키 확인)' : '조회 실패';
      results.push({ tool: call.tool, ok: false, text: reason });
    }
  }
  return results;
}

/** 앱 설정의 키로 실측 창구를 만든다(daily-pick realMyBlogDeps 와 같은 배선). 키가 없으면 그 창구는 빈손. */
/** 사이트 공개 판 한 개를 받는다(12초 상한). 실패는 null — 판 하나 때문에 다른 도구를 막지 않는다. */
async function fetchSiteJson(file: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(`https://leaderspro.kr/data/${file}`, { signal: controller.signal });
    return res.ok ? await res.json() : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

export async function createRealToolDeps(): Promise<AssistantToolDeps> {
  const { EnvironmentManager } = await import('../utils/environment-manager');
  const manager: any = typeof (EnvironmentManager as any).getInstance === 'function'
    ? (EnvironmentManager as any).getInstance() : new (EnvironmentManager as any)();
  const cfg = manager.getConfig() || {};
  const ad = {
    accessLicense: cfg.naverSearchAdAccessLicense || process.env.NAVER_SEARCH_AD_ACCESS_LICENSE || '',
    secretKey: cfg.naverSearchAdSecretKey || process.env.NAVER_SEARCH_AD_SECRET_KEY || '',
    customerId: cfg.naverSearchAdCustomerId || process.env.NAVER_SEARCH_AD_CUSTOMER_ID || '',
  };
  const openApi = {
    clientId: cfg.naverClientId || process.env.NAVER_CLIENT_ID || '',
    clientSecret: cfg.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '',
  };
  const hasAd = Boolean(ad.accessLicense && ad.secretKey);
  const searchad = await import('../utils/naver-searchad-api');
  return {
    readBlog: () => {
      const { readBlogClassForAssistant } = require('./handlers/blog-class');
      return readBlogClassForAssistant();
    },
    readTodayPlan: () => {
      const { readTodayPlan } = require('./handlers/advisor-today');
      return readTodayPlan();
    },
    volumes: async (keywords) => {
      const out = new Map<string, number | null>();
      if (!hasAd) throw new Error('검색광고 키 없음');
      const rows = await searchad.getNaverSearchAdKeywordVolume(ad, keywords);
      for (const row of rows || []) out.set(String((row as any).keyword || ''), searchad.exactSearchAdTotal(row as any));
      return out;
    },
    docs: async (keywords) => {
      const { getNaverBlogDocumentCount } = await import('../utils/naver-blog-api');
      const out = new Map<string, number | null>();
      for (const keyword of keywords) {
        out.set(keyword, await getNaverBlogDocumentCount(keyword, { config: openApi, timeoutMs: 10_000 }).catch(() => null));
      }
      return out;
    },
    expand: async (seed) => {
      const autocompleteMod = await import('../utils/naver-autocomplete');
      const [autocomplete, related] = await Promise.all([
        openApi.clientId ? autocompleteMod.getNaverAutocompleteKeywords(seed, { ...openApi, skipSearchAdRelated: true }).catch(() => []) : Promise.resolve([]),
        hasAd ? searchad.getNaverSearchAdKeywordSuggestions(ad, seed, 60).catch(() => []) : Promise.resolve([]),
      ]);
      return {
        autocomplete: (autocomplete || []).map(String),
        related: (related || []).map((it: any) => ({ keyword: String(it.keyword || ''), volume: searchad.exactSearchAdTotal(it) })),
      };
    },
    seat: async (keywords) => {
      const { measureKeywords } = await import('./handlers/seat-measure');
      return (await measureKeywords(keywords, { withStructure: true })).rows;
    },
    homefeedBoard: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch('https://leaderspro.kr/data/homefeed-benchmarks.json', { signal: controller.signal });
        return res.ok ? await res.json() : null;
      } catch { return null; } finally { clearTimeout(timer); }
    },
    advisorLatest: () => {
      const { readAdvisorDailyView } = require('./handlers/advisor-daily');
      return readAdvisorDailyView().latest;
    },
    sitePicks: async () => fetchSiteJson('today-picks.json'),
    news: async (keyword) => {
      const { naverApiFetch } = await import('../utils/naver-api-hub');
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=8&sort=date`;
      const res = await naverApiFetch(url, { headers: { 'X-Naver-Client-Id': openApi.clientId, 'X-Naver-Client-Secret': openApi.clientSecret } });
      if (!res.ok) throw new Error(`뉴스 검색 ${res.status}`);
      const body = (await res.json()) as { items?: Array<{ title?: string; description?: string; pubDate?: string; link?: string }> };
      const clean = (text: string | undefined) => String(text || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
      return (body.items || []).map((item) => ({ title: clean(item.title), description: clean(item.description).slice(0, 160), pubDate: String(item.pubDate || ''), link: String(item.link || '') }));
    },
    siteBriefs: async () => fetchSiteJson('topic-briefs.json'),
    titleGuide: () => {
      const { homefeedTitleRuleLines, feedTitleSamples } = require('../utils/benchmark-title-engine');
      return { rules: homefeedTitleRuleLines(), samples: feedTitleSamples(12) };
    },
  };
}
