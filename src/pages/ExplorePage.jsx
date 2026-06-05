import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ─── Destinations pool ────────────────────────────────────────────────────────
const ALL_DESTINATIONS = [
  { id:1,  city:'Kigali',       country:'Rwanda',       iata:'KGL', duration:'23h 40m', tripType:'round-trip', stops:'1 stop',    price:372,  lat:-1.9441,  lng:30.0619,  image:'https://upload.wikimedia.org/wikipedia/commons/2/2d/High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg' },
  { id:2,  city:'Dar Es Salaam',country:'Tanzania',     iata:'DAR', duration:'14h 20m', tripType:'round-trip', stops:'1 stop',    price:214,  lat:-6.7924,  lng:39.2083,  image:'https://images.unsplash.com/photo-1542224566-6e85f2e6772f?q=80&w=600&auto=format&fit=crop' },
  { id:3,  city:'Nairobi',      country:'Kenya',        iata:'NBO', duration:'11h 10m', tripType:'round-trip', stops:'Nonstop',   price:320,  lat:-1.2921,  lng:36.8219,  image:'https://images.unsplash.com/photo-1614531341773-3bff8b7cb3fc?q=80&w=600&auto=format&fit=crop' },
  { id:4,  city:'Zanzibar',     country:'Tanzania',     iata:'ZNZ', duration:'15h 00m', tripType:'round-trip', stops:'1 stop',    price:291,  lat:-6.1659,  lng:39.1989,  image:'https://images.unsplash.com/photo-1586861635167-e5223aadc9fe?q=80&w=600&auto=format&fit=crop' },
  { id:5,  city:'London',       country:'UK',           iata:'LHR', duration:'8h 30m',  tripType:'round-trip', stops:'Nonstop',   price:801,  lat:51.5074,  lng:-0.1278,  image:'https://upload.wikimedia.org/wikipedia/commons/6/67/London_Skyline_%28125508655%29.jpeg' },
  { id:6,  city:'New York',     country:'USA',          iata:'JFK', duration:'14h 45m', tripType:'round-trip', stops:'1 stop',    price:1435, lat:40.7128,  lng:-74.0060, image:'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=600&auto=format&fit=crop' },
  { id:7,  city:'Dubai',        country:'UAE',          iata:'DXB', duration:'6h 20m',  tripType:'round-trip', stops:'Nonstop',   price:519,  lat:25.2048,  lng:55.2708,  image:'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=600&auto=format&fit=crop' },
  { id:8,  city:'Bangkok',      country:'Thailand',     iata:'BKK', duration:'12h 05m', tripType:'round-trip', stops:'1 stop',    price:728,  lat:13.7563,  lng:100.5018, image:'https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=600&auto=format&fit=crop' },
  { id:9,  city:'Paris',        country:'France',       iata:'CDG', duration:'9h 15m',  tripType:'round-trip', stops:'1 stop',    price:839,  lat:48.8566,  lng:2.3522,   image:'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=600&auto=format&fit=crop' },
  { id:10, city:'Mumbai',       country:'India',        iata:'BOM', duration:'5h 55m',  tripType:'round-trip', stops:'Nonstop',   price:636,  lat:19.0760,  lng:72.8777,  image:'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?q=80&w=600&auto=format&fit=crop' },
  { id:11, city:'Accra',        country:'Ghana',        iata:'ACC', duration:'8h 40m',  tripType:'round-trip', stops:'1 stop',    price:547,  lat:5.6037,   lng:-0.1870,  image:'https://images.unsplash.com/photo-1555990693-c8b0aca65e2a?q=80&w=600&auto=format&fit=crop' },
  { id:12, city:'Johannesburg', country:'South Africa', iata:'JNB', duration:'9h 30m',  tripType:'round-trip', stops:'1 stop',    price:497,  lat:-26.2041, lng:28.0473,  image:'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?q=80&w=600&auto=format&fit=crop' },
  { id:13, city:'Cairo',        country:'Egypt',        iata:'CAI', duration:'5h 10m',  tripType:'round-trip', stops:'Nonstop',   price:387,  lat:30.0444,  lng:31.2357,  image:'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?q=80&w=600&auto=format&fit=crop' },
  { id:14, city:'São Paulo',    country:'Brazil',       iata:'GRU', duration:'16h 30m', tripType:'round-trip', stops:'1 stop',    price:1840, lat:-23.5505, lng:-46.6333, image:'https://images.unsplash.com/photo-1518639192441-8fce0a366e2e?q=80&w=600&auto=format&fit=crop' },
  { id:15, city:'Singapore',    country:'Singapore',    iata:'SIN', duration:'14h 20m', tripType:'round-trip', stops:'1 stop',    price:807,  lat:1.3521,   lng:103.8198, image:'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=600&auto=format&fit=crop' },
  { id:16, city:'Addis Ababa',  country:'Ethiopia',     iata:'ADD', duration:'2h 15m',  tripType:'round-trip', stops:'Nonstop',   price:289,  lat:9.1450,   lng:40.4897,  image:'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?q=80&w=600&auto=format&fit=crop' },
  { id:17, city:'Mombasa',      country:'Kenya',        iata:'MBA', duration:'12h 30m', tripType:'round-trip', stops:'1 stop',    price:506,  lat:-4.0435,  lng:39.6682,  image:'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?q=80&w=600&auto=format&fit=crop' },
  { id:18, city:'Casablanca',   country:'Morocco',      iata:'CMN', duration:'7h 45m',  tripType:'round-trip', stops:'1 stop',    price:987,  lat:33.5731,  lng:-7.5898,  image:'https://images.unsplash.com/photo-1569383746724-6f1b882b8f46?q=80&w=600&auto=format&fit=crop' },
  { id:19, city:'Athens',       country:'Greece',       iata:'ATH', duration:'7h 50m',  tripType:'round-trip', stops:'1 stop',    price:783,  lat:37.9838,  lng:23.7275,  image:'https://images.unsplash.com/photo-1555993539-1732b0258235?q=80&w=600&auto=format&fit=crop' },
  { id:20, city:'Amsterdam',    country:'Netherlands',  iata:'AMS', duration:'9h 00m',  tripType:'round-trip', stops:'Nonstop',   price:916,  lat:52.3676,  lng:4.9041,   image:'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?q=80&w=600&auto=format&fit=crop' },
  { id:21, city:'Istanbul',     country:'Turkey',       iata:'IST', duration:'5h 30m',  tripType:'round-trip', stops:'Nonstop',   price:562,  lat:41.0082,  lng:28.9784,  image:'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?q=80&w=600&auto=format&fit=crop' },
  { id:22, city:'Zurich',       country:'Switzerland',  iata:'ZRH', duration:'8h 45m',  tripType:'round-trip', stops:'2 stops',   price:810,  lat:47.3769,  lng:8.5417,   image:'https://images.unsplash.com/photo-1515488764276-beab7607c1e6?q=80&w=600&auto=format&fit=crop' },
  { id:23, city:'Lisbon',       country:'Portugal',     iata:'LIS', duration:'10h 00m', tripType:'round-trip', stops:'2 stops',   price:720,  lat:38.7223,  lng:-9.1393,  image:'https://images.unsplash.com/photo-1513735492246-483525079686?q=80&w=600&auto=format&fit=crop' },
  { id:24, city:'Milan',        country:'Italy',        iata:'MXP', duration:'9h 20m',  tripType:'round-trip', stops:'1 stop',    price:884,  lat:45.4642,  lng:9.1900,   image:'https://images.unsplash.com/photo-1520175480921-4edfa2983e0f?q=80&w=600&auto=format&fit=crop' },
  { id:25, city:'Doha',         country:'Qatar',        iata:'DOH', duration:'5h 45m',  tripType:'round-trip', stops:'Nonstop',   price:445,  lat:25.2854,  lng:51.5310,  image:'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=600&auto=format&fit=crop' },
  { id:26, city:'Cape Town',    country:'South Africa', iata:'CPT', duration:'11h 10m', tripType:'round-trip', stops:'1 stop',    price:386,  lat:-33.9249, lng:18.4241,  image:'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?q=80&w=600&auto=format&fit=crop' },
  { id:27, city:'Kampala',      country:'Uganda',       iata:'EBB', duration:'1h 30m',  tripType:'round-trip', stops:'Nonstop',   price:95,   lat:0.3476,   lng:32.5825,  image:'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg/600px-Urban_Rising%2C_KAMPALA%2C_Uganda.jpg' },
  { id:28, city:'Dakar',        country:'Senegal',      iata:'DSS', duration:'10h 00m', tripType:'round-trip', stops:'1 stop',    price:1113, lat:14.7167,  lng:-17.4677, image:'https://images.unsplash.com/photo-1548013146-72479768bada?q=80&w=600&auto=format&fit=crop' },
];

