import { app } from 'electron';
import * as path from 'path';
import { atomicBoardWrite, boardTime, publicBoard, readBoardFile, type BoardKey } from './board-cache';
import { createBriefTitleService, fetchTitleSourceSnapshot } from './brief-title-service';
import type { BoardBridgeDeps } from './board-bridge-routes';
import { selectSavedIssueBoard } from './legacy-issue-board';
import { readBriefProvider, saveBriefProvider } from './topic-brief-preferences';

export function createBoardBridgeDeps(options: { userData?: () => string; readFile?: (file: string) => unknown; now?: () => number } = {}): BoardBridgeDeps {
  const userData = options.userData ?? (() => app.getPath('userData'));
  const readFile = options.readFile ?? readBoardFile;
  const now = options.now ?? Date.now;
  const file = (key: BoardKey) => path.join(userData(), ...({
    'topic-briefs': ['topic-briefs', 'latest.json'],
    'issue-niche': ['realtime-niche', 'public-board.json'],
    'brief-titles': ['brief-titles', 'latest.json'],
  }[key]));
  const envelope = (key: BoardKey, board: any) => ({ board, source: 'app' as const, generatedAt: boardTime(key, board), state: board ? 'ready' : 'empty' });
  const titles = createBriefTitleService({ read: () => readFile(file('brief-titles')),
    save: board => atomicBoardWrite(file('brief-titles'), board), fetchSignals: fetchTitleSourceSnapshot, now });
  return {
    getPreferences: async () => ({ provider: readBriefProvider(userData()) || null }),
    savePreferences: async provider => saveBriefProvider(userData(), provider),
    allowed: async () => {
      const { loadLicense, isLicenseExpired } = await import('../utils/licenseManager');
      const license = await loadLicense();
      return Boolean(license?.isValid && !isLicenseExpired(license));
    },
    read: async key => envelope(key, key === 'issue-niche'
      ? selectSavedIssueBoard(readFile(file(key)), readFile(path.join(userData(), 'realtime-niche', 'latest.json')), now())
      : publicBoard(key, readFile(file(key)), now())),
    generateTitles: async keyword => envelope('brief-titles', await titles.generate(keyword)),
  };
}
