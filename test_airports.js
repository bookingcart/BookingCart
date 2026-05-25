const airports = [
  { code:'EBB', lat: 0.04,  lng:32.44 },
  { code:'NBO', lat:-1.32,  lng:36.82 },
  { code:'KGL', lat:-1.97,  lng:30.14 },
  { code:'ADD', lat: 8.98,  lng:38.80 },
  { code:'DXB', lat:25.25,  lng:55.36 },
  { code:'LHR', lat:51.48,  lng:-0.46 },
  { code:'JFK', lat:40.64,  lng:-73.78 },
  { code:'CDG', lat:49.00,  lng: 2.55 },
];

async function check() {
  for (let ap of airports) {
    const url = `https://api.adsb.lol/v2/lat/${ap.lat.toFixed(3)}/lon/${ap.lng.toFixed(3)}/dist/250`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      console.log(`${ap.code}: ${data.ac ? data.ac.length : 0} aircrafts`);
    } catch (e) {
      console.log(`${ap.code}: error`);
    }
  }
}
check();
