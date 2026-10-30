/**
 * Phase D flows on the REAL route tree and screens. The keystore is pre-seeded (signed in); the network layer
 * and the native notification scheduling are mocked. Nothing here proves a reminder fires on a real phone.
 */
import path from 'path';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import { medicinesApi } from '@/api/medicines';
import { disableReminders, enableReminders, syncMedicineReminders } from '@/notifications/medicineReminders';
import { ADHERENCE_NONE, ADHERENCE_OVERALL, dayOffset, entry, MED_AS_NEEDED, MED_DAILY, MED_PAUSED, USER } from '@/test-utils/fixtures';
import { todayIso } from '@/utils/medicineForm';

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
jest.mock('@/api/medicines', () => ({
  medicinesApi: {
    list: jest.fn(), today: jest.fn(), overallAdherence: jest.fn(), get: jest.fn(), schedule: jest.fn(), adherence: jest.fn(),
    create: jest.fn(), update: jest.fn(), remove: jest.fn(), markTaken: jest.fn(), markSkipped: jest.fn(),
  },
}));
jest.mock('@/notifications/medicineReminders', () => ({
  configureNotifications: jest.fn(async () => undefined),
  syncMedicineReminders: jest.fn(async () => ({ status: 'disabled', scheduled: 0 })),
  getReminderPermission: jest.fn(async () => 'undetermined'),
  requestReminderPermission: jest.fn(async () => 'granted'),
  enableReminders: jest.fn(async () => 'granted'),
  disableReminders: jest.fn(async () => undefined),
  cancelMedicineReminders: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const keystore: Map<string, string> = require('expo-secure-store').__store;
const APP_DIR = path.resolve(__dirname, '../app');
const auth = authApi as jest.Mocked<typeof authApi>;
const med = medicinesApi as jest.Mocked<typeof medicinesApi>;
const sync = syncMedicineReminders as jest.Mock;

let app: ReturnType<typeof renderRouter>;
const pathname = () => app.getPathname();
async function open(url: string) {
  app = renderRouter(APP_DIR, { initialUrl: url });
  await act(async () => {});
  return app;
}
const confirmAlerts = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });

beforeEach(() => {
  jest.clearAllMocks();
  keystore.clear();
  keystore.set('hp.refresh_token', 'r');
  keystore.set('hp.access_token', 'a');
  keystore.set('hp.access_expires_at', String(Date.now() + 600_000));
  auth.me.mockResolvedValue(USER);
  med.list.mockResolvedValue([MED_DAILY]);
  med.today.mockResolvedValue([]);
  med.overallAdherence.mockResolvedValue(ADHERENCE_NONE);
  med.get.mockResolvedValue(MED_DAILY);
  med.schedule.mockResolvedValue([]);
  med.adherence.mockResolvedValue(ADHERENCE_OVERALL);
});

describe('Medicines tab', () => {
  it('invites the first medicine when there are none, and opens the form', async () => {
    med.list.mockResolvedValue([]);
    await open('/medicines');
    expect(await screen.findByText('No medicines yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add your first medicine'));
    await waitFor(() => expect(pathname()).toBe('/medicines/new'));
  });

  it("lists today's doses, medicines (with paused marked) and the real adherence numbers", async () => {
    med.list.mockResolvedValue([MED_DAILY, MED_PAUSED]);
    med.today.mockResolvedValue([entry({ id: 11 }), entry({ id: 12, scheduled_time: '20:00:00', is_taken: true })]);
    med.overallAdherence.mockResolvedValue(ADHERENCE_OVERALL);
    await open('/medicines');

    expect(await screen.findByLabelText('Adherence 75 percent')).toBeTruthy();
    expect(screen.getByLabelText('Taken: 9')).toBeTruthy();
    expect(screen.getByLabelText('Missed: 2')).toBeTruthy();
    expect(screen.getByLabelText('Scheduled: 12')).toBeTruthy();
    expect(screen.getAllByText('Metformin').length).toBeGreaterThan(0);
    expect(screen.getByText('Vitamin D')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getAllByText(/Daily at 08:00, 20:00/).length).toBe(2); // one per medicine in the list
  });

  it('shows no adherence figure (not 0%) when nothing has been scheduled yet', async () => {
    await open('/medicines');
    expect(await screen.findByText("Today's doses")).toBeTruthy();
    expect(screen.queryByLabelText(/Adherence \d+ percent/)).toBeNull();
    expect(screen.getByText('No doses are scheduled for today.')).toBeTruthy();
  });

  it('logging a dose as taken calls the API, refreshes the list and re-syncs reminders', async () => {
    med.today.mockResolvedValue([entry({ id: 11 })]);
    med.markTaken.mockResolvedValue(entry({ id: 11, is_taken: true }));
    await open('/medicines');
    fireEvent.press(await screen.findByLabelText('Taken'));
    await waitFor(() => expect(med.markTaken).toHaveBeenCalledWith(3, 11));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(USER.id));
    await waitFor(() => expect(med.today.mock.calls.length).toBeGreaterThan(1)); // refetched
  });

  it('skipping calls the skip endpoint; a failure is shown instead of pretending it worked', async () => {
    med.today.mockResolvedValue([entry({ id: 11 })]);
    med.markSkipped.mockRejectedValue(new ApiError('server', 'Something went wrong on our side.', 500));
    await open('/medicines');
    fireEvent.press(await screen.findByLabelText('Skip'));
    expect(await screen.findByText('Something went wrong on our side.')).toBeTruthy();
    expect(med.markSkipped).toHaveBeenCalledWith(3, 11);
  });

  it('shows a retryable error when the server is unreachable', async () => {
    med.list.mockRejectedValueOnce(new ApiError('network', "Can't reach the server."));
    await open('/medicines');
    expect(await screen.findByText("Can't connect")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByText("Today's doses")).toBeTruthy();
  });
});

