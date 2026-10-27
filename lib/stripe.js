'use strict';

const Stripe = require('stripe');

let client = null;
let cachedKey = '';

// Stripe expects the smallest currency unit; these currencies have no minor unit.
const ZERO_DECIMAL = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf',
  'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);

/** Convert a major-unit amount (e.g. 25.50 USD) into Stripe's integer amount. */
function toStripeAmount(amount, currency = 'usd') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return ZERO_DECIMAL.has(String(currency || 'usd').toLowerCase())
    ? Math.round(value)
    : Math.round(value * 100);
}

function getStripeConfigError() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return 'Stripe is not configured (missing STRIPE_SECRET_KEY)';
  if (key.startsWith('rk_')) {
    return 'Stripe is misconfigured: STRIPE_SECRET_KEY is a restricted key (rk_*). Use a secret key (sk_test_* or sk_live_*) for checkout sessions.';
  }
  return null;
}

function getStripeClient() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (getStripeConfigError()) return null;
  if (!client || cachedKey !== key) {
    client = Stripe(key);
    cachedKey = key;
  }
  return client;
}

async function verifyCheckoutSession(sessionId) {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: getStripeConfigError() };
  try {
    const session = await stripe.checkout.sessions.retrieve(String(sessionId));
    return {
      ok: true,
      paid: session.payment_status === 'paid',
      amountTotal: Number(session.amount_total || 0),
      currency: String(session.currency || '').toUpperCase(),
      metadata: session.metadata || {},
      paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
      customerEmail: session.customer_details?.email || session.customer_email || '',
      status: session.status,
    };
  } catch (error) {
    return { ok: false, error: `Stripe session could not be verified: ${error.message}` };
  }
}

/**
 * Refund a checkout session. Returns the Stripe refund id when one was created;
 * `refunded: false` means nothing was sent to Stripe (zero amount or no payment).
 */
async function refundCheckoutSession({ sessionId, paymentIntentId, amount, amountCents, currency = 'usd', reason = 'requested_by_customer' }) {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: getStripeConfigError() };

  let paymentIntent = paymentIntentId || '';
  try {
    if (!paymentIntent && sessionId) {
      const session = await stripe.checkout.sessions.retrieve(String(sessionId));
      paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || '';
    }
  } catch (error) {
    return { ok: false, error: `Stripe session lookup failed: ${error.message}` };
  }

  const cents = Number.isFinite(amountCents) ? Math.round(amountCents) : toStripeAmount(amount, currency);
  if (!paymentIntent) return { ok: true, refunded: false, reason: 'No card payment on this order' };
  if (!Number.isFinite(cents) || cents <= 0) return { ok: true, refunded: false };

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntent,
      amount: cents,
      reason,
    });
    return { ok: true, refunded: true, refundId: refund.id, status: refund.status };
  } catch (error) {
    return { ok: false, error: `Stripe refund failed: ${error.message}` };
  }
}

module.exports = {
  ZERO_DECIMAL,
  getStripeClient,
  getStripeConfigError,
  refundCheckoutSession,
  toStripeAmount,
  verifyCheckoutSession,
};
