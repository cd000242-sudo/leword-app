// LEWORD Key Wizard — IPC 핸들러
// 작성: 2026-04-15

import { ipcMain, BrowserWindow } from 'electron';
import { runKeyWizard, mutex, listProviders, PROVIDERS } from '../key-wizard';
import { deleteToken, listSites, getUpdatedAt } from '../key-wizard/token-store';
import { EnvironmentManager } from '../../utils/environment-manager';
import type { KeyWizardSite } from '../key-wizard/types';

const VALID_SITES: KeyWizardSite[] = [
  'youtube',
  'threads',
  'naver-dev',
  'naver-searchad',
  'rakuten',
  'bigkinds',
];

function isValidSite(s: any): s is KeyWizardSite {
  return typeof s === 'string' && VALID_SITES.includes(s as KeyWizardSite);
}

function broadcastProgress(site: KeyWizardSite, message: string): void {
  const wins = BrowserWindow.getAllWindows();
  for (const w of wins) {
    if (!w.isDestroyed()) {
      w.webContents.send('keyWizard:progress', { site, message, timestamp: Date.now() });
    }
  }
}

export function setupKeyWizardHandlers(): void {
  // 중복 등록 방지
  const channels = [
    'keyWizard:start',
    'keyWizard:cancel',
    'keyWizard:status',
    'keyWizard:list',
    'keyWizard:reset',
    'keyWizard:setOAuthCredentials',
  ];
  for (const ch of channels) {
    ipcMain.removeHandler(ch);
  }

  // 1. 시작
  ipcMain.handle('keyWizard:start', async (_e, payload: { site: any; args?: Record<string, any> }) => {
    if (!payload || !isValidSite(payload.site)) {
      return { success: false, reason: '유효하지 않은 사이트', errorCode: 'INVALID_SITE' };
    }
    try {
      const result = await runKeyWizard({
        site: payload.site,
        args: payload.args,
        onProgress: (msg) => broadcastProgress(payload.site, msg),
      });
      // 결과 브로드캐스트
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.webContents.send('keyWizard:result', result);
        }
      }
      return result;
    } catch (err: any) {
      const result = {
        success: false,
        site: payload.site,
        reason: err?.message || '실행 실패',
        errorCode: 'RUN_FAILED',
      };
      return result;
    }
  });

  // 2. 취소
  ipcMain.handle('keyWizard:cancel', async () => {
    const ok = mutex.cancel();
    return { success: ok, message: ok ? '취소됨' : '실행 중인 마법사 없음' };
  });

  // 3. 상태
  ipcMain.handle('keyWizard:status', async () => {
    const env = EnvironmentManager.getInstance().getConfig();
    const now = Date.now();
    return {
      activeSite: mutex.current(),
      providers: listProviders(),
      states: {
        youtube: {
          configured: !!(env.youtubeOAuthClientId && env.youtubeOAuthAccessToken),
          expiresAt: env.youtubeTokenExpiresAt || null,
          daysLeft: env.youtubeTokenExpiresAt
            ? Math.floor((env.youtubeTokenExpiresAt - now) / (24 * 3600 * 1000))
            : null,
        },
        threads: {
          configured: !!(env.threadsAppId && env.threadsAccessToken),
          expiresAt: env.threadsTokenExpiresAt || null,
          daysLeft: env.threadsTokenExpiresAt
            ? Math.floor((env.threadsTokenExpiresAt - now) / (24 * 3600 * 1000))
            : null,
        },
        'naver-dev': {
          configured: !!(env.naverClientId && env.naverClientSecret),
        },
        'naver-searchad': {
          configured: !!(
            env.naverSearchAdAccessLicense &&
            env.naverSearchAdSecretKey &&
            env.naverSearchAdCustomerId
          ),
        },
        rakuten: {
          configured: !!env.rakutenApplicationId,
        },
        bigkinds: {
          configured: !!env.bigkindsAccessKey,
        },
      },
      tokenStore: listSites().map((s) => ({ site: s, updatedAt: getUpdatedAt(s) })),
    };
  });

  // 4. 사전 단계(가이드) 조회
  ipcMain.handle('keyWizard:list', async () => {
    return listProviders();
  });

  // 5. 인증 초기화
  ipcMain.handle('keyWizard:reset', async (_e, payload: { site: any }) => {
    if (!isValidSite(payload?.site)) {
      return { success: false, reason: '유효하지 않은 사이트' };
    }
    deleteToken(payload.site);
    const clearMap: Record<KeyWizardSite, Partial<Record<string, any>>> = {
      youtube: {
        youtubeOAuthAccessToken: '',
        youtubeOAuthRefreshToken: '',
        youtubeTokenExpiresAt: 0,
      },
      threads: {
        threadsAccessToken: '',
        threadsTokenExpiresAt: 0,
      },
      'naver-dev': { naverClientId: '', naverClientSecret: '' },
      'naver-searchad': {
        naverSearchAdAccessLicense: '',
        naverSearchAdSecretKey: '',
        naverSearchAdCustomerId: '',
      },
      rakuten: { rakutenApplicationId: '' },
      bigkinds: { bigkindsAccessKey: '' },
    };
    await EnvironmentManager.getInstance().saveConfig(clearMap[payload.site] as any);
    return { success: true };
  });

  // 6. OAuth Client 자격증명 사전 저장 (YouTube/Threads 사전 단계)
  ipcMain.handle('keyWizard:setOAuthCredentials', async (_e, payload: { site: any; credentials: Record<string, string> }) => {
    if (!isValidSite(payload?.site)) {
      return { success: false, reason: '유효하지 않은 사이트' };
    }
    const c = payload.credentials || {};
    if (payload.site === 'youtube') {
      await EnvironmentManager.getInstance().saveConfig({
        youtubeOAuthClientId: c.clientId,
        youtubeOAuthClientSecret: c.clientSecret,
      });
    } else if (payload.site === 'threads') {
      await EnvironmentManager.getInstance().saveConfig({
        threadsAppId: c.appId,
        threadsAppSecret: c.appSecret,
      });
    } else {
      return { success: false, reason: '해당 사이트는 사전 자격증명 불필요' };
    }
    return { success: true };
  });

  console.log('[KEY-WIZARD] ✅ IPC 핸들러 등록 완료 (6채널)');
}
