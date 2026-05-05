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
 * Order Change API
 * 
 * POST /api/duffel-order-changes - Create change request
 * GET  /api/duffel-order-changes?id=... - Get change request details
 * POST /api/duffel-confirm-order-change - Confirm order change
 */

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Duffel is not configured (missing DUFFEL_API_KEY)' });
  }

  try {
    // GET - Get change request details
    if (req.method === 'GET') {
      const changeRequestId = String(req.query.id || '').trim();
      if (!changeRequestId) {
        return res.status(400).json({ ok: false, error: 'Missing change request id' });
      }

      console.log(`Fetching order change request: ${changeRequestId}`);

      const response = await fetch(`${DUFFEL_BASE_URL}/air/order_change_requests/${changeRequestId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${DUFFEL_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Duffel change request get error:', response.status, errorText);
        return res.status(response.status).json({
          ok: false,
          error: `Failed to fetch change request: ${response.status}`
        });
      }

      const data = await response.json();
      
      // Transform order change offers
      const offers = data.data.order_change_offers?.map(offer => ({
        id: offer.id,
        changeTotalAmount: offer.change_total_amount,
        changeTotalCurrency: offer.change_total_currency,
        penaltyTotalAmount: offer.penalty_total_amount,
        penaltyTotalCurrency: offer.penalty_total_currency,
        refundAmount: offer.refund_amount,
        refundCurrency: offer.refund_currency,
        newTotalAmount: offer.new_total_amount,
        newTotalCurrency: offer.new_total_currency,
        slices: {
          remove: offer.slices?.remove || [],
          add: offer.slices?.add || []
        },
        expiresAt: offer.expires_at
      })) || [];

      return res.json({
        ok: true,
        changeRequest: {
          id: data.data.id,
          orderId: data.data.order_id,
          status: data.data.status,
          createdAt: data.data.created_at,
          updatedAt: data.data.updated_at,
          offers: offers
        }
      });
    }

    // POST - Create change request or confirm change
    if (req.method === 'POST') {
      const body = req.body || {};
      const { action } = body;

      // Create order change request
      if (action === 'create') {
        const { orderId, slices } = body;

        if (!orderId) {
          return res.status(400).json({ ok: false, error: 'Missing orderId' });
        }

        if (!slices || !slices.remove || !slices.add) {
          return res.status(400).json({ ok: false, error: 'Missing slices (must have remove and add arrays)' });
        }

        console.log(`Creating order change request for order: ${orderId}`);

        const response = await fetch(`${DUFFEL_BASE_URL}/air/order_change_requests`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            'Authorization': `Bearer ${DUFFEL_API_KEY}`
          },
          body: JSON.stringify({
            data: {
              order_id: orderId,
              slices: {
                remove: slices.remove,
                add: slices.add
              }
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Duffel change request create error:', response.status, errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            return res.status(response.status).json({
              ok: false,
              error: errorJson.errors?.[0]?.title || `Failed to create change request: ${response.status}`,
              details: errorJson.errors
            });
          } catch {
            return res.status(response.status).json({
              ok: false,
              error: `Failed to create change request: ${response.status}`
            });
          }
        }

        const data = await response.json();
        
        console.log(`Change request created: ${data.data.id}`);

        // Transform offers
        const offers = data.data.order_change_offers?.map(offer => ({
          id: offer.id,
          changeTotalAmount: offer.change_total_amount,
          changeTotalCurrency: offer.change_total_currency,
          penaltyTotalAmount: offer.penalty_total_amount,
          penaltyTotalCurrency: offer.penalty_total_currency,
          refundAmount: offer.refund_amount,
          refundCurrency: offer.refund_currency,
          newTotalAmount: offer.new_total_amount,
          newTotalCurrency: offer.new_total_currency,
          slices: {
            remove: offer.slices?.remove || [],
            add: offer.slices?.add || []
          },
          expiresAt: offer.expires_at
        })) || [];

        return res.json({
          ok: true,
          changeRequest: {
            id: data.data.id,
            orderId: data.data.order_id,
            status: data.data.status,
            createdAt: data.data.created_at,
            updatedAt: data.data.updated_at,
            offers: offers
          }
        });
      }

      // Confirm order change
      if (action === 'confirm') {
        const { orderChangeOfferId } = body;

        if (!orderChangeOfferId) {
          return res.status(400).json({ ok: false, error: 'Missing orderChangeOfferId' });
        }

        console.log(`Confirming order change with offer: ${orderChangeOfferId}`);

        const response = await fetch(`${DUFFEL_BASE_URL}/air/order_changes`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Duffel-Version': 'v2',
            'Authorization': `Bearer ${DUFFEL_API_KEY}`
          },
          body: JSON.stringify({
            data: {
              order_change_offer_id: orderChangeOfferId
            }
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Duffel order change confirm error:', response.status, errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            return res.status(response.status).json({
              ok: false,
              error: errorJson.errors?.[0]?.title || `Failed to confirm order change: ${response.status}`,
              details: errorJson.errors
            });
          } catch {
            return res.status(response.status).json({
              ok: false,
              error: `Failed to confirm order change: ${response.status}`
            });
          }
        }

        const data = await response.json();
        
        console.log(`Order change confirmed: ${data.data.id}`);

        return res.json({
          ok: true,
          orderChange: {
            id: data.data.id,
            orderId: data.data.order_id,
            orderChangeRequestId: data.data.order_change_request_id,
            status: data.data.status,
            changeTotalAmount: data.data.change_total_amount,
            changeTotalCurrency: data.data.change_total_currency,
            penaltyTotalAmount: data.data.penalty_total_amount,
            penaltyTotalCurrency: data.data.penalty_total_currency,
            refundAmount: data.data.refund_amount,
            refundCurrency: data.data.refund_currency,
            newTotalAmount: data.data.new_total_amount,
            newTotalCurrency: data.data.new_total_currency,
            createdAt: data.data.created_at,
            confirmedAt: data.data.confirmed_at
          }
        });
      }

      return res.status(400).json({ ok: false, error: 'Invalid action. Use "create" or "confirm"' });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Order change error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
};
