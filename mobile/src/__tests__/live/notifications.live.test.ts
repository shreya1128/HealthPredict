/**
 * OPT-IN: the mobile notification layer against the REAL backend. Notifications are derived from records created
 * here through the app's own API modules; ownership is checked with a second real user.
 */
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import { healthApi } from '@/api/health';
import { medicinesApi } from '@/api/medicines';
import { notificationsApi } from '@/api/notifications';
import { reportsApi } from '@/api/reports';
import { trackingApi } from '@/api/tracking';
import { dayOffset } from '@/test-utils/fixtures';
import { notificationHref, timeAgo } from '@/utils/notificationRoute';
import { localDateIso } from '@/utils/trackingForm';

// jest.setup.js mocks this module for ordinary tests; the live test must talk to the real backend (babel-jest hoists this).
jest.unmock('@/api/notifications');
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});

const live = process.env.HP_LIVE === '1' ? describe : describe.skip;
const stamp = Date.now();
const A = `notif.a.${stamp}@example.com`;
const B = `notif.b.${stamp}@example.com`;
const PASSWORD = 'Str0ng!Pass1';

live('mobile notification layer against the real backend', () => {
  jest.setTimeout(60_000);
  let ids: number[] = [];

  beforeAll(async () => {
    for (const [email, name] of [[A, 'Notif A'], [B, 'Notif B']]) {
      await authApi.register({ email, password: PASSWORD, confirm_password: PASSWORD, full_name: name, gender: 'FEMALE' });
    }
    await authApi.login(A, PASSWORD);
  });

  it('a new user has an empty inbox and refresh invents nothing', async () => {
    expect(await notificationsApi.refresh()).toBe(0);
    const page = await notificationsApi.list();
    expect(page).toMatchObject({ items: [], total: 0, unread: 0 });
    expect(await notificationsApi.unreadCount()).toBe(0);
  });

  it('derives notifications from REAL records, each pointing at the record it is about', async () => {
    const assessment = await healthApi.createAssessment({ systolic_bp: 150, diastolic_bp: 95, heart_rate_bpm: 80 });
    await medicinesApi.create({ medicine_name: 'Metformin', form: 'TABLET', frequency_unit: 'DAILY', time_of_day: ['08:00', '20:00'], start_date: dayOffset(-2) });
    await reportsApi.weekly();
    const goal = await trackingApi.createGoal({ goal_type: 'EXERCISE', goal_description: 'Move more', target_value: 150, unit: 'minutes/week', start_date: localDateIso() });
    await trackingApi.updateGoal(goal.id, { status: 'COMPLETED' });

    expect(await notificationsApi.refresh()).toBe(4);
    const { items, unread, total } = await notificationsApi.list();
    ids = items.map((n) => n.id);
    expect(total).toBe(4);
    expect(unread).toBe(4);
    const byType = Object.fromEntries(items.map((n) => [n.notification_type, n]));
    expect(Object.keys(byType).sort()).toEqual(['ASSESSMENT_COMPLETED', 'GOAL_PROGRESS', 'MISSED_MEDICINE', 'WEEKLY_REPORT']);
    expect(byType.ASSESSMENT_COMPLETED).toMatchObject({ related_entity_type: 'ASSESSMENT', related_entity_id: assessment.id });
    expect(byType.ASSESSMENT_COMPLETED.message).toMatch(/health score is \d+/i);
    expect(byType.MISSED_MEDICINE.message).toMatch(/4 doses of Metformin/);
    expect(byType.GOAL_PROGRESS.message).toContain('Move more');
    expect(byType.WEEKLY_REPORT.related_entity_type).toBe('WEEKLY_REPORT');
  });

  it('every kind of notification the backend really produced has somewhere to go in the app', async () => {
    const { items } = await notificationsApi.list();
    for (const n of items) expect(notificationHref(n)).not.toBeNull();
    for (const n of items) expect(timeAgo(n.created_at)).toBe('just now'); // real naive-UTC timestamps parse correctly
  });

  it('refreshing again changes nothing (idempotent)', async () => {
    expect(await notificationsApi.refresh()).toBe(0);
    expect((await notificationsApi.list()).total).toBe(4);
  });

  it('read state: one, then all; read_at is set and survives a refresh', async () => {
    const marked = await notificationsApi.markRead(ids[0]);
    expect(marked.is_read).toBe(true);
    expect(marked.read_at).toBeTruthy();
    expect(await notificationsApi.unreadCount()).toBe(3);
    expect((await notificationsApi.list({ unreadOnly: true })).total).toBe(3);
    expect(await notificationsApi.markAllRead()).toBe(3);
    await notificationsApi.refresh();
    expect(await notificationsApi.unreadCount()).toBe(0);
    expect(await notificationsApi.markAllRead()).toBe(0);
  });

  it('another user cannot see or change them (404, not 403)', async () => {
    await authApi.login(B, PASSWORD);
    expect((await notificationsApi.list()).total).toBe(0);
    const err = await notificationsApi.markRead(ids[0]).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).kind).toBe('not_found');
    expect(await notificationsApi.markAllRead()).toBe(0);
    await authApi.login(A, PASSWORD);
    expect((await notificationsApi.list()).total).toBe(4);
  });

  it('validation and unknown ids surface as clean errors', async () => {
    const gone = await notificationsApi.markRead(99999999).then(() => null, (e) => e);
    expect((gone as ApiError).kind).toBe('not_found');
  });
});
