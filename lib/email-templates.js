'use strict';

function wrapLayout(title, content) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
      .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 32px; text-align: center; }
      .header h1 { margin: 0; font-size: 22px; font-weight: 700; tracking-style: tight; color: #10b981; }
      .header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
      .content { padding: 32px; }
      .badge { display: inline-block; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
      .badge-emerald { background: #d1fae5; color: #065f46; }
      .badge-amber { background: #fef3c7; color: #92400e; }
      .badge-rose { background: #ffe4e6; color: #9f1239; }
      .badge-blue { background: #dbeafe; color: #1e40af; }
      .details-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
      .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
      .detail-row:last-child { border-bottom: none; }
      .detail-label { color: #64748b; font-weight: 500; }
      .detail-value { color: #0f172a; font-weight: 600; text-align: right; }
      .btn { display: inline-block; background: #10b981; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 16px; }
      .footer { background: #f1f5f9; padding: 20px 32px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
      .footer a { color: #10b981; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>BookingCart</h1>
        <p>Verified Local Tour Guides & Experiences</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} BookingCart Inc. All rights reserved.</p>
        <p>You are receiving this notification regarding your account or booking on BookingCart.</p>
      </div>
    </div>
  </body>
  </html>
  `;
}

module.exports = {
  bookingRequested: (data) => wrapLayout(
    'New Booking Request Received',
    `
    <span class="badge badge-amber">Action Required</span>
    <h2 style="margin-top: 12px; color: #0f172a;">New Booking Request #${data.bookingId || data.id}</h2>
    <p style="color: #475569; font-size: 15px;">Hello <strong>${data.guideName || 'Guide'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">You have received a new booking request from <strong>${data.travelerName || 'a traveler'}</strong>.</p>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Tour Date:</span><span class="detail-value">${data.date || 'TBD'}</span></div>
      <div class="detail-row"><span class="detail-label">Travelers:</span><span class="detail-value">${data.travelersCount || 1} guest(s)</span></div>
      <div class="detail-row"><span class="detail-label">Total Amount:</span><span class="detail-value">$${data.totalAmount || 0}</span></div>
      <div class="detail-row"><span class="detail-label">Location:</span><span class="detail-value">${data.location || 'Local Tour'}</span></div>
    </div>
    <p style="color: #64748b; font-size: 13px;">Please accept or decline this booking request within 24 hours.</p>
    <a href="${data.actionUrl || '#'}" class="btn">View Booking Details</a>
    `
  ),

  bookingAccepted: (data) => wrapLayout(
    'Booking Accepted! Next Step: Payment',
    `
    <span class="badge badge-emerald">Booking Accepted</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Your Guide Accepted Your Booking!</h2>
    <p style="color: #475569; font-size: 15px;">Great news, <strong>${data.travelerName || 'Traveler'}</strong>!</p>
    <p style="color: #475569; font-size: 15px;"><strong>${data.guideName || 'Your guide'}</strong> has confirmed your booking request for <strong>${data.date || 'your tour date'}</strong>.</p>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Booking ID:</span><span class="detail-value">#${data.bookingId || data.id}</span></div>
      <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${data.date || 'TBD'}</span></div>
      <div class="detail-row"><span class="detail-label">Amount Due:</span><span class="detail-value">$${data.totalAmount || 0}</span></div>
    </div>
    <p style="color: #475569; font-size: 14px;">Please complete payment to secure your booking and receive meeting point details.</p>
    <a href="${data.actionUrl || '#'}" class="btn">Complete Payment Now</a>
    `
  ),

  bookingRejected: (data) => wrapLayout(
    'Booking Update',
    `
    <span class="badge badge-rose">Booking Declined</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Booking Request Declined</h2>
    <p style="color: #475569; font-size: 15px;">Hello <strong>${data.travelerName || 'Traveler'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">Unfortunately, guide <strong>${data.guideName || 'the guide'}</strong> was unable to accept your request for <strong>${data.date || 'the requested date'}</strong>.</p>
    ${data.reason ? `<p style="color: #64748b; font-size: 13px;">Reason: "${data.reason}"</p>` : ''}
    <p style="color: #475569; font-size: 14px;">Don't worry! You can browse other available verified local guides for your trip.</p>
    <a href="${data.actionUrl || '#'}" class="btn">Explore Available Guides</a>
    `
  ),

  paymentCompleted: (data) => wrapLayout(
    'Payment Confirmed — You\'re All Set!',
    `
    <span class="badge badge-emerald">Payment Confirmed</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Payment Received & Escrow Active</h2>
    <p style="color: #475569; font-size: 15px;">Hello <strong>${data.travelerName || 'Traveler'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">Your payment of <strong>$${data.totalAmount || 0}</strong> for tour #${data.bookingId || data.id} has been processed successfully and is safely held in Escrow.</p>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Tour Date:</span><span class="detail-value">${data.date || 'TBD'}</span></div>
      <div class="detail-row"><span class="detail-label">Meeting Point:</span><span class="detail-value">${data.meetingPoint || 'Specified by guide'}</span></div>
      <div class="detail-row"><span class="detail-label">Guide Contact:</span><span class="detail-value">${data.guidePhone || 'Available in chat'}</span></div>
    </div>
    <a href="${data.actionUrl || '#'}" class="btn">View Itinerary & Chat</a>
    `
  ),

  tourReminder24h: (data) => wrapLayout(
    'Reminder: Your Tour is Tomorrow!',
    `
    <span class="badge badge-blue">Upcoming Tour</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Your Tour is Tomorrow!</h2>
    <p style="color: #475569; font-size: 15px;">Hi <strong>${data.recipientName || 'there'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">This is a friendly reminder that your upcoming tour with <strong>${data.otherPartyName || 'your guide/traveler'}</strong> is scheduled for tomorrow (<strong>${data.date || 'Tomorrow'}</strong>).</p>
    
    <div class="details-box">
      <div class="detail-row"><span class="detail-label">Time:</span><span class="detail-value">${data.time || '09:00 AM'}</span></div>
      <div class="detail-row"><span class="detail-label">Meeting Location:</span><span class="detail-value">${data.meetingPoint || 'Check details'}</span></div>
    </div>
    <a href="${data.actionUrl || '#'}" class="btn">Check Booking & Chat</a>
    `
  ),

  tourReminder2h: (data) => wrapLayout(
    'Starting Soon: Your Tour Begins in 2 Hours',
    `
    <span class="badge badge-emerald">Starting Soon</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Tour Starts in 2 Hours!</h2>
    <p style="color: #475569; font-size: 15px;">Hi <strong>${data.recipientName || 'there'}</strong>, your tour starts in 2 hours!</p>
    <p style="color: #475569; font-size: 15px;">Meeting Location: <strong>${data.meetingPoint || 'Designated meeting area'}</strong></p>
    <a href="${data.actionUrl || '#'}" class="btn">Open Live Chat</a>
    `
  ),

  tourCompleted: (data) => wrapLayout(
    'Tour Completed — Leave a Review!',
    `
    <span class="badge badge-emerald">Completed</span>
    <h2 style="margin-top: 12px; color: #0f172a;">How Was Your Experience?</h2>
    <p style="color: #475569; font-size: 15px;">Hi <strong>${data.travelerName || 'Traveler'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">Your tour with <strong>${data.guideName || 'your guide'}</strong> has ended. We hope you had an unforgettable experience!</p>
    <p style="color: #475569; font-size: 15px;">Please take a moment to rate and review your guide.</p>
    <a href="${data.actionUrl || '#'}" class="btn">Leave a Review</a>
    `
  ),

  payoutProcessed: (data) => wrapLayout(
    'Payout Processed to Your Account',
    `
    <span class="badge badge-emerald">Payout Released</span>
    <h2 style="margin-top: 12px; color: #0f172a;">Payout Released: $${data.amount || 0}</h2>
    <p style="color: #475569; font-size: 15px;">Hello <strong>${data.guideName || 'Guide'}</strong>,</p>
    <p style="color: #475569; font-size: 15px;">Earnings of <strong>$${data.amount || 0}</strong> for completed booking #${data.bookingId || ''} have been released from Escrow to your connected payout account.</p>
    <a href="${data.actionUrl || '#'}" class="btn">View Earnings & Wallet</a>
    `
  ),

  generic: (data) => wrapLayout(
    data.title || 'BookingCart Notification',
    `
    <h2 style="margin-top: 12px; color: #0f172a;">${data.title || 'Notification'}</h2>
    <p style="color: #475569; font-size: 15px;">${data.message || ''}</p>
    ${data.actionUrl ? `<a href="${data.actionUrl}" class="btn">View Details</a>` : ''}
    `
  )
};