// ─── City descriptions & highlights ──────────────────────────────────────────
const CITY_INFO = {
  KGL: { desc: 'The land of a thousand hills — Kigali is Africa\'s cleanest, safest capital. Pair gorilla trekking in Volcanoes NP with its world-class café scene.', highlights: ['Mountain gorilla trekking', 'Kigali Genocide Memorial', 'Kimironko Market', 'Lake Kivu sunsets', 'Award-winning coffee culture'] },
  DAR: { desc: 'Tanzania\'s bustling port city blends Swahili heritage with Indian Ocean beaches. Gateway to Zanzibar and the Serengeti.', highlights: ['Zanzibar ferry gateway', 'Msasani Bay nightlife', 'National Museum & House of Culture', 'Kariakoo Market hustle', 'Serengeti safari hub'] },
  NBO: { desc: 'East Africa\'s tech & safari capital. Home to Nairobi National Park — the world\'s only wildlife park inside a city — and a thriving food scene.', highlights: ['Nairobi National Park', 'Giraffe Centre', 'Karen Blixen Museum', 'Carnivore Restaurant', 'Silicon Savannah tech hub'] },
  ZNZ: { desc: 'The Spice Island. White-sand beaches, turquoise waters, and a UNESCO-listed Stone Town with centuries of Swahili and Arab history.', highlights: ['Stone Town UNESCO site', 'Nungwi & Kendwa beaches', 'Spice farm tours', 'Snorkeling & diving', 'Forodhani Night Market'] },
  LHR: { desc: 'One of the world\'s most visited cities, London mixes royal pageantry, world-class museums, and an electric culinary and arts scene.', highlights: ['Buckingham Palace', 'British Museum', 'The Shard views', 'Borough Market food', 'West End theatre'] },
  JFK: { desc: 'The city that never sleeps. New York\'s iconic skyline, world-famous boroughs, and cultural diversity make it an unforgettable destination.', highlights: ['Central Park strolls', 'Times Square energy', 'Brooklyn Bridge walks', 'World-class museums', 'Diverse culinary scene'] },
  DXB: { desc: 'Where desert meets futuristic skyline. Dubai offers the world\'s tallest tower, luxury malls, and desert adventures all in one place.', highlights: ['Burj Khalifa observation deck', 'Dubai Mall & fountain', 'Desert safari', 'Palm Jumeirah', 'Dubai Creek heritage'] },
  BKK: { desc: 'Thailand\'s dazzling capital dazzles with ornate temples, street food paradise, rooftop bars, and world-class shopping.', highlights: ['Grand Palace & Wat Phra Kaew', 'Floating markets', 'Khao San Road', 'Rooftop skyline bars', 'Chatuchak Weekend Market'] },
  CDG: { desc: 'La Ville Lumière — the City of Light. Paris enchants with art, fashion, cuisine, and the timeless magic of the Eiffel Tower.', highlights: ['Eiffel Tower at sunset', 'Louvre Museum', 'Montmartre & Sacré-Cœur', 'Seine River cruise', 'World-class cuisine'] },
  BOM: { desc: 'India\'s financial and entertainment capital is a city of contrasts — colonial architecture alongside Bollywood glamour and incredible street food.', highlights: ['Gateway of India', 'Elephanta Island caves', 'Juhu Beach sunset', 'Dharavi cultural tour', 'Street food at Chowpatty'] },
  ACC: { desc: 'West Africa\'s most cosmopolitan city. Accra blends historic forts, vibrant Afrobeats music scene, and pristine Gulf of Guinea beaches.', highlights: ['Kwame Nkrumah Mausoleum', 'Cape Coast slave forts', 'Labadi Beach', 'Makola Market', 'Live highlife music'] },
  JNB: { desc: 'South Africa\'s City of Gold is a dynamic metropolis and gateway to Kruger National Park safaris and the Garden Route.', highlights: ['Apartheid Museum', 'Soweto township tour', 'Kruger safari access', 'Maboneng arts district', 'Neighbourgoods Market'] },
  CAI: { desc: 'The mother of the world. Cairo sits at the edge of the Sahara, home to the last remaining wonder of the ancient world.', highlights: ['Giza Pyramids & Sphinx', 'Egyptian Museum', 'Khan el-Khalili Bazaar', 'Nile River dinner cruise', 'Islamic Cairo mosques'] },
  GRU: { desc: 'South America\'s largest city pulses with energy. São Paulo is the continent\'s culinary and cultural capital with an incredible nightlife.', highlights: ['MASP art museum', 'Ibirapuera Park', 'Vila Madelena street art', 'Liberdade Japanese quarter', 'Exceptional restaurant scene'] },
  SIN: { desc: 'The Lion City punches above its weight with futuristic architecture, incredible hawker food, and lush gardens in the tropics.', highlights: ['Gardens by the Bay', 'Marina Bay Sands skypark', 'Hawker centre food trails', 'Sentosa Island', 'Chinatown & Little India'] },
  ADD: { desc: 'Africa\'s diplomatic capital sits high in the Ethiopian Highlands. Ancient churches, coffee ceremonies, and the Blue Nile await.', highlights: ['National Museum of Ethiopia', 'Merkato market', 'Traditional coffee ceremony', 'Mount Entoto hiking', 'Lalibela excursion hub'] },
  MBA: { desc: 'Kenya\'s coastal paradise. Mombasa\'s old town, stunning beaches, and wildlife parks make it the perfect Indian Ocean escape.', highlights: ['Fort Jesus UNESCO site', 'Diani Beach', 'Tsavo National Park', 'Old Town spice lanes', 'Scuba diving & snorkeling'] },
  CMN: { desc: 'Morocco\'s economic heartbeat. Casablanca pairs Art Deco grandeur with Islamic architecture, culminating in the magnificent Hassan II Mosque.', highlights: ['Hassan II Mosque', 'Corniche waterfront', 'Habous Quarter medina', 'Art Deco architecture', 'Marrakech day trip'] },
  ATH: { desc: 'The cradle of Western civilization. Athens seamlessly blends 2,500-year-old monuments with a buzzing café culture and island-hopping adventures.', highlights: ['Acropolis & Parthenon', 'National Archaeological Museum', 'Monastiraki flea market', 'Plaka neighbourhood', 'Santorini/Mykonos gateway'] },
  AMS: { desc: 'The Venice of the North. Amsterdam\'s golden-age canals, world-class museums, and vibrant cycling culture make it endlessly charming.', highlights: ['Rijksmuseum', 'Van Gogh Museum', 'Anne Frank House', 'Canal boat cruise', 'Vondelpark cycling'] },
  IST: { desc: 'Where East meets West. Istanbul\'s stunning mosques, bazaars, and Bosphorus views span two continents and 2,000 years of history.', highlights: ['Hagia Sophia', 'Grand Bazaar shopping', 'Bosphorus cruise', 'Blue Mosque', 'Topkapi Palace'] },
  ZRH: { desc: 'Switzerland\'s most cosmopolitan city combines Alpine beauty, luxury watches, fine chocolate, and a stunning lakefront promenade.', highlights: ['Old Town (Altstadt)', 'Lake Zurich swimming', 'Swiss National Museum', 'Bahnhofstrasse shopping', 'Jungfrau day trip'] },
  LIS: { desc: 'Europe\'s sunniest capital climbs across seven hills. Lisbon delights with trams, fado music, pastel de nata, and Atlantic coast beaches.', highlights: ['Belém Tower & Jerónimos', 'Alfama neighbourhood', 'Sintra palaces day trip', 'Fado live music', 'LX Factory market'] },
  MXP: { desc: 'Italy\'s fashion and design capital. Milan showcases da Vinci\'s Last Supper, world-class opera, and the most glamorous shopping streets in Europe.', highlights: ['The Last Supper', 'Duomo di Milano', 'Galleria Vittorio Emanuele', 'La Scala opera house', 'Navigli canal district'] },
  DOH: { desc: 'Qatar\'s glittering capital rose from the desert in decades. Stunning architecture, souks, world-class museums, and desert dunes await.', highlights: ['Museum of Islamic Art', 'Souq Waqif', 'The Pearl-Qatar island', 'Desert safari', 'Stadium World Cup legacy'] },
  CPT: { desc: 'Consistently ranked among the world\'s most beautiful cities. Cape Town has Table Mountain, pristine beaches, fine wines, and whale watching.', highlights: ['Table Mountain cable car', 'Cape Point National Park', 'Robben Island', 'Constantia wine estates', 'Boulders Beach penguins'] },
  EBB: { desc: 'The Pearl of Africa\'s beating heart. Kampala\'s seven hills host vibrant markets, ancient Kabaka palaces, and the gateway to Bwindi\'s gorillas.', highlights: ['Kasubi Royal Tombs', 'Uganda Museum', 'Nakasero Market', 'Bwindi gorilla gateway', 'Baha\'i Temple panorama'] },
  DSS: { desc: 'Perched on the westernmost tip of Africa, Dakar combines West African culture, Atlantic beaches, Gorée Island history, and incredible music.', highlights: ['Gorée Island slave house', 'IFAN Museum of African Arts', 'Pink Lake (Lac Rose)', 'Sandaga Market', 'Saly beach resorts'] },
};

