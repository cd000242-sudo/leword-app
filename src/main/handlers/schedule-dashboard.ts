// 스케줄 & 대시보드 핸들러
import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';


export function setupScheduleDashboardHandlers(): void {
  ipcMain.handle('get-schedules', async () => {
    // TODO: 데이터베이스에서 스케줄 가져오기
    return [];
  });

  ipcMain.handle('add-schedule', async (_event, _schedule: { name: string; time: string }) => {
    // TODO: 데이터베이스에 스케줄 저장
    return { success: true, id: Date.now().toString() };
  });

  ipcMain.handle('toggle-schedule', async (_event, _id: string, _enabled: boolean) => {
    // TODO: 데이터베이스에서 스케줄 활성화/비활성화
    return { success: true };
  });

  ipcMain.handle('get-keyword-schedules', async () => {
    try {
      const scheduleManager = require('../../core/schedule-manager').getScheduleManager();
      const schedules = scheduleManager.getAllSchedules();

      // 키워드 관련 스케줄만 필터링
      const keywordSchedules = schedules.filter((s: any) =>
        s.topic && s.keywords && s.keywords.length > 0
      );

      return keywordSchedules.map((s: any) => ({
        id: s.id,
        keyword: s.keywords[0] || s.topic,
        topic: s.topic,
        keywords: s.keywords,
        scheduleDateTime: s.scheduleDateTime,
        status: s.status,
        platform: s.platform,
        createdAt: s.createdAt
      }));
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 스케줄 조회 실패:', error);
      return [];
    }
  });

  ipcMain.handle('add-keyword-schedule', async (_event, scheduleData: any) => {
    try {
      const scheduleManager = require('../../core/schedule-manager').getScheduleManager();
      const id = scheduleManager.addSchedule({
        topic: scheduleData.topic || scheduleData.keyword,
        keywords: scheduleData.keywords || [scheduleData.keyword],
        platform: scheduleData.platform || 'blogger',
        publishType: scheduleData.publishType || 'schedule',
        scheduleDateTime: scheduleData.scheduleDateTime,
        payload: scheduleData
      });
      return { success: true, id };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 스케줄 추가 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('toggle-keyword-schedule', async (_event, id: string, enabled: boolean) => {
    try {
      const scheduleManager = require('../../core/schedule-manager').getScheduleManager();
      const success = scheduleManager.updateSchedule(id, {
        status: enabled ? 'pending' : 'cancelled'
      });
      return { success };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 스케줄 토글 실패:', error);
      return { success: false, error: error.message };
    }
  });

  // 실시간 알림 관리
  const notificationsPath = path.join(app.getPath('userData'), 'keyword-notifications.json');

  ipcMain.handle('get-notifications', async () => {
    try {
      if (fs.existsSync(notificationsPath)) {
        const data = fs.readFileSync(notificationsPath, 'utf8');
        return JSON.parse(data);
      }
      return { enabled: false, keywords: [], settings: {} };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 알림 조회 실패:', error);
      return { enabled: false, keywords: [], settings: {} };
    }
  });

  ipcMain.handle('save-notification-settings', async (_event, settings: any) => {
    try {
      fs.writeFileSync(notificationsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 알림 설정 저장 실패:', error);
      return { success: false, error: error.message };
    }
  });

  // 대시보드 통계
  ipcMain.handle('get-dashboard-stats', async () => {
    try {
      const scheduleManager = require('../../core/schedule-manager').getScheduleManager();
      const stats = scheduleManager.getStats();

      // 최근 키워드 분석 기록
      const keywordHistoryPath = path.join(app.getPath('userData'), 'keyword-history.json');
      let keywordHistory: any[] = [];
      if (fs.existsSync(keywordHistoryPath)) {
        try {
          keywordHistory = JSON.parse(fs.readFileSync(keywordHistoryPath, 'utf8'));
        } catch (e) {
          // 파일이 손상되었을 수 있음
        }
      }

      // 트렌드 키워드 조회 이력
      const recentTrendQueries = keywordHistory
        .filter((h: any) => h.type === 'trend')
        .slice(-10)
        .reverse();

      // 황금 키워드 발굴 이력
      const recentGoldenQueries = keywordHistory
        .filter((h: any) => h.type === 'golden')
        .slice(-10)
        .reverse();

      return {
        schedules: {
          total: stats.total,
          pending: stats.pending,
          completed: stats.completed,
          failed: stats.failed
        },
        keywords: {
          totalAnalyzed: keywordHistory.length,
          recentTrendQueries: recentTrendQueries.length,
          recentGoldenQueries: recentGoldenQueries.length
        },
        recentActivity: {
          trends: recentTrendQueries,
          golden: recentGoldenQueries
        }
      };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 대시보드 통계 조회 실패:', error);
      return {
        schedules: { total: 0, pending: 0, completed: 0, failed: 0 },
        keywords: { totalAnalyzed: 0, recentTrendQueries: 0, recentGoldenQueries: 0 },
        recentActivity: { trends: [], golden: [] }
      };
    }
  });

  // 키워드 그룹 관리
  const keywordGroupsPath = path.join(app.getPath('userData'), 'keyword-groups.json');

  ipcMain.handle('get-keyword-groups', async () => {
    try {
      if (fs.existsSync(keywordGroupsPath)) {
        const data = fs.readFileSync(keywordGroupsPath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 키워드 그룹 조회 실패:', error);
      return [];
    }
  });

  ipcMain.handle('add-keyword-group', async (_event, group: any) => {
    try {
      let groups: any[] = [];
      if (fs.existsSync(keywordGroupsPath)) {
        groups = JSON.parse(fs.readFileSync(keywordGroupsPath, 'utf8'));
      }

      const newGroup = {
        id: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: group.name,
        keywords: group.keywords || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      groups.push(newGroup);
      fs.writeFileSync(keywordGroupsPath, JSON.stringify(groups, null, 2));

      return { success: true, group: newGroup };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 키워드 그룹 추가 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('update-keyword-group', async (_event, id: string, updates: any) => {
    try {
      let groups: any[] = [];
      if (fs.existsSync(keywordGroupsPath)) {
        groups = JSON.parse(fs.readFileSync(keywordGroupsPath, 'utf8'));
      }

      const index = groups.findIndex((g: any) => g.id === id);
      if (index === -1) {
        return { success: false, error: '그룹을 찾을 수 없습니다' };
      }

      groups[index] = {
        ...groups[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(keywordGroupsPath, JSON.stringify(groups, null, 2));
      return { success: true, group: groups[index] };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 키워드 그룹 업데이트 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('delete-keyword-group', async (_event, id: string) => {
    try {
      let groups: any[] = [];
      if (fs.existsSync(keywordGroupsPath)) {
        groups = JSON.parse(fs.readFileSync(keywordGroupsPath, 'utf8'));
      }

      groups = groups.filter((g: any) => g.id !== id);
      fs.writeFileSync(keywordGroupsPath, JSON.stringify(groups, null, 2));

      return { success: true };
    } catch (error: any) {
      console.error('[KEYWORD-MASTER] 키워드 그룹 삭제 실패:', error);
      return { success: false, error: error.message };
    }
  });
}
