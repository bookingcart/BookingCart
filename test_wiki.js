const fs = require('fs');
const https = require('https');

async function getWikiImage(city) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(city)}&pithumbsize=800&format=json`;
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'BookingCartScript/1.0 (contact@example.com)' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const pages = parsed.query.pages;
                    const pageId = Object.keys(pages)[0];
                    if (pageId !== '-1' && pages[pageId].thumbnail) {
                        resolve(pages[pageId].thumbnail.source);
                    } else {
                        resolve(null);
                    }
                } catch(e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

(async () => {
    const img1 = await getWikiImage('Nairobi');
    const img2 = await getWikiImage('Dubai');
    console.log('Nairobi:', img1);
    console.log('Dubai:', img2);
})();
