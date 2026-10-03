import { app } from 'electron';
import { createBriefRecovery } from './topic-brief-recovery';
import { isTopicBriefPublishingEnabled, publishAppBriefs } from './topic-brief-publisher';
import { readBoardFile } from './board-cache';
import * as path from 'path';

export const { recover: recoverPublicBriefs } = createBriefRecovery({
  enabled: () => isTopicBriefPublishingEnabled(app.getPath('userData')),
  read: () => readBoardFile(path.join(app.getPath('userData'), 'topic-briefs', 'latest.json')),
  generate: async due => {
    const { runManagedLocalBriefs } = await import('./handlers/topic-briefs-local');
    return runManagedLocalBriefs({ round: { day: due.day, slot: due.slot as '아침' | '오후' | '저녁' } });
  },
  publish: raw => publishAppBriefs(raw, { enabled: isTopicBriefPublishingEnabled(app.getPath('userData')) }),
});
