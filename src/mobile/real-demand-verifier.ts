/**
 * 실수요 증명 게이트 (C4 후속) — "네이버 자동완성에 흔적이 있는 키워드만 진짜 검색어다."
 *
 * 서버 프로브가 제조한 조합 키워드('단백질보충제순위준비물' 류)는 SearchAd 가 유령 검색량을
 * 돌려줘 지표상 완벽한 SSS 가 될 수 있다. 지표 게이트는 이를 못 거른다 — 사람이 실제로 치는
 * 말인지는 자동완성 실측으로만 증명된다.
 *
 * 판정 규칙(실측 사실만):
 *  - real: 자동완성 제안 중 하나가 키워드와 동일(echo)하거나 키워드로 시작(extension)
 *  - fake: 프로브 왕복은 성공했는데 echo/extension 이 없음
 *  - unknown: 프로브 왕복 실패(ok=false)/예산 초과 → 판정 보류(절대 삭제 근거로 쓰지 않음)
 *
 * 판정은 파일 캐시에 영속화(기본 14일 재검증)하고, 사이클당 호출 예산 + 요청 간 지연으로
 * 단일 IP 429 리스크를 관리한다.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  probeNaverAutocompleteSuggestions,
  type NaverAutocompleteEchoProbe,
} from '../utils/naver-autocomplete';

export type RealDemandResult = 'real' | 'fake' | 'unknown';

export interface RealDemandVerdict {
  result: 'real' | 'fake';
  via: 'echo' | 'extension' | 'none';
  checkedAt: string;
}

export interface RealDemandVerifierOptions {
  probe?: (query: string) => Promise<NaverAutocompleteEchoProbe>;
  cacheFile?: string;
  now?: () => Date;
  recheckMs?: number;
  requestDelayMs?: number;
}

const DEFAULT_RECHECK_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_REQUEST_DELAY_MS = 350;
// 장애 안전장치: 한 번의 verify 에서 신규 판정이 이 개수 이상인데 전부 fake 면(정상 상황에선
// 드묾 — 차단 페이지가 200 으로 빈 제안을 줄 때의 패턴) 판정을 폐기하고 unknown 으로 되돌린다.
const SUSPICIOUS_ALL_FAKE_MIN = 8;

function compactText(value: unknown): string {
  return String(value || '').toLowerCase().replace(/\s+/g, '').trim();
}

export class RealDemandVerifier {
  private readonly probe: (query: string) => Promise<NaverAutocompleteEchoProbe>;
  private readonly cacheFile?: string;
  private readonly now: () => Date;
  private readonly recheckMs: number;
  private readonly requestDelayMs: number;
  private readonly verdicts = new Map<string, RealDemandVerdict>();
  private loaded = false;

  constructor(options: RealDemandVerifierOptions = {}) {
    this.probe = options.probe || probeNaverAutocompleteSuggestions;
    this.cacheFile = options.cacheFile;
    this.now = options.now || (() => new Date());
    this.recheckMs = options.recheckMs ?? DEFAULT_RECHECK_MS;
    this.requestDelayMs = options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS;
  }

  /** 저장된 판정 조회(만료 판정은 null). 네트워크 없음 — 동기 게이트에서 사용 가능. */
  verdictFor(keyword: string): RealDemandVerdict | null {
    this.loadCache();
    const verdict = this.verdicts.get(compactText(keyword));
    if (!verdict) return null;
    const age = this.now().getTime() - Date.parse(verdict.checkedAt);
    if (!Number.isFinite(age) || age > this.recheckMs) return null;
    return verdict;
  }

  /**
   * 미판정 키워드를 예산 한도 안에서 자동완성 프로브로 검증한다.
   * 반환 맵 키는 compact 키워드, 값은 'real' | 'fake' | 'unknown'(실패/예산 초과 — 삭제 금지).
   */
  async verify(keywords: string[], budget: number): Promise<Map<string, RealDemandResult>> {
    this.loadCache();
    const out = new Map<string, RealDemandResult>();
    const freshKeys: string[] = [];
    let freshReal = 0;
    let spent = 0;
    let dirty = false;
    for (const raw of keywords) {
      const keyword = String(raw || '').replace(/\s+/g, ' ').trim();
      const key = compactText(keyword);
      if (!key || out.has(key)) continue;
      const cached = this.verdictFor(keyword);
      if (cached) {
        out.set(key, cached.result);
        continue;
      }
      if (spent >= budget) {
        out.set(key, 'unknown');
        continue;
      }
      spent += 1;
      try {
        const probe = await this.probe(keyword);
        if (!probe || probe.ok !== true) {
          out.set(key, 'unknown');
        } else {
          const matched = (Array.isArray(probe.suggestions) ? probe.suggestions : [])
            .map(compactText)
            .filter(Boolean);
          const via: RealDemandVerdict['via'] = matched.some((s) => s === key)
            ? 'echo'
            : matched.some((s) => s.startsWith(key))
              ? 'extension'
              : 'none';
          const verdict: RealDemandVerdict = {
            result: via === 'none' ? 'fake' : 'real',
            via,
            checkedAt: this.now().toISOString(),
          };
          this.verdicts.set(key, verdict);
          out.set(key, verdict.result);
          freshKeys.push(key);
          if (verdict.result === 'real') freshReal += 1;
          dirty = true;
        }
      } catch {
        out.set(key, 'unknown');
      }
      if (this.requestDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.requestDelayMs));
      }
    }
    if (freshKeys.length >= SUSPICIOUS_ALL_FAKE_MIN && freshReal === 0) {
      // 신규 판정 전원 fake = 원격 차단 의심 — 이번 판정을 폐기하고 다음 사이클에 재검증한다.
      for (const key of freshKeys) {
        this.verdicts.delete(key);
        out.set(key, 'unknown');
      }
      dirty = false;
    }
    if (dirty) this.saveCache();
    return out;
  }

  private loadCache(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.cacheFile) return;
    try {
      if (!fs.existsSync(this.cacheFile)) return;
      const raw = fs.readFileSync(this.cacheFile, 'utf8').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' ? parsed.verdicts : null;
      if (!entries || typeof entries !== 'object') return;
      for (const [key, value] of Object.entries(entries as Record<string, RealDemandVerdict>)) {
        if (!value || (value.result !== 'real' && value.result !== 'fake')) continue;
        this.verdicts.set(compactText(key), {
          result: value.result,
          via: value.via === 'echo' || value.via === 'extension' ? value.via : 'none',
          checkedAt: String(value.checkedAt || ''),
        });
      }
    } catch {
      // 캐시 손상은 재검증으로 회복 — 검증기 실패가 발굴을 막으면 안 된다.
    }
  }

  private saveCache(): void {
    if (!this.cacheFile) return;
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      const payload = {
        version: 1,
        savedAt: this.now().toISOString(),
        verdicts: Object.fromEntries(this.verdicts.entries()),
      };
      const tmpFile = `${this.cacheFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.cacheFile);
    } catch {
      // 저장 실패 시 다음 사이클에 재검증 — 치명적이지 않다.
    }
  }
}
