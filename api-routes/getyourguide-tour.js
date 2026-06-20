const fetch = require('node-fetch');

module.exports = async function getyourguideTourHandler(req, res) {
  try {
    const apiKey = process.env.GETYOURGUIDE_API_KEY;
    if (!apiKey) {
      return res.status(200).json({
        ok: false,
        error: 'GETYOURGUIDE_API_KEY not configured'
      });
    }

    const { id } = req.params;
    const { cnt_language = 'en', currency = 'USD' } = req.query;

    if (!id) {
      return res.status(400).json({ ok: false, error: 'Tour ID is required' });
    }

    const url = new URL(`https://api.getyourguide.com/1/tours/${id}`);
    url.searchParams.append('cnt_language', cnt_language);
    url.searchParams.append('currency', currency);

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

    return res.json({
      ok: true,
      tour: data.data || data
    });

  } catch (error) {
    console.error('GYG Tour Error:', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
};
