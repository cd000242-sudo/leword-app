// LEWORD Key Wizard — 오케스트레이터
// 작성: 2026-04-15
// 사이트별 Provider 디스패치 + 동시 실행 방지 mutex

import type { KeyWizardSite, KeyWizardResult, ProviderDefinition } from './types';
import { youtubeDefinition, startYouTubeWizard } from './providers/youtube';
import { threadsDefinition, startThreadsWizard } from './providers/threads';
import { naverDevDefinition, startNaverDevWizard } from './providers/naver-dev';
import { naverSearchAdDefinition, startNaverSearchAdWizard } from './providers/naver-searchad';
import { rakutenDefinition, startRakutenWizard } from './providers/rakuten';
import { bigkindsDefinition, startBigkindsWizard } from './providers/bigkinds';

export const PROVIDERS: Record<KeyWizardSite, ProviderDefinition> = {
  youtube: youtubeDefinition,
  threads: threadsDefinition,
  'naver-dev': naverDevDefinition,
  'naver-searchad': naverSearchAdDefinition,
  rakuten: rakutenDefinition,
  bigkinds: bigkindsDefinition,
};

export function listProviders(): ProviderDefinition[] {
  return Object.values(PROVIDERS);
}

class WizardMutex {
  private activeSite: KeyWizardSite | null = null;
  private activeAbort: AbortController | null = null;

  acquire(site: KeyWizardSite): AbortController {
    if (this.activeSite) {
      throw new Error(`이미 ${this.activeSite} 마법사가 실행 중입니다.`);
    }
    this.activeSite = site;
    this.activeAbort = new AbortController();
    return this.activeAbort;
  }

  release(): void {
    this.activeSite = null;
    this.activeAbort = null;
  }

  cancel(): boolean {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.release();
      return true;
    }
    return false;
  }

  current(): KeyWizardSite | null {
    return this.activeSite;
  }
}

export const mutex = new WizardMutex();

export interface RunOptions {
  site: KeyWizardSite;
  args?: Record<string, any>;
  onProgress: (msg: string) => void;
}

export async function runKeyWizard(opts: RunOptions): Promise<KeyWizardResult> {
  const ctrl = mutex.acquire(opts.site);
  const args = opts.args || {};
  try {
    switch (opts.site) {
      case 'youtube':
        return await startYouTubeWizard(args as any, opts.onProgress);
      case 'threads':
        return await startThreadsWizard(args as any, opts.onProgress);
      case 'naver-dev':
        return await startNaverDevWizard({} as any, opts.onProgress, ctrl.signal);
      case 'naver-searchad':
        return await startNaverSearchAdWizard({} as any, opts.onProgress, ctrl.signal);
      case 'rakuten':
        return await startRakutenWizard({} as any, opts.onProgress, ctrl.signal);
      case 'bigkinds':
        return await startBigkindsWizard({} as any, opts.onProgress);
      default:
        throw new Error(`알 수 없는 사이트: ${opts.site}`);
    }
  } finally {
    mutex.release();
  }
}
