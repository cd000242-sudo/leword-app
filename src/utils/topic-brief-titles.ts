import type { BriefTitle } from './topic-briefs';

const clean = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const flat = (value: string) => value.replace(/[\s:：·'"‘’“”]/g, '').toLowerCase();
const TITLE_BANNED = ['총정리', '완벽정리', '완벽 정리', '한눈에', '알아보자', '알아봅시다', '정리해봤', '정리해 봤', '충격', '실화', '레전드', '~하는 방법'];
const ASK_TAIL = /(\?|나요|인가요|인가|일까요|일까|될까요|될까|할까요|할까|되나|주나|있나|없나|했나|졌나|오나|되는지|하는지|받는지|있는지|언제|얼마|어디|누가|몇)\s*$/;

/** 사용자 경험을 받은 적 없는 뉴스 기반 생성에서는 과거의 사용·방문·수령을 주장할 수 없다. */
export function hasFabricatedExperience(value: unknown): boolean {
  return clean(value).split(/[.!?。\n]+/).some(sentence => {
    // 사용 경험을 확보하라는 안내와 경험이 없다는 고지는 주장이 아니다.
    if (/(?:경험|후기).*(?:없|금지|날조|확인해야|별도로 확인|쓰면 안|쓰지 않|일반화하지)/.test(sentence)
      && !/(?:했|봤|갔|받았|써봤|써보|사봤|발랐|먹었).*(?:어요|네요|더라)/.test(sentence)) return false;
    return /(?:써\s?보니|써\s?봤|써\s?본|써보고|해\s?보니|해\s?봤|가\s?보니|가\s?봤|다녀\s?왔|다녀\s?오니|갔어요|사\s?봤|샀(?:어요|더니)|바꿨더니|누워\s?보니|발라\s?보니|발랐더니|먹어\s?보니|먹었더니|받아\s?보니|받았(?:어요|더니|습니다)|수령했|방문했|진료받|진료를\s?받|들었(?:어요|더니)|듣고\s?.*(?:놀랐|알았)|챙기러\s?갔|더라고요|던데요|알겠더라|접었다가|이러니까\s?바로\s?풀리)/.test(sentence)
      || /(?:저는|제가|내가|저희|우리 가족).*(?:사용|방문|구입|구매|신청|수령|진료|접종|효과)/.test(sentence);
  });
}

export const NEWSY_TAILS: readonly string[] = ['나선다', '밝혔다', '전망이다', '예정이다', '계획이다', '방침이다', '분석된다', '보인다', '꼽힌 이유', '꼽혔다', '열린 공청회', '개최', '원서접수', '접수 시작', '돌입', '착수', '한다는 분석', '기록', '확정', '발표', '공개', '출시', '합류했다', '선정', '추진'];
export function hasHumanVoice(text: string): boolean {
  return /(네요|어요|아요|더라고요|던데요|거든요|니다|해요|겠어요|잖아요|드려요|봤어요|했어요)\s*[.!?]?\s*$/.test(clean(text));
}
export function isNewsyTitle(text: string): boolean {
  return !hasHumanVoice(text) && NEWSY_TAILS.some(tail => clean(text).endsWith(tail));
}

/** 검색어나 제품명에 들어 있는 모델 번호는 수치형 제목의 근거가 아니다. */
export function titleTargetOf(text: string, keywords: readonly string[]): BriefTitle['target'] {
  const normalized = flat(text);
  const leading = [...keywords].map(flat).filter(k => k.length >= 2 && normalized.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (!leading) return null;
  if (ASK_TAIL.test(text.trim())) return '질문';
  const tail = normalized.slice(leading.length);
  if (/(?:\d[\d,.]*\s*(?:조|억|만|천)?\s*(?:원|%|퍼센트|명|개|회|배|세|학년도|장|년|월|일|시|분|승|패|점)|20\d{2}[-./]\d{1,2}[-./]\d{1,2})/.test(tail)) return '수치';
  return '설명';
}

export function sanitizeTitles(raw: unknown, mainTitle: string, limit = 4, keywords: readonly string[] = []): BriefTitle[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([flat(mainTitle)]);
  const kept: BriefTitle[] = [];
  for (const item of raw) {
    const text = clean(item?.text);
    const type = clean(item?.type);
    if (text.length < 8 || text.length > 45 || hasFabricatedExperience(text)) continue;
    if (TITLE_BANNED.some(word => text.includes(word)) || isNewsyTitle(text)) continue;
    if (/[,][^,]{0,14}[?]\s*$/.test(text) || /\bTOP\s*\d|\d+\s*가지/i.test(text) || seen.has(flat(text))) continue;
    const target = keywords.length ? titleTargetOf(text, keywords) : null;
    if (keywords.length && !target) continue;
    seen.add(flat(text));
    kept.push({ target, type: type === '경험형' ? '설명형' : type || '기타', text });
  }
  if (!keywords.length) return kept.slice(0, limit);
  const pools = (['설명', '질문', '수치'] as const).map(target => kept.filter(item => item.target === target));
  const out: BriefTitle[] = [];
  for (let index = 0; index < kept.length && out.length < limit; index++) {
    for (const pool of pools) if (pool[index] && out.length < limit) out.push(pool[index]);
  }
  return out;
}
