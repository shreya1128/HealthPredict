/** The scheduling module against a MOCKED notification API. This proves our orchestration, not that a phone shows anything. */
import * as Notifications from 'expo-notifications';

import { getReminderPermission } from '@/notifications/medicineReminders';
import { DEFAULT_WELLNESS_PREFS, WELLNESS_KIND } from '@/notifications/wellnessPlan';
import { cancelWellnessReminders, saveWellnessPrefs, syncWellnessReminders } from '@/notifications/wellnessReminders';
import { getWellnessPrefs } from '@/storage/flags';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});
jest.mock('@/notifications/medicineReminders', () => ({ getReminderPermission: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const N = Notifications as unknown as Record<string, jest.Mock>;
const permission = getReminderPermission as jest.Mock;
const USER = 7;

const scheduled = (kind: string, id: string) => ({ identifier: id, content: { data: { kind } } });

beforeEach(() => {
  jest.clearAllMocks();
  keystore.clear();
  permission.mockResolvedValue('granted');
  N.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  N.scheduleNotificationAsync.mockResolvedValue('id');
});

describe('cancelWellnessReminders', () => {
  it('cancels ONLY wellness reminders and leaves medicine reminders and anything else alone', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([
      scheduled(WELLNESS_KIND, 'w1'), scheduled('medicine-reminder', 'm1'), scheduled(WELLNESS_KIND, 'w2'), { identifier: 'x', content: { data: null } },
    ]);
    await cancelWellnessReminders();
    expect(N.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]).sort()).toEqual(['w1', 'w2']);
  });
});

describe('syncWellnessReminders', () => {
  it('with everything off it schedules nothing and clears old wellness reminders', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([scheduled(WELLNESS_KIND, 'old'), scheduled('medicine-reminder', 'm1')]);
    expect(await syncWellnessReminders(USER)).toEqual({ status: 'disabled', scheduled: 0 });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(N.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['old']);
  });

  it('schedules repeating DAILY triggers at the planned times, tagged so they can be told apart later', async () => {
    await saveWellnessPrefs(USER, { ...DEFAULT_WELLNESS_PREFS, hydration: { ...DEFAULT_WELLNESS_PREFS.hydration, enabled: true } });
    const calls = N.scheduleNotificationAsync.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(5);
    expect(calls.map((c) => [c.trigger.hour, c.trigger.minute])).toEqual([[9, 0], [12, 0], [15, 0], [18, 0], [21, 0]]);
    for (const c of calls) {
      expect(c.trigger.type).toBe('daily');
      expect(c.trigger.channelId).toBe('wellness-reminders');
      expect(c.content.data).toEqual({ kind: WELLNESS_KIND, wellness: 'hydration' });
    }
  });

  it('replaces the previous wellness reminders instead of stacking duplicates', async () => {
    N.getAllScheduledNotificationsAsync.mockResolvedValue([scheduled(WELLNESS_KIND, 'old1'), scheduled(WELLNESS_KIND, 'old2')]);
    await saveWellnessPrefs(USER, { ...DEFAULT_WELLNESS_PREFS, sleep: { enabled: true, hour: 22, minute: 30 } });
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(N.cancelScheduledNotificationAsync.mock.invocationCallOrder[1]).toBeLessThan(N.scheduleNotificationAsync.mock.invocationCallOrder[0]);
  });

  it('schedules nothing, and clears wellness reminders, when the OS has notifications blocked', async () => {
    permission.mockResolvedValue('denied');
    N.getAllScheduledNotificationsAsync.mockResolvedValue([scheduled(WELLNESS_KIND, 'old')]);
    const result = await saveWellnessPrefs(USER, { ...DEFAULT_WELLNESS_PREFS, sleep: { enabled: true, hour: 22, minute: 0 } });
    expect(result).toEqual({ status: 'no-permission', scheduled: 0 });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old');
  });

  it('combines hydration and bedtime', async () => {
    const r = await saveWellnessPrefs(USER, { hydration: { ...DEFAULT_WELLNESS_PREFS.hydration, enabled: true }, sleep: { enabled: true, hour: 22, minute: 0 } });
    expect(r).toEqual({ status: 'ok', scheduled: 6 });
  });

  it('treats corrupt stored preferences as "off" rather than scheduling something unexpected', async () => {
    keystore.set(`hp.wellness_reminders.${USER}`, '{not json');
    expect(await getWellnessPrefs(USER)).toEqual(DEFAULT_WELLNESS_PREFS);
    expect(await syncWellnessReminders(USER)).toEqual({ status: 'disabled', scheduled: 0 });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('remembers choices per user', async () => {
    await saveWellnessPrefs(1, { ...DEFAULT_WELLNESS_PREFS, sleep: { enabled: true, hour: 21, minute: 0 } });
    expect((await getWellnessPrefs(1)).sleep.enabled).toBe(true);
    expect((await getWellnessPrefs(2)).sleep.enabled).toBe(false);
  });

  it('runs overlapping syncs strictly one after another so they cannot interleave and leave duplicates', async () => {
    await saveWellnessPrefs(USER, { ...DEFAULT_WELLNESS_PREFS, hydration: { ...DEFAULT_WELLNESS_PREFS.hydration, enabled: true } });
    jest.clearAllMocks();
    const events: string[] = [];
    N.getAllScheduledNotificationsAsync.mockImplementation(async () => {
      events.push('scan');
      await new Promise((r) => setTimeout(r, 2));
      return [];
    });
    N.scheduleNotificationAsync.mockImplementation(async () => {
      events.push('schedule');
      await new Promise((r) => setTimeout(r, 2));
      return 'id';
    });
    await Promise.all([syncWellnessReminders(USER), syncWellnessReminders(USER), syncWellnessReminders(USER)]);
    const oneRun = ['scan', 'schedule', 'schedule', 'schedule', 'schedule', 'schedule'];
    // Serialised: each run finishes before the next starts. (Interleaved runs would show three scans back to back.)
    expect(events).toEqual([...oneRun, ...oneRun, ...oneRun]);
  });
});
