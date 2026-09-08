'use strict';

const notificationHub = require('../lib/notification-hub');
const liveBus = require('../lib/notification-live');
const { applyCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // Parse path: /api/notifications, /api/notifications/stream, /api/notifications/:id/read, /api/notifications/preferences, etc.
  const pathParts = pathname.split('/').filter(Boolean);

  // GET /api/notifications/stream - Server-Sent Events real-time stream
  if (method === 'GET' && pathname === '/api/notifications/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write('retry: 5000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const recipientId = url.searchParams.get('recipientId') || 'guest';
    const recipientRole = url.searchParams.get('role') || 'user';

    const unsubscribe = liveBus.subscribe((notification) => {
      // Check if notification is meant for this client
      if (
        notification.recipientId === recipientId ||
        (recipientRole === 'admin' && notification.recipientRole === 'admin') ||
        recipientId === 'admin'
      ) {
        res.write(`data: ${JSON.stringify(notification)}\n\n`);
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
    return;
  }

  // GET /api/notifications - List notifications for user
  if (method === 'GET' && pathname === '/api/notifications') {
    const recipientId = url.searchParams.get('recipientId') || 'guide-1';
    const recipientRole = url.searchParams.get('role') || 'guide';

    const notifs = notificationHub.getNotificationsForUser(recipientId, recipientRole);
    const unreadCount = notifs.filter((n) => !n.read).length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      notifications: notifs,
      unreadCount
    }));
    return;
  }

  // GET /api/notifications/preferences
  if (method === 'GET' && pathname === '/api/notifications/preferences') {
    const recipientId = url.searchParams.get('recipientId') || 'guide-1';
    const prefs = notificationHub.getPreferences(recipientId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      preferences: prefs
    }));
    return;
  }

  // PUT /api/notifications/preferences - Update user preferences
  if ((method === 'PUT' || method === 'POST') && pathname === '/api/notifications/preferences') {
    let bodyStr = '';
    req.on('data', (chunk) => { bodyStr += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const recipientId = body.recipientId || url.searchParams.get('recipientId') || 'guide-1';
        const updated = notificationHub.updatePreferences(recipientId, body.preferences || body);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          preferences: updated
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // PUT /api/notifications/read-all - Mark all read
  if ((method === 'PUT' || method === 'POST') && pathname === '/api/notifications/read-all') {
    let bodyStr = '';
    req.on('data', (chunk) => { bodyStr += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const recipientId = body.recipientId || url.searchParams.get('recipientId') || 'guide-1';
        const recipientRole = body.recipientRole || url.searchParams.get('role') || 'guide';

        const result = notificationHub.markAllAsRead(recipientId, recipientRole);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'All notifications marked as read',
          ...result
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // PUT /api/notifications/:id/read - Mark single notification read
  if ((method === 'PUT' || method === 'POST') && pathParts.length >= 3 && pathParts[2].endsWith('read')) {
    const notificationId = pathParts[2].replace('/read', '');
    const updated = notificationHub.markAsRead(notificationId);

    if (updated) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, notification: updated }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Notification not found' }));
    }
    return;
  }

  // POST /api/notifications/dispatch - Test or admin manual notification trigger
  if (method === 'POST' && pathname === '/api/notifications/dispatch') {
    let bodyStr = '';
    req.on('data', (chunk) => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr || '{}');
        const dispatched = await notificationHub.dispatch(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, notification: dispatched }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
};
