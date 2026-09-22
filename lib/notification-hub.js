'use strict';

const liveBus = require('./notification-live');
const emailTemplates = require('./email-templates');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

// In-memory store fallback
if (!global.__notifications) {
  global.__notifications = [
    {
      id: 'notif-demo-1',
      recipientId: 'guide-1',
      recipientRole: 'guide',
      type: 'BOOKING_REQUESTED',
      title: 'New Booking Request',
      message: 'Alex Johnson requested a private tour for Serengeti Safari on Oct 15.',
      read: false,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      actionUrl: '/guide/dashboard?tab=bookings',
      channels: ['inApp', 'email']
    },
    {
      id: 'notif-demo-2',
      recipientId: 'guide-1',
      recipientRole: 'guide',
      type: 'VERIFICATION_STATUS_CHANGED',
      title: 'Badge Awarded!',
      message: 'Congratulations! Your tour guide profile has been Verified by Admin.',
      read: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      actionUrl: '/guide/dashboard?tab=profile',
      channels: ['inApp']
    }
  ];
}

// User preference storage
if (!global.__notification_preferences) {
  global.__notification_preferences = {};
}

// Default preference template
const DEFAULT_PREFERENCES = {
  inApp: true,
  email: true,
  whatsapp: false,
  sms: false,
  types: {
    bookingUpdates: true,
    reminders: true,
    reviews: true,
    payouts: true,
    marketing: false
  }
};

/**
 * Get preferences for a user
 */
function getPreferences(userId) {
  if (!userId) return { ...DEFAULT_PREFERENCES };
  return global.__notification_preferences[userId] || { ...DEFAULT_PREFERENCES };
}

/**
 * Update preferences for a user
 */
function updatePreferences(userId, prefs) {
  if (!userId) return;
  const current = getPreferences(userId);
  global.__notification_preferences[userId] = {
    ...current,
    ...prefs,
    types: {
      ...current.types,
      ...(prefs.types || {})
    }
  };
  return global.__notification_preferences[userId];
}

/**
 * Transport builder for nodemailer (if SMTP env set)
 */
function createEmailTransporter() {
  if (!nodemailer) return null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return null;
}

/**
 * Send email notification
 */
async function sendEmailNotification(toEmail, subject, htmlContent) {
  if (!toEmail) return { success: false, reason: 'No email recipient' };
  try {
    const transporter = createEmailTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"BookingCart" <noreply@bookingcart.com>',
        to: toEmail,
        subject,
        html: htmlContent
      });
      console.log(`[NotificationHub] Sent email to ${toEmail}`);
      return { success: true, channel: 'email' };
    } else {
      console.log(`[NotificationHub] [MOCK EMAIL] To: ${toEmail} | Subject: ${subject}`);
      return { success: true, channel: 'email', mock: true };
    }
  } catch (err) {
    console.error('[NotificationHub] Email send error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send WhatsApp stub notification
 */
async function sendWhatsAppNotification(phone, message) {
  if (!phone) return { success: false, reason: 'No phone number' };
  console.log(`[NotificationHub] [WHATSAPP STUB] To: ${phone} | Message: ${message}`);
  return { success: true, channel: 'whatsapp', mock: true };
}

/**
 * Send SMS stub notification
 */
async function sendSmsNotification(phone, message) {
  if (!phone) return { success: false, reason: 'No phone number' };
  console.log(`[NotificationHub] [SMS STUB] To: ${phone} | Message: ${message}`);
  return { success: true, channel: 'sms', mock: true };
}

/**
 * Dispatch a new notification through all enabled channels.
 */
async function dispatch(event) {
  const {
    recipientId,
    recipientEmail,
    recipientPhone,
    recipientRole = 'user', // 'guide', 'traveler', 'admin'
    type,
    title,
    message,
    actionUrl,
    metadata = {}
  } = event;

  const prefs = getPreferences(recipientId);

  const notifRecord = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    recipientId,
    recipientRole,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    actionUrl: actionUrl || '#',
    metadata
  };

  // 1. In-App Notification (always stored and pushed via SSE if inApp enabled)
  if (prefs.inApp) {
    global.__notifications.unshift(notifRecord);
    // Keep max 500 in memory
    if (global.__notifications.length > 500) {
      global.__notifications = global.__notifications.slice(0, 500);
    }
    // Broadcast via SSE live bus
    liveBus.publish(notifRecord);
  }

  // 2. Email Dispatch
  if (prefs.email && recipientEmail) {
    let emailHtml = '';
    let emailSubject = title;

    switch (type) {
      case 'BOOKING_REQUESTED':
        emailHtml = emailTemplates.bookingRequested({ ...metadata, title, message, actionUrl });
        break;
      case 'BOOKING_ACCEPTED':
        emailHtml = emailTemplates.bookingAccepted({ ...metadata, title, message, actionUrl });
        break;
      case 'BOOKING_REJECTED':
        emailHtml = emailTemplates.bookingRejected({ ...metadata, title, message, actionUrl });
        break;
      case 'PAYMENT_COMPLETED':
        emailHtml = emailTemplates.paymentCompleted({ ...metadata, title, message, actionUrl });
        break;
      case 'TOUR_REMINDER_24H':
        emailHtml = emailTemplates.tourReminder24h({ ...metadata, title, message, actionUrl });
        break;
      case 'TOUR_REMINDER_2H':
        emailHtml = emailTemplates.tourReminder2h({ ...metadata, title, message, actionUrl });
        break;
      case 'TOUR_COMPLETED':
        emailHtml = emailTemplates.tourCompleted({ ...metadata, title, message, actionUrl });
        break;
      case 'PAYOUT_PROCESSED':
        emailHtml = emailTemplates.payoutProcessed({ ...metadata, title, message, actionUrl });
        break;
      default:
        emailHtml = emailTemplates.generic({ title, message, actionUrl });
    }

    sendEmailNotification(recipientEmail, emailSubject, emailHtml).catch(() => {});
  }

  // 3. WhatsApp Dispatch (if opted-in)
  if (prefs.whatsapp && recipientPhone) {
    sendWhatsAppNotification(recipientPhone, `[BookingCart] ${title}: ${message}`).catch(() => {});
  }

  // 4. SMS Dispatch (if opted-in)
  if (prefs.sms && recipientPhone) {
    sendSmsNotification(recipientPhone, `BookingCart: ${title} - ${message}`).catch(() => {});
  }

  return notifRecord;
}

/**
 * Get notifications for a user or admin
 */
function getNotificationsForUser(recipientId, recipientRole = 'user') {
  return global.__notifications.filter((n) => {
    if (recipientRole === 'admin' && n.recipientRole === 'admin') return true;
    return n.recipientId === recipientId || (recipientId === 'admin' && n.recipientRole === 'admin');
  });
}

/**
 * Mark a single notification as read
 */
function markAsRead(notificationId) {
  const notif = global.__notifications.find((n) => n.id === notificationId);
  if (notif) {
    notif.read = true;
    return notif;
  }
  return null;
}

/**
 * Mark all notifications as read for a user
 */
function markAllAsRead(recipientId, recipientRole) {
  const userNotifs = getNotificationsForUser(recipientId, recipientRole);
  userNotifs.forEach((n) => {
    n.read = true;
  });
  return { updated: userNotifs.length };
}

module.exports = {
  dispatch,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences
};
