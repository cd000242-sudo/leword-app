// v2.43.40 (Phase 3-B Step 2): 의미 임베딩 기반 키워드 분류
// transformers.js + multilingual-MiniLM 모델로 한국어 임베딩 → cosine similarity
//
// 정책:
// - opt-in (사용자가 명시적으로 활성화). 모델 다운로드 ~110MB
// - 결정론적 (같은 입력 → 같은 임베딩)
// - 캐시 영속 (`%APPDATA%/leword/embeddings.json`)
// - "AI 사용 최소" 정책 부합 (로컬 추론, 외부 API 0)

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// 지연 import (모델 로드 비용)
let pipelinePromise: Promise<any> | null = null;
let pipelineFn: any = null;
let modelReady = false;
let modelLoading = false;
let modelError: string | null = null;
let loadProgress = 0;

// 한국어 지원 다국어 모델 — small + fast (~110MB)
const MODEL_ID = 'Xenova/multilingual-e5-small';

// 임베딩 영속 캐시
type EmbeddingCache = Record<string, number[]>;
let memoryCache: EmbeddingCache = {};
let cacheLoaded = false;

function getCachePath(): string {
  const dir = path.join(app.getPath('userData'), 'leword');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'embeddings.json');
}

function loadCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const p = getCachePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      memoryCache = JSON.parse(raw) as EmbeddingCache;
      console.log(`[SEMANTIC] 임베딩 캐시 로드: ${Object.keys(memoryCache).length}건`);
    }
  } catch (e: any) {
    console.warn('[SEMANTIC] 캐시 로드 실패:', e?.message);
    memoryCache = {};
  }
}

let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(getCachePath(), JSON.stringify(memoryCache), 'utf8');
    } catch (e: any) {
      console.warn('[SEMANTIC] 캐시 저장 실패:', e?.message);
    }
    saveTimer = null;
  }, 3000);
  saveTimer.unref?.();
}

/**
 * 모델 활성화 (opt-in). 최초 호출 시 ~110MB 다운로드.
 */
export async function enableSemantic(): Promise<{ ready: boolean; error?: string }> {
  if (modelReady) return { ready: true };
  if (modelLoading) {
    // 이미 로드 중이면 대기
    if (pipelinePromise) {
      await pipelinePromise.catch(() => {});
    }
    return { ready: modelReady, error: modelError || undefined };
  }
  modelLoading = true;
  modelError = null;
  try {
    console.log('[SEMANTIC] 모델 로드 시작:', MODEL_ID);
    pipelinePromise = (async () => {
      const transformers = await import('@xenova/transformers');
      const { pipeline, env } = transformers as any;
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      const fn = await pipeline('feature-extraction', MODEL_ID, {
        progress_callback: (data: any) => {
          if (data?.progress !== undefined) {
            loadProgress = Math.round(data.progress);
          }
        },
      });
      pipelineFn = fn;
      modelReady = true;
      console.log('[SEMANTIC] ✅ 모델 로드 완료');
      loadCache();
      return fn;
    })();
    await pipelinePromise;
    // v2.43.48: 카테고리 라벨 자동 warmup (이후 cosine 즉시)
    void warmupCategoryLabels().then(n => {
      if (n > 0) console.log(`[SEMANTIC] 카테고리 라벨 ${n}개 사전 임베딩 완료`);
    });
    return { ready: true };
  } catch (e: any) {
    modelError = e?.message || '모델 로드 실패';
    console.error('[SEMANTIC] 모델 로드 실패:', modelError);
    modelLoading = false;
    return { ready: false, error: modelError };
  }
}

export function getSemanticStatus() {
  return {
    ready: modelReady,
    loading: modelLoading,
    progress: loadProgress,
    error: modelError,
    cacheSize: Object.keys(memoryCache).length,
  };
}

/**
 * 키워드 임베딩 (캐시 우선)
 */
export async function embed(keyword: string): Promise<number[] | null> {
  if (!modelReady) return null;
  const clean = keyword.trim();
  if (!clean) return null;
  loadCache();
  if (memoryCache[clean]) return memoryCache[clean];
  try {
    const output = await pipelineFn(clean, { pooling: 'mean', normalize: true });
    const arr = Array.from(output.data as Float32Array);
    memoryCache[clean] = arr;
    scheduleSave();
    return arr;
  } catch (e: any) {
    console.warn('[SEMANTIC] embed 실패:', e?.message);
    return null;
  }
}

/**
 * 다건 일괄 임베딩 (배치 가능)
 */
export async function embedBatch(keywords: string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (!modelReady) return result;
  loadCache();
  const uncached: string[] = [];
  for (const kw of keywords) {
    const c = kw.trim();
    if (!c) continue;
    if (memoryCache[c]) result.set(c, memoryCache[c]);
    else uncached.push(c);
  }
  // 미캐시는 순차 처리 (transformers.js는 단건 호출 권장)
  for (const kw of uncached) {
    const v = await embed(kw);
    if (v) result.set(kw, v);
  }
  return result;
}

/**
 * cosine similarity
 */
export function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/**
 * 의미 호환성 검사 — 두 키워드/문구가 의미상 연결되는지
 * 0.5+ = 호환, 0.3~0.5 = 약함, 0.3- = 충돌
 */
export async function semanticCompatible(a: string, b: string, threshold = 0.5): Promise<boolean> {
  if (!modelReady) return true; // 모델 비활성 시 통과 (현재 동작 유지)
  const va = await embed(a);
  const vb = await embed(b);
  if (!va || !vb) return true;
  return cosine(va, vb) >= threshold;
}

/**
 * 키워드를 후보 카테고리 라벨 중 가장 가까운 것에 분류
 */
export async function classifyByLabels(
  keyword: string,
  labels: Array<{ id: string; description: string }>,
): Promise<{ id: string; similarity: number } | null> {
  if (!modelReady || labels.length === 0) return null;
  const kv = await embed(keyword);
  if (!kv) return null;
  let best: { id: string; similarity: number } | null = null;
  for (const label of labels) {
    const lv = await embed(label.description);
    if (!lv) continue;
    const sim = cosine(kv, lv);
    if (!best || sim > best.similarity) {
      best = { id: label.id, similarity: sim };
    }
  }
  return best;
}

/**
 * 시드별 임베딩 사전 계산 (warmup)
 */
export async function precomputeEmbeddings(keywords: string[]): Promise<number> {
  if (!modelReady) return 0;
  let count = 0;
  for (const kw of keywords) {
    if (!memoryCache[kw.trim()]) {
      await embed(kw);
      count++;
    }
  }
  return count;
}

/**
 * v2.43.48: 카테고리 라벨 description 사전 임베딩 (모델 활성 직후 1회)
 * 다음부터 calculateProfileAffinityAsync 호출 시 cosine 즉시 (캐시 hit)
 */
export async function warmupCategoryLabels(): Promise<number> {
  if (!modelReady) return 0;
  try {
    const { BLOGGER_CATEGORIES } = await import('./blogger-profile');
    const labels = BLOGGER_CATEGORIES.map(c => c.description);
    return precomputeEmbeddings(labels);
  } catch (e: any) {
    console.warn('[SEMANTIC] warmupCategoryLabels 실패:', e?.message);
    return 0;
  }
}
