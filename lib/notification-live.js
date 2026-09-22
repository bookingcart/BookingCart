'use strict';

const clients = new Set();

/**
 * Subscribe a client connection (res object or handler callback).
 * @param {Function} listener - Function(eventData) called when notification is published.
 * @returns {Function} unsubscribe function
 */
function subscribe(listener) {
  clients.add(listener);
  return () => {
    clients.delete(listener);
  };
}

/**
 * Publish a notification to subscribed SSE clients.
 * Optional filter by recipientId / recipientRole.
 * @param {Object} notification
 */
function publish(notification) {
  for (const listener of clients) {
    try {
      listener(notification);
    } catch (err) {
      console.error('[NotificationLive] Listener error:', err);
    }
  }
}

module.exports = {
  subscribe,
  publish,
  getActiveCount: () => clients.size
};
