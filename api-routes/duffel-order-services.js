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
 * Post-Booking Services API
 * 
 * GET  /api/duffel-order-services?orderId=... - Get available services (bags, seats, meals)
 * POST /api/duffel-order-services - Add services to order
 */

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!DUFFEL_API_KEY) {
    return res.status(503).json({ ok: false, error: 'Duffel is not configured (missing DUFFEL_API_KEY)' });
  }

  try {
    // GET - Get available services for order
    if (req.method === 'GET') {
      const orderId = String(req.query.orderId || '').trim();
      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'Missing orderId query parameter' });
      }

      console.log(`Fetching available services for order: ${orderId}`);

      const response = await fetch(`${DUFFEL_BASE_URL}/air/orders/${orderId}/available_services`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${DUFFEL_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Duffel services get error:', response.status, errorText);
        return res.status(response.status).json({
          ok: false,
          error: `Failed to fetch services: ${response.status}`
        });
      }

      const data = await response.json();
      
      // Transform services by type
      const services = {
        baggage: [],
        seats: [],
        meals: [],
        other: []
      };

      (data.data || []).forEach(service => {
        const transformed = {
          id: service.id,
          type: service.type,
          passengerId: service.passenger_id,
          passengerName: service.passenger_name,
          segmentId: service.segment_id,
          segmentOrigin: service.segment_origin,
          segmentDestination: service.segment_destination,
          maximumQuantity: service.maximum_quantity,
          totalAmount: service.total_amount,
          totalCurrency: service.total_currency,
          metadata: service.metadata || {}
        };

        // Categorize by service type
        if (service.type === 'baggage') {
          transformed.baggageType = service.metadata?.type;
          transformed.weight = service.metadata?.weight;
          services.baggage.push(transformed);
        } else if (service.type === 'seat') {
          transformed.designator = service.metadata?.designator;
          transformed.conditions = service.metadata?.conditions;
          services.seats.push(transformed);
        } else if (service.type === 'meal') {
          transformed.description = service.metadata?.description;
          services.meals.push(transformed);
        } else {
          services.other.push(transformed);
        }
      });

      return res.json({
        ok: true,
        orderId: orderId,
        services: services,
        totalServices: (data.data || []).length
      });
    }

    // POST - Add services to order
    if (req.method === 'POST') {
      const body = req.body || {};
      const { orderId, services } = body;

      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'Missing orderId' });
      }

      if (!Array.isArray(services) || services.length === 0) {
        return res.status(400).json({ ok: false, error: 'services must be a non-empty array' });
      }

      // Validate each service
      for (let i = 0; i < services.length; i++) {
        const s = services[i];
        if (!s.id || typeof s.id !== 'string') {
          return res.status(400).json({ ok: false, error: `services[${i}].id is required` });
        }
        if (!s.quantity || typeof s.quantity !== 'number' || s.quantity < 1) {
          return res.status(400).json({ ok: false, error: `services[${i}].quantity must be at least 1` });
        }
      }

      console.log(`Adding ${services.length} services to order: ${orderId}`);

      // Build the services payload
      const servicesPayload = services.map(s => ({
        id: s.id.trim(),
        quantity: s.quantity
      }));

      const response = await fetch(`${DUFFEL_BASE_URL}/air/orders/${orderId}/services`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Duffel-Version': 'v2',
          'Authorization': `Bearer ${DUFFEL_API_KEY}`
        },
        body: JSON.stringify({
          data: {
            services: servicesPayload
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Duffel services add error:', response.status, errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          return res.status(response.status).json({
            ok: false,
            error: errorJson.errors?.[0]?.title || `Failed to add services: ${response.status}`,
            details: errorJson.errors
          });
        } catch {
          return res.status(response.status).json({
            ok: false,
            error: `Failed to add services: ${response.status}`
          });
        }
      }

      const data = await response.json();
      
      console.log(`Services added to order: ${orderId}`);

      // Transform added services
      const addedServices = (data.data?.services || []).map(service => ({
        id: service.id,
        type: service.type,
        passengerId: service.passenger_id,
        segmentId: service.segment_id,
        quantity: service.quantity,
        totalAmount: service.total_amount,
        totalCurrency: service.total_currency
      }));

      return res.json({
        ok: true,
        orderId: data.data?.order_id || orderId,
        addedServices: addedServices,
        newTotalAmount: data.data?.new_total_amount,
        newTotalCurrency: data.data?.new_total_currency
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  } catch (error) {
    console.error('Order services error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error'
    });
  }
};
