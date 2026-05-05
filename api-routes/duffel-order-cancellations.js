require('dotenv').config();

const fetch = require('node-fetch');
const { getCorsHeaders } = require('../lib/cors');

const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || '';
const DUFFEL_BASE_URL = 'https://api.duffel.com';

function applyCors(req, res) {
  const h = getCorsHeaders(req);
  Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
}

/**
 * Order Cancellation API
 * 
 * POST /api/duffel-order-cancellations - Create a pending cancellation
 * GET  /api/duffel-order-cancellations?id=... - Get cancellation status
 * POST /api/duffel-confirm-cancellation - Confirm the cancellation
 */

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Duffel is not configured (missing DUFFEL_API_KEY)' });
  }

  try {
    // GET - Check cancellation status
    if (req.method === 'GET') {
      const cancellationId = String(req.query.id || '').trim();
      if (!cancellationId) {
        return res.status(400).json({ ok: false, error: 'Missing cancellation id' });
      }

      console.log(`Fetching cancellation status: ${cancellationId}`);

      const response = await fetch(`${DUFFEL_BASE_URL}/air/order_cancellations/${cancellationId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${DUFFEL_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Duffel cancellation get error:', response.status, errorText);
        return res.status(response.status).json({
          ok: false,
          error: `Failed to fetch cancellation: ${response.status}`
        });
      }

      const data = await response.json();
      
      return res.json({
        ok: true,
        cancellation: {
          id: data.data.id,
          orderId: data.data.order_id,
          refundAmount: data.data.refund_amount,
          refundCurrency: data.data.refund_currency,
          status: data.data.status, // 'pending', 'confirmed', 'refused'
          confirmedAt: data.data.confirmed_at,
          createdAt: data.data.created_at
        }
      });
    }

    // POST - Create or confirm cancellation
    if (req.method === 'POST') {
      const body = req.body || {};
      const { action, orderId, cancellationId, reason } = body;

      // Create pending cancellation
      if (action === 'create') {
        if (!orderId) {
          return res.status(400).json({ ok: false, error: 'Missing orderId' });
        }

        console.log(`Creating cancellation for order: ${orderId}`);

        const response = await fetch(`${DUFFEL_BASE_URL}/air/order_cancellations`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            'Authorization': `Bearer ${DUFFEL_API_KEY}`
          },
          body: JSON.stringify({
            data: {
              order_id: orderId
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Duffel cancellation create error:', response.status, errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            return res.status(response.status).json({
              ok: false,
              error: errorJson.errors?.[0]?.title || `Failed to create cancellation: ${response.status}`,
              details: errorJson.errors
            });
          } catch {
            return res.status(response.status).json({
              ok: false,
              error: `Failed to create cancellation: ${response.status}`
            });
          }
        }

        const data = await response.json();
        
        console.log(`Cancellation created: ${data.data.id}`);

        return res.json({
          ok: true,
          cancellation: {
            id: data.data.id,
            orderId: data.data.order_id,
            refundAmount: data.data.refund_amount,
            refundCurrency: data.data.refund_currency,
            status: data.data.status,
            createdAt: data.data.created_at
          }
        });
      }

      // Confirm cancellation
      if (action === 'confirm') {
        if (!cancellationId) {
          return res.status(400).json({ ok: false, error: 'Missing cancellationId' });
        }

        console.log(`Confirming cancellation: ${cancellationId}`);

        const response = await fetch(`${DUFFEL_BASE_URL}/air/order_cancellations/${cancellationId}/actions/confirm`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            'Authorization': `Bearer ${DUFFEL_API_KEY}`
          },
          body: JSON.stringify({
            data: {
              reason: reason || 'customer_request'
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Duffel cancellation confirm error:', response.status, errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            return res.status(response.status).json({
              ok: false,
              error: errorJson.errors?.[0]?.title || `Failed to confirm cancellation: ${response.status}`,
              details: errorJson.errors
            });
          } catch {
            return res.status(response.status).json({
              ok: false,
              error: `Failed to confirm cancellation: ${response.status}`
            });
          }
        }

        const data = await response.json();
        
        console.log(`Cancellation confirmed: ${data.data.id}`);

        return res.json({
          ok: true,
          cancellation: {
            id: data.data.id,
            orderId: data.data.order_id,
            refundAmount: data.data.refund_amount,
            refundCurrency: data.data.refund_currency,
            status: data.data.status,
            confirmedAt: data.data.confirmed_at,
            createdAt: data.data.created_at
          }
        });
      }

      return res.status(400).json({ ok: false, error: 'Invalid action. Use "create" or "confirm"' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Order cancellation error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
};
