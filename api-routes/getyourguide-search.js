const fetch = require('node-fetch');

module.exports = async function getyourguideSearchHandler(req, res) {
  try {
    const apiKey = process.env.GETYOURGUIDE_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        ok: false,
        error: 'GETYOURGUIDE_API_KEY not configured',
        tours: []
      });
    }

    const { q, cnt_language = 'en', currency = 'USD', limit = '20' } = req.query;

    if (!q) {
      return res.status(400).json({ ok: false, error: 'Query parameter "q" is required' });
    }

    const url = new URL('https://api.getyourguide.com/1/tours');
    url.searchParams.append('q', q);
    url.searchParams.append('cnt_language', cnt_language);
    url.searchParams.append('currency', currency);
    url.searchParams.append('limit', limit);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-ACCESS-TOKEN': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GYG API Error: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        ok: false,
        error: `GetYourGuide API error: ${response.status}`
      });
    }

    const data = await response.json();
    
    // Normalize the response to a standard format for the frontend
    const tours = (data.data && data.data.tours) ? data.data.tours.map(tour => ({
      id: tour.id,
      title: tour.title,
      url: tour.url,
      price: tour.price ? tour.price.amount : null,
      currency: tour.price ? tour.price.currency : null,
      rating: tour.rating,
      review_count: tour.reviewCount || tour.reviews_count || 0,
      duration: tour.duration,
      image_url: tour.image_url || tour.pictures?.[0]?.url || tour.media?.[0]?.url || '',
      categories: tour.categories || []
    })) : [];

    return res.json({
      ok: true,
      tours,
      metadata: data._metadata || {}
    });

  } catch (error) {
    console.error('GYG Search Error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
