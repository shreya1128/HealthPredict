// HealthPredict Web Push Service Worker
// Handles push notifications, background events, and dose action buttons ('Taken', 'Snooze 10 min')

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    payload = {
      title: 'HealthPredict Alert',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'HealthPredict Notification';
  const options = {
    body: payload.body || 'You have a new healthcare update.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag || 'healthpredict-alert',
    renotify: true,
    data: payload.data || {},
    actions: [
      { action: 'taken', title: 'Taken' },
      { action: 'snooze', title: 'Snooze 10m' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'taken') {
    // User clicked 'Taken' on the dose notification
    const scheduleId = data.scheduleId;
    if (scheduleId) {
      event.waitUntil(
        fetch(`/api/medicines/schedule/${scheduleId}/take`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        }).catch((err) => console.warn('Failed to log dose from push notification:', err))
      );
    }
    return;
  }

  if (action === 'snooze') {
    // User clicked 'Snooze 10m'
    const notificationId = data.notificationId;
    if (notificationId) {
      event.waitUntil(
        fetch(`/api/notifications/${notificationId}/snooze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minutes: 10 }),
          credentials: 'include',
        }).catch((err) => console.warn('Failed to snooze from push notification:', err))
      );
    }
    return;
  }

  // Default click: open or focus app window
  const targetUrl = data.url || '/notifications';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
