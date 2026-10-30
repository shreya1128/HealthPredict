// Native notification APIs do not exist in Jest; tests that care about them replace this with their own mock.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied', canAskAgain: false })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
}));

jest.mock('@/api/notifications', () => ({
  notificationsApi: {
    list: jest.fn(async () => ({ items: [], total: 0, unread: 0, page: 1, page_size: 20 })),
    unreadCount: jest.fn(async () => 0),
    refresh: jest.fn(async () => 0),
    markRead: jest.fn(),
    markAllRead: jest.fn(async () => 0),
  },
}));
