import { MobileLiveGoldenRadar } from '../../mobile/live-golden-radar';
import { MobileNotificationInbox } from '../../mobile/notification-inbox';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
}

const radar = new MobileLiveGoldenRadar({
  notificationInbox: new MobileNotificationInbox(),
  refreshBoardFileOnSnapshot: true,
  getEnvConfig: () => ({
    naverSearchAdAccessLicense: 'primary-access-license-value',
    naverSearchAdSecretKey: 'primary-secret-key-value',
    naverSearchAdCustomerId: '1000001',
  }),
  searchAdQuotaState: () => ({
    exhausted: false,
    calls: 22_006,
    remaining: 65_994,
    softCeiling: 88_000,
    dailyLimit: 100_000,
    resetAtMs: Date.parse('2026-07-12T15:00:00.000Z'),
    accountCount: 4,
    availableAccountCount: 3,
    accounts: [
      { customerIdMasked: '***2868', calls: 22_006, remaining: 0, exhausted: true },
      { customerIdMasked: '***2591', calls: 0, remaining: 22_000, exhausted: false },
      { customerIdMasked: '***2592', calls: 0, remaining: 22_000, exhausted: false },
      { customerIdMasked: '***2594', calls: 0, remaining: 22_000, exhausted: false },
    ],
  }),
});

const snapshot = radar.start();
assert('read-only API snapshot exposes masked multi-account quota readiness without running the hunter',
  snapshot.searchAdQuota?.accountCount === 4
    && snapshot.searchAdQuota.availableAccountCount === 3
    && snapshot.searchAdQuota.accounts?.length === 4
    && snapshot.searchAdQuota.accounts.every((item) => /^\*\*\*\d{4}$/.test(item.customerIdMasked)),
  JSON.stringify(snapshot.searchAdQuota));
radar.stop();

console.log('[live-golden-searchad-pool-health.test] passed');
process.exit(0);

export {};