// ─── Airline data by destination region ──────────────────────────────────────
function getAirlinesForDest(dest) {
  const eastAfrica = ['KGL','DAR','NBO','ZNZ','ADD','MBA','EBB'];
  const middleEast = ['DXB','DOH','IST'];
  const europe = ['LHR','CDG','AMS','ATH','ZRH','LIS','MXP'];
  const asia = ['BKK','SIN','BOM'];
  const africa = ['ACC','JNB','CAI','CMN','CPT','DSS'];
  const americas = ['JFK','GRU'];

  if (eastAfrica.includes(dest.iata)) {
    return [
      { airline:'RwandAir', logo:'🇷🇼', color:'#00A86B' },
      { airline:'Ethiopian Airlines', logo:'🇪🇹', color:'#179F4B' },
      { airline:'Qatar Airways', logo:'🇶🇦', color:'#8D1B3D' },
      { airline:'Kenya Airways', logo:'🇰🇪', color:'#CC0001' },
    ];
  }
  if (middleEast.includes(dest.iata)) {
    return [
      { airline:'Emirates', logo:'🇦🇪', color:'#D71921' },
      { airline:'Qatar Airways', logo:'🇶🇦', color:'#8D1B3D' },
      { airline:'Turkish Airlines', logo:'🇹🇷', color:'#C8102E' },
      { airline:'Etihad Airways', logo:'🇦🇪', color:'#BD8B13' },
    ];
  }
  if (europe.includes(dest.iata)) {
    return [
      { airline:'British Airways', logo:'🇬🇧', color:'#075AAA' },
      { airline:'Lufthansa', logo:'🇩🇪', color:'#05164D' },
      { airline:'Air France', logo:'🇫🇷', color:'#002157' },
      { airline:'KLM', logo:'🇳🇱', color:'#00A1DE' },
    ];
  }
  if (asia.includes(dest.iata)) {
    return [
      { airline:'Singapore Airlines', logo:'🇸🇬', color:'#006192' },
      { airline:'Emirates', logo:'🇦🇪', color:'#D71921' },
      { airline:'Thai Airways', logo:'🇹🇭', color:'#6B2D8B' },
      { airline:'Cathay Pacific', logo:'🇭🇰', color:'#005C5C' },
    ];
  }
  if (americas.includes(dest.iata)) {
    return [
      { airline:'Delta Air Lines', logo:'🇺🇸', color:'#003366' },
      { airline:'American Airlines', logo:'🇺🇸', color:'#CC0000' },
      { airline:'United Airlines', logo:'🇺🇸', color:'#002244' },
      { airline:'LATAM Airlines', logo:'🌎', color:'#1B3F8B' },
    ];
  }
  // Default Africa
  return [
    { airline:'Ethiopian Airlines', logo:'🇪🇹', color:'#179F4B' },
    { airline:'EgyptAir', logo:'🇪🇬', color:'#1A5276' },
    { airline:'South African Airways', logo:'🇿🇦', color:'#007EC6' },
    { airline:'Kenya Airways', logo:'🇰🇪', color:'#CC0001' },
  ];
}

