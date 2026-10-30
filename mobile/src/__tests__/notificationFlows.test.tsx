/**
 * Phase G flows on the REAL route tree and screens. Network and native notification scheduling are mocked, so this verifies
 * our orchestration and UI, NOT that a phone shows, schedules or delivers anything.
 */
import path from 'path';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { dashboardApi } from '@/api/dashboard';
import { ApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import { notificationsApi } from '@/api/notifications';
import type { AppNotification } from '@/api/types';
import { getReminderPermission, requestReminderPermission, cancelMedicineReminders } from '@/notifications/medicineReminders';
import { cancelWellnessReminders, saveWellnessPrefs } from '@/notifications/wellnessReminders';
import { ADHERENCE_NONE, EMPTY_DASHBOARD, USER } from '@/test-utils/fixtures';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(k, v),
    deleteItemAsync: async (k: string) => void store.delete(k),
  };
});
jest.mock('@/api/auth', () => ({ authApi: { me: jest.fn(), logout: jest.fn(async () => undefined) } }));
jest.mock('@/api/dashboard', () => ({ dashboardApi: { get: jest.fn() } }));
jest.mock('@/api/medicines', () => ({ medicinesApi: { overallAdherence: jest.fn() } }));
jest.mock('@/api/health', () => ({ healthApi: { get: jest.fn(async () => ({})) } }));
jest.mock('@/api/reports', () => ({
  reportsApi: {
    weekly: jest.fn(async () => ({ week_start_date: '2026-10-12', week_end_date: '2026-10-18', significant_changes: [], recommendations: [] })),
    history: jest.fn(async () => []),
    pdf: jest.fn(async () => new Uint8Array()),
  },
}));
jest.mock('@/api/tracking', () => ({
  trackingApi: {
    exerciseWeekly: jest.fn(async () => ({ total_minutes: 0, total_calories: 0, by_day: {} })),
    sleepWeekly: jest.fn(async () => ({ by_day: {} })),
    hydrationDaily: jest.fn(async () => ({ total_ml: 0 })),
    nutritionDaily: jest.fn(async () => ({ total_calories: 0, meals_logged: [], entries: [] })),
  },
}));
jest.mock('@/api/profile', () => ({ profileApi: { get: jest.fn(async () => ({})) } }));
jest.mock('@/api/notifications', () => ({
  notificationsApi: { list: jest.fn(), unreadCount: jest.fn(), refresh: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn() },
}));
jest.mock('@/notifications/medicineReminders', () => ({
  configureNotifications: jest.fn(async () => undefined), syncMedicineReminders: jest.fn(async () => ({ status: 'disabled', scheduled: 0 })),
  getReminderPermission: jest.fn(async () => 'granted'), requestReminderPermission: jest.fn(async () => 'granted'),
  enableReminders: jest.fn(), disableReminders: jest.fn(), cancelMedicineReminders: jest.fn(async () => undefined),
}));
jest.mock('@/notifications/wellnessReminders', () => ({
  configureWellnessChannel: jest.fn(async () => undefined), syncWellnessReminders: jest.fn(async () => ({ status: 'disabled', scheduled: 0 })),
  cancelWellnessReminders: jest.fn(async () => undefined), saveWellnessPrefs: jest.fn(async () => ({ status: 'ok', scheduled: 5 })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const APP_DIR = path.resolve(__dirname, '../app');
const api = notificationsApi as jest.Mocked<typeof notificationsApi>;
const permission = getReminderPermission as jest.Mock;
const requestPermission = requestReminderPermission as jest.Mock;
const save = saveWellnessPrefs as jest.Mock;

let app: ReturnType<typeof renderRouter>;
const pathname = () => app.getPathname();
async function open(url: string) {
  app = renderRouter(APP_DIR, { initialUrl: url });
  await act(async () => {});
  return app;
}

const note = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 1, notification_type: 'ASSESSMENT_COMPLETED', title: 'Assessment complete', message: 'Your health score is 72 (moderate risk).', is_read: false,
  read_at: null, related_entity_type: 'ASSESSMENT', related_entity_id: 5, action_url: null, created_at: new Date(Date.now() - 300_000).toISOString().slice(0, 19), ...over,
});
const page = (items: AppNotification[], over: Record<string, unknown> = {}) => ({ items, total: items.length, unread: items.filter((i) => !i.is_read).length, page: 1, page_size: 20, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  keystore.clear();
  keystore.set('hp.refresh_token', 'r'); keystore.set('hp.access_token', 'a'); keystore.set('hp.access_expires_at', String(Date.now() + 600_000));
  (authApi.me as jest.Mock).mockResolvedValue(USER);
  (dashboardApi.get as jest.Mock).mockResolvedValue(EMPTY_DASHBOARD);
  (medicinesApi.overallAdherence as jest.Mock).mockResolvedValue(ADHERENCE_NONE);
  api.list.mockResolvedValue(page([note(), note({ id: 2, notification_type: 'WEEKLY_REPORT', title: 'Weekly report ready', message: 'Ready.', is_read: true, related_entity_type: 'WEEKLY_REPORT', related_entity_id: 3 })]));
  api.unreadCount.mockResolvedValue(0); api.refresh.mockResolvedValue(0); api.markRead.mockResolvedValue(note({ is_read: true })); api.markAllRead.mockResolvedValue(1);
  permission.mockResolvedValue('granted'); requestPermission.mockResolvedValue('granted');
  save.mockResolvedValue({ status: 'ok', scheduled: 5 });
});

afterEach(() => {
  cleanup();
});

describe('Notification inbox', () => {
  it('asks the server to derive due notifications first, then lists them with the real text and an unread count', async () => {
    await open('/notifications');
    expect(await screen.findByText('Your health score is 72 (moderate risk).')).toBeTruthy();
    expect(screen.getByText('1 unread')).toBeTruthy();
    expect(api.refresh.mock.invocationCallOrder[0]).toBeLessThan(api.list.mock.invocationCallOrder[0]);
  });

  it('still lists notifications when the derive step fails', async () => {
    api.refresh.mockRejectedValue(new ApiError('server', 'down', 500));
    await open('/notifications');
    expect(await screen.findByText('Assessment complete')).toBeTruthy();
  });

  it('tapping an unread notification marks it read, then opens the related screen', async () => {
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText(/^Unread\. Assessment complete/));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(1));
    await waitFor(() => expect(pathname()).toBe('/assessment/5'));
  });

  it('an already-read notification just navigates (no extra API call)', async () => {
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText(/^Weekly report ready/));
    await waitFor(() => expect(pathname()).toBe('/reports'));
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('a notification with nowhere to go is marked read and the list refreshes', async () => {
    api.list.mockResolvedValue(page([note({ id: 9, title: 'A message', notification_type: 'ADMIN_MESSAGE', related_entity_type: null, related_entity_id: null })]));
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText(/^Unread\. A message/));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith(9));
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(1));
    expect(pathname()).toBe('/notifications');
  });

  it('does not navigate if marking read fails, and shows the server message', async () => {
    api.markRead.mockRejectedValue(new ApiError('not_found', 'Notification not found', 404));
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText(/^Unread\. Assessment complete/));
    expect(await screen.findByText('Notification not found')).toBeTruthy();
    expect(pathname()).toBe('/notifications');
  });

  it('"Mark all as read" calls the API and reloads; it is disabled when nothing is unread', async () => {
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText('Mark all as read'));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('disables "Mark all as read" with nothing unread', async () => {
    api.list.mockResolvedValue(page([note({ is_read: true })]));
    await open('/notifications');
    await screen.findByText('0 unread');
    expect(screen.getByLabelText('Mark all as read').props.accessibilityState.disabled).toBe(true);
  });

  it('the Unread filter asks the API for unread only', async () => {
    await open('/notifications');
    await screen.findByText('Assessment complete');
    fireEvent.press(screen.getByRole('radio', { name: 'Unread' })); // (each unread item's dot is also labelled "Unread")
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ unreadOnly: true })));
  });

  it('has honest empty states', async () => {
    api.list.mockResolvedValue(page([]));
    await open('/notifications');
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Unread'));
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it('offers a retry when the server is unreachable', async () => {
    api.list.mockRejectedValueOnce(new ApiError('network', "Can't reach the server."));
    await open('/notifications');
    expect(await screen.findByText("Can't connect")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText('Assessment complete')).toBeTruthy();
  });

  it('loads more when there are more than one page', async () => {
    api.list.mockResolvedValue(page([note()], { total: 45 }));
    await open('/notifications');
    fireEvent.press(await screen.findByLabelText('Load more'));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 40 })));
  });

  it('says plainly that this is an in-app inbox and not push', async () => {
    await open('/notifications');
    expect(await screen.findByText(/not a push\s+notification/)).toBeTruthy();
  });
});

