const fs = require('fs');
const https = require('https');

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getWikiImage(city) {
    if (city.toLowerCase() === 'new york' || city.toLowerCase() === 'new-york') city = 'New York City';
    if (city.toLowerCase() === 'las vegas') city = 'Las Vegas';
    if (city.toLowerCase() === 'los angeles' || city.toLowerCase() === 'los-angeles') city = 'Los Angeles';
    if (city.toLowerCase() === 'cancun') city = 'Cancún';

    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(city)}&pithumbsize=800&format=json`;
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'BookingCartScript/2.0 (contact@example.com)' } }, (res) => {
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

async function fixFile(file, regex, cityExtractor) {
    let content = fs.readFileSync(file, 'utf8');
    let matches = [];
    let match;
    
    // reset regex state
    const rx = new RegExp(regex.source, regex.flags);
    while ((match = rx.exec(content)) !== null) {
        matches.push({
            fullMatch: match[0],
            city: cityExtractor(match)
        });
    }

    const uniqueCities = [...new Set(matches.map(m => m.city))];
    const imageMap = {};

    console.log(`Fetching ${uniqueCities.length} cities for ${file}...`);
    for (const city of uniqueCities) {
        if (['Hotels', 'Apartments', 'Villas', 'Resorts'].includes(city)) continue;
        
        await delay(500); // Wait 500ms between requests
        let img = await getWikiImage(city);
        if (!img) {
            console.log(`Failed to fetch ${city}, trying Country/Region fallback...`);
            img = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop'; // generic fallback
        } else {
            console.log(`Successfully fetched ${city}`);
        }
        imageMap[city] = img;
    }

    let modifiedContent = content;
    for (const m of matches) {
        if (imageMap[m.city]) {
            const newString = m.fullMatch.replace(/https:\/\/(images\.pexels\.com|loremflickr\.com|images\.unsplash\.com)[^'"]+/, imageMap[m.city]);
            modifiedContent = modifiedContent.replace(m.fullMatch, newString);
        }
    }

    fs.writeFileSync(file, modifiedContent, 'utf8');
    console.log(`Fixed ${file}`);
}

async function run() {
    // 1. deals.js
    await fixFile(
        'public/js/deals.js',
        /'([a-z\s\-]+)':\s*'https:\/\/(images\.pexels\.com|loremflickr\.com|images\.unsplash\.com)[^']+'/g,
        (match) => match[1]
    );

    // 2. api-routes/flight-deals.js
    await fixFile(
        'api-routes/flight-deals.js',
        /'([a-z\s\-]+)':\s*'https:\/\/(images\.pexels\.com|loremflickr\.com|images\.unsplash\.com)[^']+'/g,
        (match) => match[1]
    );

    // 3. HomePage.jsx (Stays DEALS list)
    await fixFile(
        'src/pages/HomePage.jsx',
        /city:\s*'([^']+)',\s*img:\s*'https:\/\/(images\.pexels\.com|loremflickr\.com|images\.unsplash\.com)[^']+'/g,
        (match) => match[1]
    );

    // 4. HomePage.jsx (Trending Destinations)
    await fixFile(
        'src/pages/HomePage.jsx',
        /src="https:\/\/(images\.pexels\.com|loremflickr\.com|images\.unsplash\.com)[^"]+"\s+alt="([^"]+)"/g,
        (match) => match[2]
    );
}

run();