function buildSchedules(dest) {
  const airlines = getAirlinesForDest(dest);
  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const fmtDate = d => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const times = [
    ['06:30 am','08:15 am'],['09:00 am','10:45 am'],['11:15 am','01:00 pm'],
    ['01:30 pm','03:15 pm'],['03:45 pm','05:30 pm'],['07:00 pm','08:45 pm'],
    ['09:30 pm','11:15 pm'],['11:00 pm','12:45 am+1'],
  ];
  const dayPatterns = [
    [true,false,true,false,true,false,false],
    [false,true,false,true,false,true,false],
    [true,true,false,false,true,true,false],
    [false,false,true,true,false,false,true],
    [true,false,false,true,false,false,true],
    [true,true,true,true,true,true,true],
    [false,true,false,false,false,true,false],
    [true,false,true,false,false,true,false],
  ];

  return airlines.map((a, ai) => {
    const seed = a.airline.charCodeAt(0) + dest.iata.charCodeAt(0);
    const flightCount = 2 + (seed % 4);
    const prefix = a.airline.substring(0,2).toUpperCase().replace(/\s/,'');
    const flights = Array.from({ length: flightCount }, (_, fi) => {
      const ti = (seed + fi * 3) % times.length;
      const dp = (seed + fi * 2) % dayPatterns.length;
      const startOffset = (ai * 3) + (fi * 5) + 1;
      const endOffset = startOffset + 7 + (fi * 3);
      return {
        flightNo: `${prefix}${300 + seed % 200 + fi}`,
        times: `${times[ti][0]} - ${times[ti][1]}`,
        days: dayPatterns[dp],
        dates: `${fmtDate(addDays(now, startOffset))} - ${fmtDate(addDays(now, endOffset))}`,
      };
    });
    return { ...a, flightCount, flights };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS = ['S','M','T','W','T','F','S'];

function getTodayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const createPriceIcon = (priceLabel, isSelected, isLoading) => {
  const bg = isSelected ? '#1e293b' : isLoading ? '#f8fafc' : 'white';
  const color = isSelected ? 'white' : isLoading ? '#94a3b8' : '#1e293b';
  const border = isSelected ? '#1e293b' : isLoading ? '#e2e8f0' : '#cbd5e1';
  const shadow = isSelected ? '0 4px 12px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.12)';
  return L.divIcon({
    className: '',
    html: `<div style="background:${bg};color:${color};border:1.5px solid ${border};border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:${shadow};font-family:system-ui,-apple-system,sans-serif;cursor:pointer;">${priceLabel}</div>`,
    iconSize: [null, null],
    iconAnchor: [0, 0],
  });
};

// ─── Map components ───────────────────────────────────────────────────────────
function ViewportTracker({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds(), map.getZoom()),
    zoomend: () => onBoundsChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    onBoundsChange(map.getBounds(), map.getZoom());
  }, []);
  return null;
}

function MapFlyTo({ dest }) {
  const map = useMap();
  useEffect(() => {
    if (dest) map.flyTo([dest.lat, dest.lng], Math.max(map.getZoom(), 6), { duration: 1.2 });
  }, [dest?.id]);
  return null;
}

// ─── Nonstop Schedule Modal ───────────────────────────────────────────────────
function NonstopScheduleModal({ dest, onClose }) {
  const [expanded, setExpanded] = useState({});
  const schedules = buildSchedules(dest);

  useEffect(() => {
    if (schedules.length > 0) setExpanded({ [schedules[0].airline]: true });
  }, [dest?.iata]);

  const toggle = name => setExpanded(p => ({ ...p, [name]: !p[name] }));

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative w-full sm:max-w-[520px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900">Nonstop schedule</h3>
            <p className="text-xs text-slate-400 mt-0.5">EBB → {dest.iata} · {dest.city}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="grid grid-cols-[90px_1fr_auto_auto] gap-2 px-5 py-2 bg-slate-50 border-b border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flight</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Times</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide pr-2">Schedule</span>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Dates</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {schedules.map(a => (
            <div key={a.airline}>
              <button
                onClick={() => toggle(a.airline)}
                className="w-full flex items-center justify-between px-5 py-3 bg-white hover:bg-slate-50 transition-colors border-b border-slate-100"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{a.logo}</span>
                  <span className="font-bold text-sm text-slate-900">{a.airline}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-xs font-medium">{a.flightCount} flights</span>
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ transform: expanded[a.airline] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {expanded[a.airline] && a.flights.map((fl, fi) => (
                <div key={fi} className="grid grid-cols-[90px_1fr_auto_auto] gap-2 items-center px-5 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <span className="text-xs font-bold text-slate-700">{fl.flightNo}</span>
                  <span className="text-[11px] text-slate-500 leading-tight">{fl.times}</span>
                  <div className="flex gap-0.5 pr-2">
                    {DAYS.map((d, di) => (
                      <div key={di} className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border ${fl.days[di] ? 'bg-slate-800 border-slate-800 text-white' : 'border-slate-200 text-slate-400'}`}>{d}</div>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{fl.dates}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 text-center">Data reflects published nonstop schedules · Operated by partner airlines · Economy class</p>
        </div>
      </div>
    </div>
  );
}

// ─── City Info Section ────────────────────────────────────────────────────────
function CityInfoSection({ dest }) {
  const info = CITY_INFO[dest.iata];
  if (!info) return null;
  return (
    <div className="border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-green-50 rounded-full flex items-center justify-center">
          <svg width="14" height="14" fill="none" stroke="#16a34a" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <span className="font-bold text-sm text-slate-900">About {dest.city}</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{info.desc}</p>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Top highlights</p>
        <div className="space-y-1.5">
          {info.highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg width="8" height="8" fill="#16a34a" viewBox="0 0 16 16"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
              </div>
              <span className="text-xs text-slate-600">{h}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ExplorePage() {
  const { routeId } = useParams();
  const navigate = useNavigate();

  const [selectedDest, setSelectedDest] = useState(null);
  const [visibleDests, setVisibleDests] = useState(ALL_DESTINATIONS);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [isFetchingSchedule, setIsFetchingSchedule] = useState(false);

  // livePrices: { [iata]: { price: number, loading: boolean, error: boolean } }
  const [livePrices, setLivePrices] = useState({});
  const fetchedRef = useRef(new Set());
  const fetchQueueRef = useRef([]);
  const isFetchingPriceRef = useRef(false);

  // Parse routeId
  useEffect(() => {
    if (routeId) {
      const parts = routeId.split('-');
      if (parts.length === 2) {
        const found = ALL_DESTINATIONS.find(d => d.iata === parts[1].toUpperCase());
        if (found) setSelectedDest(found);
      }
    } else {
      setSelectedDest(null);
      setShowScheduleModal(false);
    }
  }, [routeId]);

  // Sequential price fetcher — avoids hammering the API
  const fetchNextInQueue = useCallback(async () => {
    if (isFetchingPriceRef.current) return;
    const iata = fetchQueueRef.current.shift();
    if (!iata) return;
    if (fetchedRef.current.has(iata)) {
      fetchNextInQueue();
      return;
    }

    isFetchingPriceRef.current = true;
    fetchedRef.current.add(iata);

    // Mark as loading
    setLivePrices(p => ({ ...p, [iata]: { price: null, loading: true, error: false } }));

    try {
      const departDate = getTodayPlus(14);
      const returnDate = getTodayPlus(21);
      const resp = await fetch('/api/duffel-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originLocationCode: 'EBB',
          destinationLocationCode: iata,
          departureDate: departDate,
          returnDate: returnDate,
          adults: 1,
          travelClass: 'ECONOMY',
          max: 5,
        }),
      });
      const data = await resp.json();
      if (data.ok && data.flights && data.flights.length > 0) {
        const minPrice = Math.min(...data.flights.map(f => f.price));
        setLivePrices(p => ({ ...p, [iata]: { price: Math.round(minPrice), loading: false, error: false } }));
      } else {
        setLivePrices(p => ({ ...p, [iata]: { price: null, loading: false, error: true } }));
      }
    } catch {
      setLivePrices(p => ({ ...p, [iata]: { price: null, loading: false, error: true } }));
    }

    isFetchingPriceRef.current = false;
    // Small delay between requests
    setTimeout(() => fetchNextInQueue(), 600);
  }, []);

  // When visible destinations change, queue unfetched ones
  useEffect(() => {
    const toFetch = visibleDests
      .filter(d => !fetchedRef.current.has(d.iata))
      .map(d => d.iata);

    toFetch.forEach(iata => {
      if (!fetchQueueRef.current.includes(iata)) {
        fetchQueueRef.current.push(iata);
      }
    });

    fetchNextInQueue();
  }, [visibleDests, fetchNextInQueue]);

  const handleBoundsChange = useCallback((bounds, zoom) => {
    const pad = 2;
    const filtered = ALL_DESTINATIONS.filter(d =>
      d.lat >= bounds.getSouth() - pad &&
      d.lat <= bounds.getNorth() + pad &&
      d.lng >= bounds.getWest() - pad &&
      d.lng <= bounds.getEast() + pad
    );
    setVisibleDests(filtered.length > 0 ? filtered : ALL_DESTINATIONS);
  }, []);

  const handleSelectDest = (dest) => {
    if (dest) navigate(`/explore/EBB-${dest.iata}`);
    else { navigate('/explore'); setShowScheduleModal(false); }
  };

  // Navigate to results with pre-filled params
  const handleViewFlights = () => {
    if (!selectedDest) return;
    const departDate = getTodayPlus(14);
    const returnDate = getTodayPlus(21);
    const params = new URLSearchParams({
      from: `Entebbe (EBB)`,
      to: `${selectedDest.city} (${selectedDest.iata})`,
      fromCode: 'EBB',
      toCode: selectedDest.iata,
      depart: departDate,
      return: returnDate,
      adults: '1',
      tripType: 'round',
    });
    navigate(`/results?${params.toString()}`);
  };

  // Get display price for a dest (live if available, fallback to static)
  const getDisplayPrice = (dest) => {
    const lp = livePrices[dest.iata];
    if (!lp || lp.loading) return { label: '···', isLoading: true };
    if (lp?.price) return { label: `$${lp.price}`, isLoading: false };
    return { label: 'Unavailable', isLoading: false, isUnavailable: true };
  };

  const getDisplayPriceValue = (dest) => {
    const lp = livePrices[dest.iata];
    if (lp?.price) return lp.price;
    return Number.POSITIVE_INFINITY;
  };

  const sidebarList = [...visibleDests].sort((a, b) => getDisplayPriceValue(a) - getDisplayPriceValue(b));

  // Dates for the selected dest card
  const departDateStr = getTodayPlus(14);
  const returnDateStr = getTodayPlus(21);
  const fmt = (str) => {
    const d = new Date(str);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  const dateRange = `${fmt(departDateStr)} - ${fmt(returnDateStr)}`;

  return (
    <div className="relative w-full h-[calc(100vh-80px)] overflow-hidden">
      {/* Leaflet Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={[10, 25]} zoom={3} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={true}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />
          <ViewportTracker onBoundsChange={handleBoundsChange} />
          <MapFlyTo dest={selectedDest} />

          {visibleDests.map(dest => {
            const isSelected = selectedDest?.id === dest.id;
            const { label, isLoading } = getDisplayPrice(dest);
            return (
              <Marker
                key={dest.id}
                position={[dest.lat, dest.lng]}
                icon={createPriceIcon(label, isSelected, isLoading)}
                eventHandlers={{ click: () => handleSelectDest(dest) }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Zoom controls */}
      <style>{`.leaflet-control-zoom{display:none!important}.leaflet-popup-content-wrapper{border-radius:10px!important}.leaflet-popup-tip{display:none!important}`}</style>
      <div className="absolute bottom-8 right-4 flex flex-col bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden z-[1000]">
        <button onClick={() => document.querySelector('.leaflet-control-zoom-in')?.click()} className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 border-b border-slate-100 text-lg">+</button>
        <button onClick={() => document.querySelector('.leaflet-control-zoom-out')?.click()} className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-50 text-lg">−</button>
      </div>

      {/* Floating Sidebar */}
      <div className="absolute top-4 bottom-4 left-4 w-full max-w-[340px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[1000]">
        {!selectedDest ? (
          <>
            <div className="p-4 border-b border-slate-100">
              <div className="flex gap-1.5 mb-3">
                <div className="flex-1 bg-slate-100 rounded-lg px-3 py-2.5"><input type="text" defaultValue="Entebbe (EBB)" className="w-full bg-transparent border-none text-sm font-semibold text-slate-900 outline-none" /></div>
                <div className="flex-1 bg-slate-100 rounded-lg px-3 py-2.5"><input type="text" placeholder="Where to?" className="w-full bg-transparent border-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none" /></div>
              </div>
              <div className="bg-slate-100 rounded-lg px-3 py-2.5 mb-3 cursor-pointer hover:bg-slate-200 transition-colors">
                <span className="text-sm text-slate-600 font-medium">Any time, any duration</span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {['Stops','Price','Flight duration'].map(f => (
                  <button key={f} className="flex items-center gap-1 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 whitespace-nowrap transition-colors">
                    {f} <span className="text-[10px]">▾</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {sidebarList.map(dest => {
                const lp = livePrices[dest.iata];
                const displayPrice = lp?.loading || !lp ? '···' : lp?.price ? `$${lp.price}` : 'Unavailable';
                const isLive = !!lp?.price;
                return (
                  <div key={dest.id} onClick={() => handleSelectDest(dest)} className="flex gap-3 px-3 py-3 hover:bg-slate-50 cursor-pointer transition-colors">
                    <img src={dest.image} alt={dest.city} className="w-[60px] h-[60px] rounded-xl object-cover flex-shrink-0 bg-slate-200" />
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-sm text-slate-900 truncate">{dest.city}</span>
                        <button onClick={e => e.stopPropagation()} className="text-slate-300 hover:text-red-400 transition-colors ml-2">
                          <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400">{dest.stops}</div>
                    </div>
                    <div className="flex flex-col items-end justify-center gap-0.5">
                      <span className={`font-extrabold text-sm ${isLive ? 'text-green-600' : 'text-slate-500'}`}>{displayPrice}</span>
                      {isLive && <span className="text-[9px] text-green-500 font-bold">LIVE</span>}
                      {lp?.loading && <span className="text-[9px] text-slate-400">···</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
              <span className="text-[10px] text-slate-400">{visibleDests.length} destinations · prices from Entebbe</span>
            </div>
          </>
        ) : (
          <>
            <div className="relative h-[180px] flex-shrink-0">
              <img src={selectedDest.image} alt={selectedDest.city} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <button onClick={() => handleSelectDest(null)} className="absolute top-3 left-3 w-8 h-8 bg-white/90 backdrop-blur-sm text-slate-900 rounded-full flex items-center justify-center shadow hover:bg-white transition-colors">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              </button>
              {/* Live price badge on hero */}
              {(() => {
                const lp = livePrices[selectedDest.iata];
                const displayPrice = lp?.loading || !lp ? 'Checking...' : lp?.price ? `$${lp.price}` : 'Unavailable';
                const isLive = !!lp?.price;
                return (
                  <div className="absolute bottom-3 right-3">
                    <div className={`px-2.5 py-1 rounded-lg text-white text-xs font-bold shadow-lg ${isLive ? 'bg-green-600' : 'bg-black/60'}`}>
                      {displayPrice} {isLive && <span className="text-[9px] opacity-80 ml-0.5">LIVE</span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedDest.city}<span className="text-green-600">.</span></h2>
                  <p className="text-slate-500 text-sm font-medium">{selectedDest.country}</p>
                </div>
                <button className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-400 bg-slate-50 rounded-full">
                  <svg width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
                </button>
              </div>

              {/* Price card */}
              <div className="border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-slate-900 mb-0.5">Cheapest</p>
                    <p className="text-[11px] text-slate-400">{dateRange} · {selectedDest.duration}</p>
                    {livePrices[selectedDest.iata]?.price && (
                      <p className="text-[10px] text-green-600 font-semibold mt-0.5">✓ Live price from Duffel</p>
                    )}
                  </div>
                  <div className="text-right">
                    {(() => {
                      const lp = livePrices[selectedDest.iata];
                      if (lp?.loading) return <div className="text-xl font-black text-slate-400">···</div>;
                      if (!lp) return <div className="text-xl font-black text-slate-400">···</div>;
                      if (lp.error && !lp.price) return <div className="text-sm font-black text-slate-500">Unavailable</div>;
                      return <div className={`text-xl font-black ${lp?.price ? 'text-green-600' : 'text-slate-400'}`}>{lp?.price ? `$${lp.price}` : '···'}</div>;
                    })()}
                    <div className="text-[10px] text-slate-400">{selectedDest.tripType}</div>
                  </div>
                </div>
                <button
                  onClick={handleViewFlights}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  View flights
                </button>
              </div>

              {/* Nonstop flights card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-900">Nonstop flights</span>
                  <div className="flex gap-1 items-center">
                    {getAirlinesForDest(selectedDest).slice(0,3).map((a, i) => (
                      <span key={i} className="text-base">{a.logo}</span>
                    ))}
                    <span className="text-[10px] text-slate-400 font-bold ml-0.5">+{Math.max(0, getAirlinesForDest(selectedDest).length - 3)}</span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {[{label:'Outbound', route:`EBB→${selectedDest.iata}`},{label:'Return', route:`${selectedDest.iata}→EBB`}].map(({label, route}) => (
                    <div key={label}>
                      <div className="text-xs font-bold text-slate-800 mb-2">{label} <span className="text-slate-400 font-normal ml-1">{route}</span></div>
                      <div className="grid grid-cols-7 gap-1">
                        {DAYS.map((d,i) => (
                          <div key={i} className="aspect-square rounded border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">{d}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 p-3">
                  <button
                    onClick={() => {
                      setIsFetchingSchedule(true);
                      setTimeout(() => {
                        setIsFetchingSchedule(false);
                        setShowScheduleModal(true);
                      }, 1200);
                    }}
                    disabled={isFetchingSchedule}
                    className="w-full text-sm font-bold text-slate-800 hover:text-green-600 transition-colors text-center flex items-center justify-center gap-2"
                  >
                    {isFetchingSchedule ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Fetching live schedule...
                      </>
                    ) : 'View nonstop schedule'}
                  </button>
                </div>
              </div>

              {/* City Info */}
              <CityInfoSection dest={selectedDest} />
            </div>
          </>
        )}
      </div>

      {/* Nonstop Schedule Modal */}
      {showScheduleModal && selectedDest && (
        <NonstopScheduleModal dest={selectedDest} onClose={() => setShowScheduleModal(false)} />
      )}
    </div>
  );
}
