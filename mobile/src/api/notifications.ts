import { api } from './client';
import type { AppNotification, NotificationPage } from './types';

/** The in-app inbox. Same endpoints the web app uses. These are NOT push notifications. */
export const notificationsApi = {
  async list(params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}): Promise<NotificationPage> {
    const { data } = await api.get<NotificationPage>('/notifications', {
      params: { page: params.page ?? 1, page_size: params.pageSize ?? 20, ...(params.unreadOnly ? { unread_only: true } : {}) },
    });
    return data;
  },
  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ unread: number }>('/notifications/unread-count');
    return data.unread;
  },
  /** Asks the server to derive any due notifications from the user's real records. Idempotent. */
  async refresh(): Promise<number> {
    const { data } = await api.post<{ created: number }>('/notifications/refresh');
    return data.created;
  },
  async markRead(id: number): Promise<AppNotification> {
    const { data } = await api.post<AppNotification>(`/notifications/${id}/read`);
    return data;
  },
  async markAllRead(): Promise<number> {
    const { data } = await api.post<{ updated: number }>('/notifications/read-all');
    return data.updated;
  },
  async registerDevice(pushToken: string, platform = 'expo', deviceName?: string): Promise<void> {
    await api.post('/notifications/devices', { push_token: pushToken, platform, device_name: deviceName });
  },
  async unregisterDevice(pushToken: string): Promise<void> {
    await api.delete('/notifications/devices', { params: { push_token: pushToken } });
  },
};