describe('Add medicine', () => {
  it('blocks a missing name locally', async () => {
    await open('/medicines/new');
    fireEvent.press(screen.getByLabelText('Add medicine'));
    expect(await screen.findByText('Enter the medicine name')).toBeTruthy();
    expect(med.create).not.toHaveBeenCalled();
  });

  it('creates a daily medicine with the entered details and opens it', async () => {
    med.create.mockResolvedValue({ ...MED_DAILY, id: 7 });
    med.get.mockResolvedValue({ ...MED_DAILY, id: 7 });
    await open('/medicines/new');
    fireEvent.changeText(screen.getByLabelText('Medicine name'), 'Metformin');
    fireEvent.changeText(screen.getByLabelText('Dosage (optional)'), '500');
    fireEvent.press(screen.getByLabelText('mg'));
    fireEvent.press(screen.getByLabelText('Use Evening 20:00'));
    fireEvent.press(screen.getByLabelText('Add medicine'));

    await waitFor(() => expect(pathname()).toBe('/medicines/7'));
    expect(med.create).toHaveBeenCalledWith({
      medicine_name: 'Metformin', dosage: 500, dosage_unit: 'mg', form: 'TABLET', frequency_unit: 'DAILY',
      time_of_day: ['08:00', '20:00'], start_date: todayIso(),
    });
    expect(sync).toHaveBeenCalledWith(USER.id);
  });

  it('weekly medicines take a single time and explain the cadence', async () => {
    med.create.mockResolvedValue({ ...MED_DAILY, id: 8 });
    await open('/medicines/new');
    fireEvent.changeText(screen.getByLabelText('Medicine name'), 'Alendronate');
    fireEvent.press(screen.getByLabelText('Weekly'));
    expect(screen.getByText(/same weekday as the start date/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Use Evening 20:00')); // replaces, since weekly allows one time
    fireEvent.press(screen.getByLabelText('Add medicine'));
    await waitFor(() => expect(med.create).toHaveBeenCalled());
    expect(med.create.mock.calls[0][0]).toMatchObject({ frequency_unit: 'WEEKLY', time_of_day: ['20:00'] });
  });

  it('as-needed medicines hide the time controls and send no times', async () => {
    med.create.mockResolvedValue({ ...MED_AS_NEEDED, id: 9 });
    await open('/medicines/new');
    fireEvent.changeText(screen.getByLabelText('Medicine name'), 'Ibuprofen');
    fireEvent.press(screen.getByLabelText('As needed'));
    expect(screen.queryByLabelText('Time 1')).toBeNull();
    fireEvent.press(screen.getByLabelText('Add medicine'));
    await waitFor(() => expect(med.create).toHaveBeenCalled());
    expect(med.create.mock.calls[0][0]).toMatchObject({ frequency_unit: 'AS_NEEDED', time_of_day: [] });
  });

  it("shows the backend's field message next to the time input", async () => {
    med.create.mockRejectedValue(new ApiError('validation', 'Validation failed', 422, { time_of_day: "'8am' is not a valid 24-hour HH:MM time" }));
    await open('/medicines/new');
    fireEvent.changeText(screen.getByLabelText('Medicine name'), 'X');
    fireEvent.press(screen.getByLabelText('Add medicine'));
    expect(await screen.findByText("'8am' is not a valid 24-hour HH:MM time")).toBeTruthy();
    expect(pathname()).toBe('/medicines/new');
  });
});

describe('Medicine details', () => {
  const schedule = [
    entry({ id: 21, scheduled_date: dayOffset(-1) }),
    entry({ id: 22, scheduled_date: todayIso(), scheduled_time: '20:00:00' }),
    entry({ id: 23, scheduled_date: dayOffset(1) }),
  ];

  it('shows details, real adherence counts, and a schedule with honest statuses', async () => {
    med.schedule.mockResolvedValue(schedule);
    await open('/medicines/3');
    expect(await screen.findByText('Take with food')).toBeTruthy();
    expect(screen.getByText('500 mg · Tablet')).toBeTruthy();
    expect(screen.getByLabelText('Adherence 75 percent')).toBeTruthy();
    expect(med.adherence).toHaveBeenCalledWith(3, 30);
    expect(screen.getByLabelText('Status: Missed')).toBeTruthy();
    expect(screen.getByLabelText('Status: Pending')).toBeTruthy();
    expect(screen.getByLabelText('Status: Upcoming')).toBeTruthy();
    // past and today can be logged; a future dose cannot
    expect(screen.getAllByLabelText('Taken')).toHaveLength(2);
  });

  it('refetches adherence for another period', async () => {
    await open('/medicines/3');
    await screen.findByLabelText('Adherence 75 percent');
    fireEvent.press(screen.getByLabelText('7 days'));
    await waitFor(() => expect(med.adherence).toHaveBeenCalledWith(3, 7));
  });

  it('logging a past dose updates it via the API', async () => {
    med.schedule.mockResolvedValue([schedule[0]]);
    med.markTaken.mockResolvedValue({ ...schedule[0], is_taken: true });
    await open('/medicines/3');
    fireEvent.press(await screen.findByLabelText('Taken'));
    await waitFor(() => expect(med.markTaken).toHaveBeenCalledWith(3, 21));
  });

  it('pauses via is_active and re-syncs reminders; a paused medicine explains what that means', async () => {
    med.update.mockResolvedValue({ ...MED_DAILY, is_active: false });
    await open('/medicines/3');
    fireEvent.press(await screen.findByLabelText('Pause'));
    await waitFor(() => expect(med.update).toHaveBeenCalledWith(3, { is_active: false }));
    await waitFor(() => expect(sync).toHaveBeenCalledWith(USER.id));
  });

  it('a paused medicine shows the explanation and offers Resume', async () => {
    med.get.mockResolvedValue(MED_PAUSED);
    await open('/medicines/4');
    expect(await screen.findByText(/left out of today's doses and your overall adherence/i)).toBeTruthy();
    expect(screen.getByLabelText('Resume')).toBeTruthy();
  });

  it('as-needed medicines say there is no schedule or adherence, instead of showing empty numbers', async () => {
    med.get.mockResolvedValue(MED_AS_NEEDED);
    await open('/medicines/5');
    expect(await screen.findByText(/no scheduled doses, so there are no reminders or adherence/i)).toBeTruthy();
    expect(screen.queryByText('Schedule')).toBeNull();
    expect(med.adherence).not.toHaveBeenCalled();
  });

  it('delete asks for confirmation, deletes, re-syncs reminders and returns to the list', async () => {
    const alert = confirmAlerts();
    med.remove.mockResolvedValue(undefined);
    await open('/medicines/3');
    fireEvent.press(await screen.findByLabelText('Delete medicine'));
    expect(alert.mock.calls[0][0]).toBe('Delete Metformin?');
    await waitFor(() => expect(med.remove).toHaveBeenCalledWith(3));
    await waitFor(() => expect(pathname()).toBe('/medicines'));
    expect(sync).toHaveBeenCalledWith(USER.id);
  });

  it('Edit opens the edit screen', async () => {
    await open('/medicines/3');
    fireEvent.press(await screen.findByLabelText('Edit'));
    await waitFor(() => expect(pathname()).toBe('/medicines/edit/3'));
  });
});

describe('Edit medicine', () => {
  it('sends only what changed, and the start date is read-only', async () => {
    med.update.mockResolvedValue({ ...MED_DAILY, dosage: 250 });
    await open('/medicines/edit/3');
    const dosage = await screen.findByLabelText('Dosage (optional)');
    expect(dosage.props.value).toBe('500');
    expect(screen.getByLabelText('Start date').props.editable).toBe(false);
    fireEvent.changeText(dosage, '250');
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(med.update).toHaveBeenCalledWith(3, { dosage: 250 }));
  });

  it('does not call the API when nothing changed', async () => {
    await open('/medicines/edit/3');
    fireEvent.press(await screen.findByLabelText('Save changes'));
    await act(async () => {});
    expect(med.update).not.toHaveBeenCalled();
  });
});

describe('Dose reminders', () => {
  it('turning reminders on asks for permission through enableReminders for this user', async () => {
    await open('/medicines');
    const sw = await screen.findByLabelText('Dose reminders');
    await act(async () => {
      fireEvent(sw, 'valueChange', true);
    });
    expect(enableReminders).toHaveBeenCalledWith(USER.id);
  });

  it('when the OS blocks notifications it says so and offers phone settings (never a silent "on")', async () => {
    (enableReminders as jest.Mock).mockResolvedValueOnce('denied');
    await open('/medicines');
    const sw = await screen.findByLabelText('Dose reminders');
    await act(async () => {
      fireEvent(sw, 'valueChange', true);
    });
    expect(await screen.findByText(/turned off for HealthPredict on this phone/i)).toBeTruthy();
    expect(screen.getByLabelText('Open phone settings')).toBeTruthy();
    expect(sw.props.value).toBe(false);
  });

  it('turning reminders off cancels them', async () => {
    keystore.set(`hp.medicine_reminders.${USER.id}`, '1');
    const mocked = jest.requireMock('@/notifications/medicineReminders') as { getReminderPermission: jest.Mock };
    mocked.getReminderPermission.mockResolvedValue('granted');
    await open('/medicines');
    const sw = await screen.findByLabelText('Dose reminders');
    await waitFor(() => expect(screen.getByLabelText('Dose reminders').props.value).toBe(true));
    await act(async () => {
      fireEvent(sw, 'valueChange', false);
    });
    expect(disableReminders).toHaveBeenCalledWith(USER.id);
    mocked.getReminderPermission.mockResolvedValue('undetermined');
  });

  it('tapping a reminder while the app is running opens that medicine', async () => {
    await open('/medicines');
    await screen.findByText("Today's doses");
    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)![0];
    await act(async () => {
      listener({ notification: { request: { identifier: 'tap-1', content: { data: { kind: 'medicine-reminder', medicineId: 3 } } } } });
    });
    await waitFor(() => expect(pathname()).toBe('/medicines/3'));
  });

  it('a notification that is not ours is ignored', async () => {
    await open('/medicines');
    await screen.findByText("Today's doses");
    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)![0];
    await act(async () => {
      listener({ notification: { request: { identifier: 'tap-2', content: { data: { kind: 'something-else', medicineId: 3 } } } } });
    });
    expect(pathname()).toBe('/medicines');
  });

  it('launching the app from a reminder opens that medicine', async () => {
    (Notifications.getLastNotificationResponse as jest.Mock).mockReturnValueOnce({
      notification: { request: { identifier: 'cold-1', content: { data: { kind: 'medicine-reminder', medicineId: 3 } } } },
    });
    await open('/home');
    await waitFor(() => expect(pathname()).toBe('/medicines/3'));
  });
});