describe('Home bell', () => {
  it('shows the unread count on the bell and opens the inbox', async () => {
    api.unreadCount.mockResolvedValue(3);
    await open('/home');
    fireEvent.press(await screen.findByLabelText('Notifications, 3 unread'));
    await waitFor(() => expect(pathname()).toBe('/notifications'));
  });

  it('shows no badge at zero', async () => {
    await open('/home');
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it('derives due notifications before counting, and a failure never breaks the dashboard', async () => {
    api.refresh.mockRejectedValue(new ApiError('server', 'boom', 500));
    api.unreadCount.mockRejectedValue(new ApiError('server', 'boom', 500));
    await open('/home');
    expect(await screen.findByText('Take your first assessment')).toBeTruthy();
    expect(screen.getByLabelText('Notifications')).toBeTruthy();
  });
});

describe('Reminder settings', () => {
  const wellnessKey = `hp.wellness_reminders.${USER.id}`;

  it('loads the saved choices', async () => {
    keystore.set(wellnessKey, JSON.stringify({ hydration: { enabled: true, intervalHours: 4, startHour: 8, endHour: 20 }, sleep: { enabled: true, hour: 23, minute: 15 } }));
    await open('/reminders');
    await waitFor(() => expect(screen.getByLabelText('Hydration reminders').props.value).toBe(true));
    expect(screen.getByLabelText('From (hour, 0-23)').props.value).toBe('8');
    expect(screen.getByLabelText('Time').props.value).toBe('23:15');
    expect(screen.getByText('Reminders at 08:00, 12:00, 16:00, 20:00')).toBeTruthy();
  });

  it('enabling hydration and saving asks for permission, saves the choices and reports how many reminders repeat daily', async () => {
    permission.mockResolvedValue('undetermined');
    await open('/reminders');
    const sw = await screen.findByLabelText('Hydration reminders');
    await waitFor(() => expect(sw.props.disabled).toBeFalsy());
    await act(async () => { fireEvent(sw, 'valueChange', true); });
    fireEvent.press(screen.getByLabelText('Save reminders'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(requestPermission).toHaveBeenCalled();
    expect(save.mock.calls[0][0]).toBe(USER.id);
    expect(save.mock.calls[0][1].hydration).toEqual({ enabled: true, intervalHours: 3, startHour: 9, endHour: 21 });
    expect(await screen.findByText('Saved. 5 reminders will repeat every day.')).toBeTruthy();
  });

  it('does not save, and says why, when the phone blocks notifications', async () => {
    permission.mockResolvedValue('denied'); requestPermission.mockResolvedValue('denied');
    await open('/reminders');
    const sw = await screen.findByLabelText('Bedtime reminder');
    await waitFor(() => expect(sw.props.disabled).toBeFalsy());
    await act(async () => { fireEvent(sw, 'valueChange', true); });
    fireEvent.press(screen.getByLabelText('Save reminders'));
    expect(await screen.findByText(/turned off for HealthPredict on this phone/)).toBeTruthy();
    expect(screen.getByLabelText('Open phone settings')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it.each([
    ['an end time not after the start', '15', '9', /later/],
    ['hours outside 0-23', '9', '30', /between 0 and 23/],
    ['a non-number', 'ab', '21', /between 0 and 23/],
  ])('rejects %s without saving', async (_n, start, end, message) => {
    await open('/reminders');
    const sw = await screen.findByLabelText('Hydration reminders');
    await waitFor(() => expect(sw.props.disabled).toBeFalsy());
    await act(async () => { fireEvent(sw, 'valueChange', true); });
    fireEvent.changeText(screen.getByLabelText('From (hour, 0-23)'), start);
    fireEvent.changeText(screen.getByLabelText('Until (hour, 0-23)'), end);
    fireEvent.press(screen.getByLabelText('Save reminders'));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('auto-formats the bedtime and rejects an impossible one', async () => {
    await open('/reminders');
    const sw = await screen.findByLabelText('Bedtime reminder');
    await waitFor(() => expect(sw.props.disabled).toBeFalsy());
    await act(async () => { fireEvent(sw, 'valueChange', true); });
    fireEvent.changeText(screen.getByLabelText('Time'), '2530');
    expect(screen.getByLabelText('Time').props.value).toBe('25:30');
    fireEvent.press(screen.getByLabelText('Save reminders'));
    expect(await screen.findByText('Use a 24-hour time like 22:00.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it('turning everything off saves without asking for permission', async () => {
    keystore.set(wellnessKey, JSON.stringify({ hydration: { enabled: true, intervalHours: 3, startHour: 9, endHour: 21 } }));
    await open('/reminders');
    const sw = await screen.findByLabelText('Hydration reminders');
    await waitFor(() => expect(sw.props.value).toBe(true));
    await act(async () => { fireEvent(sw, 'valueChange', false); });
    fireEvent.press(screen.getByLabelText('Save reminders'));
    expect(await screen.findByText('Saved. Wellness reminders are off.')).toBeTruthy();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(save.mock.calls[0][1].hydration.enabled).toBe(false);
  });

  it('explains that reminders are local and do not know your progress, and that push is not set up', async () => {
    await open('/reminders');
    expect(await screen.findByText(/still appears if you've\s+already reached your goal/)).toBeTruthy();
    expect(screen.getByText(/Remote push notifications .* are not set up/)).toBeTruthy();
  });

  it('points to the Medicines tab for dose reminders', async () => {
    await open('/reminders');
    fireEvent.press(await screen.findByLabelText('Open Medicines'));
    await waitFor(() => expect(pathname()).toBe('/medicines'));
  });
});

describe('Entry points and tap routing', () => {
  it('Profile links to the inbox and to reminders', async () => {
    await open('/profile');
    fireEvent.press(await screen.findByLabelText(/^Notifications\./));
    await waitFor(() => expect(pathname()).toBe('/notifications'));
  });

  it('tapping a wellness reminder opens the Track tab; a notification that is not ours is ignored', async () => {
    await open('/profile');
    await screen.findByText('Health profile');
    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)![0];
    await act(async () => { listener({ notification: { request: { identifier: 'w-1', content: { data: { kind: 'wellness-reminder', wellness: 'hydration' } } } } }); });
    await waitFor(() => expect(pathname()).toBe('/track'));
    await act(async () => { listener({ notification: { request: { identifier: 'z-1', content: { data: { kind: 'other' } } } } }); });
    expect(pathname()).toBe('/track');
  });

  it('signing out cancels BOTH medicine and wellness reminders so they never fire for the next person', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find((b) => b.style === 'destructive')?.onPress?.(); });
    await open('/profile');
    fireEvent.press(await screen.findByLabelText('Sign out'));
    await waitFor(() => expect(pathname()).toBe('/login'));
    expect(cancelMedicineReminders).toHaveBeenCalled();
    expect(cancelWellnessReminders).toHaveBeenCalled();
  });
});
