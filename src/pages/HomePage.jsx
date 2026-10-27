import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { FlightFooter } from '../components/FlightFooter.jsx';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import LocalEventCard from '../components/LocalEventCard.jsx';
import { getGeo, countryFlag, countryNameFromCode, countryCodeFromName, setGeoOverride, clearGeoOverride } from '../lib/geo.js';

const FLIGHT_SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/bookingcart.js?v=4','/js/deals.js?v=1'];

const HERO_IMAGES = [
  '/images/hero-bg.jpg',
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2073&auto=format&fit=crop'
];

const FAQ_ITEMS = [
  [
    {
      q: "How do I find the cheapest flights on BookingCart?",
      a: "You can easily find the cheapest flights on BookingCart by sorting by 'Lowest Price', filtering by your budget, and looking for our orange 'Hot Deal' badge, which highlights flights with exceptional discounts."
    },
    {
      q: "Can I book one-way flights on BookingCart?",
      a: "Yes, you can book one-way, round-trip, or multi-city flights on BookingCart. Simply select the 'One-Way Trip' or 'Round Trip' tab at the top of the search panel before hitting search."
    },
    {
      q: "How far in advance can I book a flight?",
      a: "You can book flights up to 1 year (365 days) in advance on BookingCart. Planning ahead usually gives you access to the best prices and seat availability."
    }
  ],
  [
    {
      q: "Do flights get cheaper closer to departure?",
      a: "Generally, flight prices tend to increase as the departure date gets closer. Booking at least 3 to 4 weeks in advance is highly recommended to secure the best rates."
    },
    {
      q: "What is a flexible ticket?",
      a: "A flexible ticket allows you to change your flight date or time with the same airline without paying any change fees. You only need to pay the fare difference if the new flight is more expensive."
    },
    {
      q: "Does BookingCart charge credit card fees?",
      a: "No, BookingCart does not charge credit card fees, hidden payment fees, or service fees. The price you see at checkout is the final price you will pay."
    }
  ]
];

// Region-aware stays deals — keyed by broad region detected from IP geolocation
const STAYS_DEALS_BY_REGION = {
  'east-africa': [
    { city: 'Nairobi',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', duration: '1h 20m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$62' },
    { city: 'Zanzibar',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Flag_of_Zanzibar.svg/960px-Flag_of_Zanzibar.svg.png', duration: '2h 05m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$89' },
    { city: 'Kigali',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg/960px-High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg', duration: '1h 10m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$74' },
    { city: 'Dar es Salaam', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/St_Joseph%27s_Catholic_Cathedral_%2834895613805%29.jpg/960px-St_Joseph%27s_Catholic_Cathedral_%2834895613805%29.jpg', duration: '1h 45m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$95' },
    { city: 'Mombasa',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Mombasa_Island.jpg/960px-Mombasa_Island.jpg', duration: '1h 30m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$58' },
  ],
  'west-africa': [
    { city: 'Accra',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Acca.jpg/960px-Acca.jpg', duration: '1h 00m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$55' },
    { city: 'Lagos',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Tafa_Balewa_Square_%28Onikan%29_in_Lagos._Nigeria.jpg/960px-Tafa_Balewa_Square_%28Onikan%29_in_Lagos._Nigeria.jpg', duration: '1h 20m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$79' },
    { city: 'Abuja',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Abuja_heritages_30.jpg/960px-Abuja_heritages_30.jpg', duration: '0h 55m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$68' },
    { city: 'Dubai',      img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg',    duration: '6h 30m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$197' },
    { city: 'London',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg',    duration: '6h 45m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$185' },
  ],
  'southern-africa': [
    { city: 'Cape Town',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Camps_bay_%2853460319478%29_%28cropped%29.jpg/960px-Camps_bay_%2853460319478%29_%28cropped%29.jpg',    duration: '2h 10m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$88' },
    { city: 'Durban',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Durban_from_the_Balcony_%28Dennis_Sylvester_Hurd%29_1.jpg/960px-Durban_from_the_Balcony_%28Dennis_Sylvester_Hurd%29_1.jpg',    duration: '1h 05m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$65' },
    { city: 'Nairobi',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg',   duration: '3h 40m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$112' },
    { city: 'Dubai',      img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg',    duration: '7h 20m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$175' },
    { city: 'Mauritius',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Flag_of_Mauritius.svg/960px-Flag_of_Mauritius.svg.png',   duration: '4h 00m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$142' },
  ],
  'middle-east': [
    { city: 'Istanbul',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Historical_peninsula_and_modern_skyline_of_Istanbul.jpg/960px-Historical_peninsula_and_modern_skyline_of_Istanbul.jpg',   duration: '3h 20m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$97' },
    { city: 'Cairo',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Cairo_Opera_House%2C_Al_Hurriyah_Park_and_the_Nile_river_%2814797782354%29.jpg/960px-Cairo_Opera_House%2C_Al_Hurriyah_Park_and_the_Nile_river_%2814797782354%29.jpg',   duration: '2h 45m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$79' },
    { city: 'Muscat',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Al_Alam_Palace.jpg/960px-Al_Alam_Palace.jpg',   duration: '1h 15m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$62' },
    { city: 'Beirut',     img: 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Beyrouth_vue_a%C3%A9rienne.jpg',   duration: '2h 10m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$84' },
    { city: 'London',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg',    duration: '7h 20m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$185' },
  ],
  'south-asia': [
    { city: 'Dubai',      img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg',    duration: '3h 10m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$118' },
    { city: 'Singapore',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Flag_of_Singapore.svg/960px-Flag_of_Singapore.svg.png',    duration: '5h 30m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$142' },
    { city: 'Bangkok',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/4Y1A1159_Bangkok_%2833536795515%29.jpg/960px-4Y1A1159_Bangkok_%2833536795515%29.jpg',   duration: '3h 50m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$99' },
    { city: 'Colombo',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Colombo_city_skyline_at_night.png/960px-Colombo_city_skyline_at_night.png',   duration: '1h 45m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$75' },
    { city: 'Kathmandu',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Kathmandu-Durbar_Square-06-Mahavishnu-Kuh-Vishnu-Pratapamalla-Jagannath-2007-gje.jpg/960px-Kathmandu-Durbar_Square-06-Mahavishnu-Kuh-Vishnu-Pratapamalla-Jagannath-2007-gje.jpg',  duration: '1h 30m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$68' },
  ],
  'southeast-asia': [
    { city: 'Bali',       img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Bali_in_Indonesia_%28special_marker%29.svg/960px-Bali_in_Indonesia_%28special_marker%29.svg.png',   duration: '2h 20m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$88' },
    { city: 'Bangkok',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/4Y1A1159_Bangkok_%2833536795515%29.jpg/960px-4Y1A1159_Bangkok_%2833536795515%29.jpg',   duration: '1h 30m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$72' },
    { city: 'Tokyo',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/960px-Skyscrapers_of_Shinjuku_2009_January.jpg',   duration: '7h 10m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$162' },
    { city: 'Hong Kong',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Flag_of_Hong_Kong.svg/960px-Flag_of_Hong_Kong.svg.png',  duration: '3h 00m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$104' },
    { city: 'Sydney',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Sydney_Opera_House_and_Harbour_Bridge_Dusk_%282%29_2019-06-21.jpg/960px-Sydney_Opera_House_and_Harbour_Bridge_Dusk_%282%29_2019-06-21.jpg',   duration: '8h 00m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$189' },
  ],
  'europe': [
    { city: 'Paris',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg',    duration: '1h 30m, non-stop', dates: 'Thu 7/2 → Mon 7/6',   price: '$87' },
    { city: 'Barcelona',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Aerial_view_of_Barcelona%2C_Spain_%2851227309370%29_edited.jpg/960px-Aerial_view_of_Barcelona%2C_Spain_%2851227309370%29_edited.jpg',  duration: '2h 10m, non-stop', dates: 'Thu 7/2 → Sun 7/5',   price: '$112' },
    { city: 'Amsterdam',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png/960px-Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png', duration: '1h 15m, non-stop', dates: 'Fri 7/11 → Mon 7/14', price: '$94' },
    { city: 'Rome',       img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/960px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg',  duration: '2h 30m, non-stop', dates: 'Tue 7/14 → Tue 7/21', price: '$109' },
    { city: 'Prague',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Prague_%286365119737%29.jpg/960px-Prague_%286365119737%29.jpg',  duration: '1h 50m, non-stop', dates: 'Fri 7/11 → Mon 7/14', price: '$78' },
  ],
  'north-america': [
    { city: 'Cancun',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Cancun_Strand_Luftbild_%2822143397586%29.jpg/960px-Cancun_Strand_Luftbild_%2822143397586%29.jpg',  duration: '3h 10m, non-stop', dates: 'Mon 7/7 → Fri 7/11',  price: '$142' },
    { city: 'Miami',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Villa_Vizcaya_20110228.jpg/960px-Villa_Vizcaya_20110228.jpg',    duration: '2h 45m, non-stop', dates: 'Thu 7/10 → Mon 7/14', price: '$128' },
    { city: 'Las Vegas',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Las_Vegas_from_above_%2840064746644%29.jpg/960px-Las_Vegas_from_above_%2840064746644%29.jpg',   duration: '4h 00m, non-stop', dates: 'Fri 7/11 → Sun 7/13',  price: '$159' },
    { city: 'New York',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg',   duration: '5h 20m, non-stop', dates: 'Sat 7/12 → Wed 7/16', price: '$173' },
    { city: 'Toronto',    img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Toronto_Skyline_from_Snake_Island%2C_February_28_2026_%2808%29.jpg/960px-Toronto_Skyline_from_Snake_Island%2C_February_28_2026_%2808%29.jpg',  duration: '1h 30m, non-stop', dates: 'Sun 7/13 → Thu 7/17',  price: '$89' },
  ],
  'default': [
    { city: 'Brussels',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Grand_Place_Bruselas_2.jpg/960px-Grand_Place_Bruselas_2.jpg', duration: '1h 39m, non-stop', dates: 'Thu 7/2 → Mon 7/6',   price: '$87' },
    { city: 'Salzburg',   img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Salzburg_%2848489551981%29.jpg/960px-Salzburg_%2848489551981%29.jpg', duration: '1h 40m, non-stop', dates: 'Thu 7/2 → Sun 7/5',   price: '$154' },
    { city: 'Paris',      img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg',   duration: '1h 30m, non-stop', dates: 'Thu 7/2 → Mon 7/6',   price: '$172' },
    { city: 'Berlin',     img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg/960px-Museumsinsel_Berlin_Juli_2021_1_%28cropped%29_b.jpg',    duration: '1h 25m, non-stop', dates: 'Tue 7/14 → Tue 7/21',  price: '$172' },
    { city: 'Amsterdam',  img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png/960px-Imagen_de_los_canales_conc%C3%A9ntricos_en_%C3%81msterdam.png', duration: '1h 15m, non-stop', dates: 'Fri 7/11 → Mon 7/14', price: '$189' },
  ],
};

// Popular cities to explore — keyed by ISO-2 country code
// Each country shows only its own cities with real verified location photos
const EXPLORE_CITIES_BY_COUNTRY = {
  // Uganda user → all Uganda cities with real verified photos
  UG: [
    { city: 'Kampala',     flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg', props: '2,289' },
    { city: 'Entebbe',    flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Entebbe_Aerial_view.jpg/960px-Entebbe_Aerial_view.jpg', props: '335' },
    { city: 'Mbarara',    flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Mbarara_at_Sundown.jpg/960px-Mbarara_at_Sundown.jpg', props: '72' },
    { city: 'Fort Portal', flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Crater_Lake_nestled_in_Fort_Portal_01.jpg/960px-Crater_Lake_nestled_in_Fort_Portal_01.jpg', props: '101' },
    { city: 'Jinja',      flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/River_Nile%2C_Jinja%2C_Uganda_3.jpg/960px-River_Nile%2C_Jinja%2C_Uganda_3.jpg', props: '89' },
    { city: 'Kabale',     flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Bunyonyi_Safaris_Resort_in_Kabale_District_near_Lake_Bunyonyi_01.jpg/960px-Bunyonyi_Safaris_Resort_in_Kabale_District_near_Lake_Bunyonyi_01.jpg', props: '46' },
    { city: 'Gulu',       flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Gulu_city.jpg/960px-Gulu_city.jpg', props: '38' },
  ],
  // Kenya user → Nairobi + Kampala, Mombasa, Dubai, Zanzibar
  KE: [
    { city: 'Nairobi',   flag: '🇰🇪', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', props: '5,120' },
    { city: 'Kampala',   flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg', props: '2,289' },
    { city: 'Mombasa',   flag: '🇰🇪', img: 'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=800&q=85', props: '1,480' },
    { city: 'Dubai',     flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'Zanzibar',  flag: '🇹🇿', img: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=800&q=85', props: '1,540' },
  ],
  // Tanzania user → Dar es Salaam + Zanzibar, Nairobi, Dubai, Cape Town
  TZ: [
    { city: 'Dar es Salaam', flag: '🇹🇿', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/St_Joseph%27s_Catholic_Cathedral_%2834895613805%29.jpg/960px-St_Joseph%27s_Catholic_Cathedral_%2834895613805%29.jpg', props: '3,200' },
    { city: 'Zanzibar',     flag: '🇹🇿', img: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=800&q=85', props: '1,540' },
    { city: 'Nairobi',      flag: '🇰🇪', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', props: '5,120' },
    { city: 'Dubai',        flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'Cape Town',    flag: '🇿🇦', img: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&q=85', props: '12,000' },
  ],
  // Rwanda user → Kigali + Kampala, Nairobi, Dubai, London
  RW: [
    { city: 'Kigali',  flag: '🇷🇼', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg/960px-High_Angle_View_Of_Kigali_City_Street_on_November_29%2C_2018._Emmanuel_Kwizera.jpg', props: '1,200' },
    { city: 'Kampala', flag: '🇺🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg', props: '2,289' },
    { city: 'Nairobi', flag: '🇰🇪', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', props: '5,120' },
    { city: 'Dubai',   flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'London',  flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
  ],
  // Nigeria user → Lagos + Abuja, Accra, Dubai, London
  NG: [
    { city: 'Lagos',  flag: '🇳🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lagos-centre-from-executive-lounge-Continental-hotel-2026-IMG_7970.jpg', props: '8,400' },
    { city: 'Abuja',  flag: '🇳🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Abuja_heritages_30.jpg/960px-Abuja_heritages_30.jpg', props: '3,100' },
    { city: 'Accra',  flag: '🇬🇭', img: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Acca.jpg', props: '4,500' },
    { city: 'Dubai',  flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'London', flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
  ],
  // Ghana user → Accra + Lagos, Kumasi, Dubai, London
  GH: [
    { city: 'Accra',  flag: '🇬🇭', img: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Acca.jpg', props: '4,500' },
    { city: 'Lagos',  flag: '🇳🇬', img: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lagos-centre-from-executive-lounge-Continental-hotel-2026-IMG_7970.jpg', props: '8,400' },
    { city: 'Kumasi', flag: '🇬🇭', img: 'https://images.unsplash.com/photo-1504439904031-93ded9f93e4e?w=800&q=85', props: '1,100' },
    { city: 'Dubai',  flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'London', flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
  ],
  // South Africa user → Cape Town + Johannesburg, Dubai, London, Nairobi
  ZA: [
    { city: 'Cape Town',    flag: '🇿🇦', img: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&q=85', props: '12,000' },
    { city: 'Johannesburg', flag: '🇿🇦', img: 'https://images.unsplash.com/photo-1577948000111-9c970dfe1ac5?w=800&q=85', props: '9,800' },
    { city: 'Dubai',        flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'London',       flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
    { city: 'Nairobi',      flag: '🇰🇪', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', props: '5,120' },
  ],
  // UK user → London + Manchester, Dubai, New York, Paris
  GB: [
    { city: 'London',     flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
    { city: 'Manchester', flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Tower_Blocks_over_Knott_Mill%2C_geograph_6866152_by_David_Dixon.jpg/960px-Tower_Blocks_over_Knott_Mill%2C_geograph_6866152_by_David_Dixon.jpg', props: '8,200' },
    { city: 'Dubai',      flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'New York',   flag: '🇺🇸', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg', props: '82,000' },
    { city: 'Paris',      flag: '🇫🇷', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg', props: '38,000' },
  ],
  // USA user → New York + LA, Cancún, London, Paris
  US: [
    { city: 'New York',    flag: '🇺🇸', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg', props: '82,000' },
    { city: 'Los Angeles', flag: '🇺🇸', img: 'https://images.unsplash.com/photo-1580655653885-65763b2597d0?w=800&q=85', props: '54,000' },
    { city: 'Cancún',      flag: '🇲🇽', img: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=85', props: '8,200' },
    { city: 'London',      flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
    { city: 'Paris',       flag: '🇫🇷', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg', props: '38,000' },
  ],
  // India user → Mumbai + Goa, Dubai, Bangkok, Singapore
  IN: [
    { city: 'Mumbai',    flag: '🇮🇳', img: 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=800&q=85', props: '32,000' },
    { city: 'Goa',       flag: '🇮🇳', img: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?w=800&q=85', props: '14,000' },
    { city: 'Dubai',     flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'Bangkok',   flag: '🇹🇭', img: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&q=85', props: '18,000' },
    { city: 'Singapore', flag: '🇸🇬', img: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=85', props: '9,800' },
  ],
  // UAE user → Dubai + Abu Dhabi, London, Mumbai, Cairo
  AE: [
    { city: 'Dubai',     flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'Abu Dhabi', flag: '🇦🇪', img: 'https://images.unsplash.com/photo-1512632578888-169bbbc64f33?w=800&q=85', props: '8,500' },
    { city: 'London',    flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
    { city: 'Mumbai',    flag: '🇮🇳', img: 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=800&q=85', props: '32,000' },
    { city: 'Cairo',     flag: '🇪🇬', img: 'https://images.unsplash.com/photo-1553913861-c0fddf2619ee?w=800&q=85', props: '11,000' },
  ],
  // Fallback for unrecognised countries
  default: [
    { city: 'Dubai',    flag: '🇦🇪', img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', props: '24,000' },
    { city: 'London',   flag: '🇬🇧', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', props: '45,000' },
    { city: 'Paris',    flag: '🇫🇷', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/960px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg', props: '38,000' },
    { city: 'Nairobi',  flag: '🇰🇪', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Nairobi_skyline_from_Gem_Hotel.jpg/960px-Nairobi_skyline_from_Gem_Hotel.jpg', props: '5,120' },
    { city: 'New York', flag: '🇺🇸', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg', props: '82,000' },
  ],
};
// Country-level hero images and flags for the first bento tile
const COUNTRY_HERO = {
  // Uganda: Murchison Falls — verified Wikipedia Commons ✅ 200
  UG: { img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Murchison_Falls%2C_Uganda_%2823475021234%29.jpg/960px-Murchison_Falls%2C_Uganda_%2823475021234%29.jpg', flag: '🇺🇬' },
  KE: { img: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=1200&q=85', flag: '🇰🇪' },
  TZ: { img: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=1200&q=85', flag: '🇹🇿' },
  RW: { img: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=85', flag: '🇷🇼' },
  NG: { img: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lagos-centre-from-executive-lounge-Continental-hotel-2026-IMG_7970.jpg', flag: '🇳🇬' },
  GH: { img: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=1200&q=85', flag: '🇬🇭' },
  ZA: { img: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=1200&q=85', flag: '🇿🇦' },
  GB: { img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/London_Skyline_%28125508655%29.jpeg/960px-London_Skyline_%28125508655%29.jpeg', flag: '🇬🇧' },
  US: { img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/960px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg', flag: '🇺🇸' },
  IN: { img: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=1200&q=85', flag: '🇮🇳' },
  AE: { img: 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c7/Burj_Khalifa_2021.jpg/960px-Burj_Khalifa_2021.jpg', flag: '🇦🇪' },
  default: { img: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=85', flag: '🌍' },
};

// Nearby destinations for countries without a curated list above, so the
// "Explore <country>" section never falls back to the same five cities worldwide.
const REGION_HUB_CITIES = {
  'east-africa': ['Kampala', 'Nairobi', 'Kigali', 'Zanzibar', 'Dubai'],
  'west-africa': ['Lagos', 'Accra', 'Abuja', 'Mombasa', 'Dubai'],
  'southern-africa': ['Cape Town', 'Johannesburg', 'Zanzibar', 'Nairobi', 'Dubai'],
  'middle-east': ['Dubai', 'Abu Dhabi', 'Cairo', 'Bangkok', 'London'],
  'south-asia': ['Mumbai', 'Goa', 'Colombo', 'Dubai', 'Singapore'],
  'southeast-asia': ['Bangkok', 'Singapore', 'Hong Kong', 'Sydney', 'Dubai'],
  'europe': ['London', 'Paris', 'Rome', 'Barcelona', 'Amsterdam'],
  'north-america': ['New York', 'Los Angeles', 'Toronto', 'Cancún', 'Miami'],
  'default': ['Dubai', 'London', 'Paris', 'Nairobi', 'New York'],
};

// Every city we already have a verified photo (and property count) for, across all
// datasets, keyed by lower-cased city name.
const CITY_INDEX = (() => {
  const index = new Map();
  const add = (entry) => {
    const city = String(entry?.city || '').trim();
    const key = city.toLowerCase();
    if (!key || index.has(key)) return;
    index.set(key, { city, img: entry.img || '', props: entry.props || '', flag: entry.flag || '' });
  };
  Object.values(EXPLORE_CITIES_BY_COUNTRY).forEach((cities) => cities.forEach(add));
  Object.values(STAYS_DEALS_BY_REGION).forEach((deals) => deals.forEach(add));
  return index;
})();

/**
 * Destinations for the explore section: the curated list when the visitor's country has
 * one, otherwise hubs near their region with their detected (or picked) city first.
 */
function resolveExploreDestinations(countryCode, geo, region) {
  const curated = EXPLORE_CITIES_BY_COUNTRY[countryCode];
  const city = String(geo?.city || '').trim();
  const manual = geo?.source === 'manual';

  const cityTile = (name) => {
    const known = CITY_INDEX.get(name.toLowerCase());
    return {
      city: name,
      flag: countryFlag(countryCode),
      img: known?.img || (COUNTRY_HERO[countryCode] || COUNTRY_HERO['default']).img,
      props: known?.props || '',
      note: known?.props || manual ? '' : 'Near you',
    };
  };

  if (curated) {
    // A hand-picked city must still lead the row, even in a curated country.
    if (!manual || !city) return curated.slice();
    const rest = curated.filter((entry) => entry.city.toLowerCase() !== city.toLowerCase());
    return [{ ...cityTile(city), note: 'Your pick' }, ...rest].slice(0, 5);
  }

  const picked = [];
  const seen = new Set();

  if (city) {
    seen.add(city.toLowerCase());
    picked.push(cityTile(city));
  }

  for (const name of REGION_HUB_CITIES[region] || REGION_HUB_CITIES['default']) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const known = CITY_INDEX.get(key);
    if (!known?.img) continue;
    seen.add(key);
    picked.push({ ...known, note: known.props ? '' : 'Popular stays' });
  }

  return picked.length ? picked.slice(0, 5) : EXPLORE_CITIES_BY_COUNTRY['default'].slice();
}

// Map country code or country name → region key
function getRegionFromCountry(countryCode, countryName) {
  const cc = (countryCode || countryCodeFromName(countryName) || '').toUpperCase();
  const EastAfrica    = ['UG','KE','TZ','RW','BI','ET','SS','DJ','ER','SO','MZ','MG'];
  const WestAfrica    = ['NG','GH','SN','CI','CM','ML','GN','TG','BJ','NE','BF','SL','LR','GM','GW','CV','MR'];
  const SouthAfrica   = ['ZA','ZW','ZM','BW','NA','LS','SZ','AO','MZ'];
  const MiddleEast    = ['SA','AE','QA','KW','BH','OM','JO','LB','SY','IQ','IR','YE','PS','IL'];
  const SouthAsia     = ['IN','PK','BD','LK','NP','BT','MV','AF'];
  const SoutheastAsia = ['TH','SG','MY','ID','PH','VN','MM','KH','LA','BN','TL'];
  const Europe        = ['GB','FR','DE','IT','ES','NL','BE','CH','AT','SE','NO','DK','FI','PT','PL','CZ','HU','RO','GR','IE','HR','SK','BG','SI','EE','LV','LT','LU','MT','CY','IS','AL','BA','ME','RS','MK','MD','BY','UA','GE','AM','AZ'];
  const NorthAmerica  = ['US','CA','MX'];
  if (EastAfrica.includes(cc))    return 'east-africa';
  if (WestAfrica.includes(cc))    return 'west-africa';
  if (SouthAfrica.includes(cc))   return 'southern-africa';
  if (MiddleEast.includes(cc))    return 'middle-east';
  if (SouthAsia.includes(cc))     return 'south-asia';
  if (SoutheastAsia.includes(cc)) return 'southeast-asia';
  if (Europe.includes(cc))        return 'europe';
  if (NorthAmerica.includes(cc))  return 'north-america';
  return 'default';
}

function AttractionsHomeContent() {
  const [featuredEvents, setFeaturedEvents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    fetch('/api/attractions/featured-events')
      .then(res => res.json())
      .then(data => { if (data.ok && data.results) setFeaturedEvents(data.results); })
      .catch(console.error);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) window.location.href = `/attractions?destination=${encodeURIComponent(searchQuery)}`;
  };

  const trendingDestinations = [
    { name: 'Paris', country: 'France', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&q=80&auto=format&fit=crop', count: '1,200+ activities' },
    { name: 'Dubai', country: 'UAE', img: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=400&q=80&auto=format&fit=crop', count: '890+ activities' },
    { name: 'Kampala', country: 'Uganda', img: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg', count: '130+ activities' },
    { name: 'Cape Town', country: 'South Africa', img: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=400&q=80&auto=format&fit=crop', count: '540+ activities' },
    { name: 'Nairobi', country: 'Kenya', img: 'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=400&q=80&auto=format&fit=crop', count: '320+ activities' },
    { name: 'Marrakech', country: 'Morocco', img: 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=400&q=80&auto=format&fit=crop', count: '410+ activities' },
  ];

  const categories = [
    { icon: 'ph-ticket', label: 'Tours & Sightseeing' },
    { icon: 'ph-bank', label: 'Museums & Culture' },
    { icon: 'ph-mountains', label: 'Nature & Parks' },
    { icon: 'ph-confetti', label: 'Theme Parks' },
    { icon: 'ph-fork-knife', label: 'Food & Drink' },
    { icon: 'ph-boat', label: 'Water Activities' },
    { icon: 'ph-castle-turret', label: 'Landmarks' },
    { icon: 'ph-person-simple-ski', label: 'Sports & Adventure' },
    { icon: 'ph-film-strip', label: 'Cinemas' },
    { icon: 'ph-music-notes', label: 'Concerts' },
  ];

  return (
    <div className="bg-white dark:bg-slate-950">



      {/* ── CATEGORY PILLS ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 mb-10">
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {categories.map(cat => (
            <a key={cat.label} href={`/attractions?category=${encodeURIComponent(cat.label)}`}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-slate-300 transition-all whitespace-nowrap bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              <i className={`ph ${cat.icon} text-base`} />
              {cat.label}
            </a>
          ))}
        </div>
      </div>

      {/* ── TRENDING DESTINATIONS ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 mb-14">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Trending destinations</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Most popular places for tours &amp; activities</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {trendingDestinations.map(dest => (
            <a key={dest.name} href={`/attractions?destination=${encodeURIComponent(dest.name)}`}
              className="group rounded-2xl overflow-hidden relative aspect-[3/4] shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 duration-300 block">
              <img src={dest.img} alt={dest.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <p className="text-white font-extrabold text-sm leading-tight">{dest.name}</p>
                <p className="text-white/70 text-xs">{dest.count}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ── LOCAL EVENTS ── */}
      {featuredEvents.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 mb-14">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Local events &amp; experiences</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Book tickets directly for these verified events</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {featuredEvents.map(event => (
              <LocalEventCard key={event.id} item={event} />
            ))}
          </div>
        </div>
      )}

      {/* ── EXPLORE MORE DESTINATIONS ── */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 mb-14">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">Explore more destinations</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Find things to do around the world</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { name: 'Rome', country: 'Italy', img: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=600&q=80&auto=format&fit=crop', count: '530+ activities' },
            { name: 'Amsterdam', country: 'Netherlands', img: 'https://images.unsplash.com/photo-1468657988500-aca2be09f4c6?w=600&q=80&auto=format&fit=crop', count: '380+ activities' },
            { name: 'Istanbul', country: 'Turkey', img: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=600&q=80&auto=format&fit=crop', count: '420+ activities' },
            { name: 'Bangkok', country: 'Thailand', img: 'https://upload.wikimedia.org/wikipedia/commons/7/7d/4Y1A1159_Bangkok_%2833536795515%29.jpg', count: '610+ activities' },
            { name: 'Singapore', country: 'Singapore', img: 'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=600&q=80&auto=format&fit=crop', count: '290+ activities' },
            { name: 'Sydney', country: 'Australia', img: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80&auto=format&fit=crop', count: '460+ activities' },
            { name: 'Cairo', country: 'Egypt', img: 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?w=600&q=80&auto=format&fit=crop', count: '220+ activities' },
            { name: 'Bali', country: 'Indonesia', img: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80&auto=format&fit=crop', count: '340+ activities' },
            { name: 'Lisbon', country: 'Portugal', img: 'https://images.unsplash.com/photo-1548707309-dcebeab9ea9b?w=600&q=80&auto=format&fit=crop', count: '270+ activities' },
            { name: 'Prague', country: 'Czech Republic', img: 'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=600&q=80&auto=format&fit=crop', count: '310+ activities' },
            { name: 'Vienna', country: 'Austria', img: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Schoenbrunn_philharmoniker_2012.jpg', count: '250+ activities' },
            { name: 'Cape Town', country: 'South Africa', img: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=600&q=80&auto=format&fit=crop', count: '180+ activities' },
            // 🌍 Africa
            { name: 'Nairobi', country: 'Kenya', img: 'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=600&q=80&auto=format&fit=crop', count: '320+ activities' },
            { name: 'Marrakech', country: 'Morocco', img: 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=600&q=80&auto=format&fit=crop', count: '410+ activities' },
            { name: 'Accra', country: 'Ghana', img: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/Acca.jpg', count: '150+ activities' },
            { name: 'Zanzibar', country: 'Tanzania', img: 'https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=600&q=80&auto=format&fit=crop', count: '190+ activities' },
            { name: 'Casablanca', country: 'Morocco', img: 'https://images.unsplash.com/photo-1548013146-72479768bada?w=600&q=80&auto=format&fit=crop', count: '170+ activities' },
            { name: 'Lagos', country: 'Nigeria', img: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Lagos-centre-from-executive-lounge-Continental-hotel-2026-IMG_7970.jpg', count: '200+ activities' },
            { name: 'Kampala', country: 'Uganda', img: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Urban_Rising%2C_KAMPALA%2C_Uganda.jpg', count: '130+ activities' },
          ].map(dest => (
            <a
              key={dest.name}
              href={`/attractions?destination=${encodeURIComponent(dest.name)}`}
              className="group flex items-center gap-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-3 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 transition-all duration-200"
            >
              <div className="w-20 h-16 shrink-0 rounded-xl overflow-hidden">
                <img
                  src={dest.img}
                  alt={dest.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate group-hover:text-green-600 transition-colors">{dest.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{dest.country}</p>
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                  <i className="ph ph-ticket text-xs" />{dest.count}
                </p>
              </div>
              <i className="ph ph-arrow-right text-slate-300 dark:text-slate-600 group-hover:text-green-500 group-hover:translate-x-1 transition-all shrink-0" />
            </a>
          ))}
        </div>
      </div>

      {/* ── WHY BOOK WITH US ── */}
      <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-8 text-center">Why book with BookingCart?</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: 'ph-seal-check', title: 'Verified experiences', text: 'Every listing is reviewed by our team before going live.', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
              { icon: 'ph-shield-check', title: 'Secure checkout', text: 'Pay safely with Stripe. Your data is always protected.', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
              { icon: 'ph-clock-countdown', title: 'Instant confirmation', text: 'Get your tickets confirmed immediately after booking.', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
            ].map(item => (
              <div key={item.title} className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 flex gap-4 items-start shadow-sm">
                <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${item.color}`}>
                  <i className={`ph-fill ${item.icon} text-xl`} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white mb-1">{item.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function HomePage() {
  const [recentSearches, setRecentSearches] = useState([]);
  const location = useLocation();
  const [activeMode, setActiveMode] = useState(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'stays') return 'stays';
    if (params.get('mode') === 'attractions') return 'attractions';
    return 'flights';
  }); // 'flights' | 'stays' | 'attractions'

  // Attractions state
  const [attractionsQuery, setAttractionsQuery] = useState('');
  const [attractionsSuggestions, setAttractionsSuggestions] = useState([]);
  const [selectedAttractionsDestination, setSelectedAttractionsDestination] = useState(null);

  useEffect(() => {
    const value = attractionsQuery.trim();
    if (value.length < 2 || value === selectedAttractionsDestination?.name) { setAttractionsSuggestions([]); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/attractions/destinations?q=${encodeURIComponent(value)}`, { signal: controller.signal }).then((response) => response.json()).then((data) => setAttractionsSuggestions(data.results || [])).catch(() => {}), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [attractionsQuery, selectedAttractionsDestination?.name]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'stays') {
      setActiveMode('stays');
    } else if (params.get('mode') === 'attractions') {
      setActiveMode('attractions');
    } else {
      setActiveMode('flights');
    }
  }, [location.search]);

  // Stays search state
  const [staysDestination, setStaysDestination] = useState('');
  const [staysCheckin, setStaysCheckin] = useState('');
  const [staysCheckout, setStaysCheckout] = useState('');
  const [staysGuests, setStaysGuests] = useState(1);
  const [staysRooms, setStaysRooms] = useState(1);
  const [staysGuestOpen, setStaysGuestOpen] = useState(false);
  const [staysDeals, setStaysDeals] = useState(STAYS_DEALS_BY_REGION['default']);
  const [staysDealCity, setStaysDealCity] = useState('');

  // Trending hotels state
  const [trendingHotels, setTrendingHotels] = useState([]);
  const [trendingHotelsCity, setTrendingHotelsCity] = useState('');
  const [trendingHotelsLoading, setTrendingHotelsLoading] = useState(true);

  // Explore destinations state
  const [exploreDestinations, setExploreDestinations] = useState([]);
  const [exploreCountryName, setExploreCountryName] = useState('');
  const [exploreCountryCode, setExploreCountryCode] = useState('');
  const [exploreCountryFlag, setExploreCountryFlag] = useState('');
  const [exploreCountryImg, setExploreCountryImg] = useState('');
  const [exploreCity, setExploreCity] = useState('');
  const [exploreSource, setExploreSource] = useState('');
  const [exploreLoading, setExploreLoading] = useState(true);

  // Location picker (lets a visitor correct a wrong IP mapping)
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState([]);
  const [locationSearching, setLocationSearching] = useState(false);

  // Stays Autocomplete state
  const [staysSuggestions, setStaysSuggestions] = useState([]);
  const [isStaysSuggestOpen, setIsStaysSuggestOpen] = useState(false);
  const suggestRef = useRef(null);

  useEffect(() => {
    if (staysDestination.trim().length < 2) {
      setStaysSuggestions([]);
      setIsStaysSuggestOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stays-locations?q=${encodeURIComponent(staysDestination)}`);
        const data = await res.json();
        setStaysSuggestions(data || []);
        setIsStaysSuggestOpen(data && data.length > 0);
      } catch (err) {
        console.error('Failed to fetch stays locations', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [staysDestination]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) {
        setIsStaysSuggestOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Apply a location (detected or picked by hand) to the explore + stays deals sections
  const applyLocation = useCallback((data) => {
    const cc = data?.countryCode || countryCodeFromName(data?.countryName) || '';
    const countryName = data?.countryName || countryNameFromCode(cc);
    const region = getRegionFromCountry(cc, countryName);

    setStaysDeals(STAYS_DEALS_BY_REGION[region] || STAYS_DEALS_BY_REGION['default']);
    setStaysDealCity(data?.city || countryName || '');

    setExploreDestinations(resolveExploreDestinations(cc, data, region));
    setExploreCountryCode(cc);
    setExploreCity(data?.city || '');
    setExploreSource(data?.source || '');

    if (cc || countryName) {
      setExploreCountryName(countryName || cc);
      setExploreCountryFlag(COUNTRY_HERO[cc]?.flag || countryFlag(cc));
      setExploreCountryImg((COUNTRY_HERO[cc] || COUNTRY_HERO['default']).img);
    } else {
      // No location available — present worldwide destinations rather than guessing
      setExploreCountryName('top destinations');
      setExploreCountryFlag('🌍');
      setExploreCountryImg(COUNTRY_HERO['default'].img);
    }

    setExploreLoading(false);
  }, []);

  // Geo-detect user location: set region deals AND explore destinations
  useEffect(() => {
    let cancelled = false;

    // Location is resolved in src/lib/geo.js (/api/geo → ipapi.co → ipwho.is → browser
    // timezone). Detection runs fresh on every visit, so a VPN or network change shows up.
    getGeo()
      .then((data) => { if (!cancelled) applyLocation(data); })
      .catch(() => { if (!cancelled) applyLocation(null); });

    return () => { cancelled = true; };
  }, [applyLocation]);

  // City search for the "change location" picker
  useEffect(() => {
    const value = locationQuery.trim();
    if (!locationPickerOpen || value.length < 2) {
      setLocationResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocationSearching(true);
      fetch(`/api/stays-locations?q=${encodeURIComponent(value)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data) => setLocationResults(Array.isArray(data) ? data.slice(0, 6) : []))
        .catch(() => {})
        .finally(() => setLocationSearching(false));
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [locationQuery, locationPickerOpen]);

  const handlePickLocation = (result) => {
    const countryCode = result.countryCode || countryCodeFromName(result.country);
    const override = setGeoOverride({
      city: result.name,
      countryCode,
      countryName: result.country || countryNameFromCode(countryCode),
      latitude: result.lat,
      longitude: result.lon,
    });
    applyLocation(override);
    setLocationPickerOpen(false);
    setLocationQuery('');
    setLocationResults([]);
  };

  const handleUseDetectedLocation = () => {
    clearGeoOverride();
    setLocationPickerOpen(false);
    setLocationQuery('');
    setLocationResults([]);
    setExploreLoading(true);
    getGeo().then((data) => applyLocation(data)).catch(() => applyLocation(null));
  };

  // Fetch trending hotels near user's detected location
  useEffect(() => {
    let cancelled = false;
    async function fetchTrendingHotels() {
      setTrendingHotelsLoading(true);
      try {
        // Step 1: reuse the shared location detection (same source as the explore section)
        let city = '';
        let country = '';
        try {
          const geo = await getGeo();
          city = geo?.city || '';
          country = geo?.countryName || '';
        } catch { /* geo failed – proceed without location filter */ }

        if (cancelled) return;

        // Step 2: fetch platform-listed hotels filtered by detected location
        const searchTerm = city || country || '';
        const url = searchTerm
          ? `/api/hotel-profiles?action=public&q=${encodeURIComponent(searchTerm)}&limit=6`
          : `/api/hotel-profiles?action=public&limit=6`;

        const res = await fetch(url);
        let hotels = [];
        if (res.ok) {
          const data = await res.json();
          hotels = (data.hotels || []).slice(0, 6);
        }

        // Step 3: if location search returned nothing, show any available hotels
        if (!hotels.length && searchTerm) {
          const fallbackRes = await fetch(`/api/hotel-profiles?action=public&limit=6`);
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            hotels = (fallbackData.hotels || []).slice(0, 6);
          }
        }

        if (cancelled) return;
        setTrendingHotels(hotels);
        setTrendingHotelsCity(city || country || '');
      } catch {
        // silent — section simply shows the fallback CTA
      } finally {
        if (!cancelled) setTrendingHotelsLoading(false);
      }
    }
    fetchTrendingHotels();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    window.__setStaysCheckin = setStaysCheckin;
    window.__setStaysCheckout = setStaysCheckout;
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bc_recent_searches');
      if (stored) {
        const SEARCH_TTL = 24 * 60 * 60 * 1000; // 24 hours
        const all = JSON.parse(stored);
        const fresh = all.filter(s => (Date.now() - Number(s.timestamp || 0)) < SEARCH_TTL);
        // Persist the cleaned list back so stale entries don't linger
        if (fresh.length !== all.length) {
          localStorage.setItem('bc_recent_searches', JSON.stringify(fresh));
        }
        setRecentSearches(fresh);
      }
    } catch(e) {}
  }, []);

  const handleRecentSearchClick = (search) => {
    if (window.writeState) {
      window.writeState({ search, bookingRef: null, _bookingSaved: null, duffelPassengers: null });
      if (typeof window.__bcNavigate === "function") window.__bcNavigate("/results");
      else window.location.href = "/results";
    }
  };

  const [openFaq, setOpenFaq] = useState({});
  const toggleFaq = (id) => {
    setOpenFaq(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeMode === 'stays') document.title = 'BookingCart — Find Your Stay';
    else if (activeMode === 'attractions') document.title = 'BookingCart — Discover Attractions';
    else document.title = 'BookingCart — Fly Anywhere';
  }, [activeMode]);
  useLegacyScripts(FLIGHT_SCRIPTS, 'home');

  // Re-initialize deals when switching back to flights (deals.js only boots once on DOMContentLoaded)
  useEffect(() => {
    if (activeMode === 'flights') {
      // Small delay lets React finish rendering the #deals-grid DOM node first
      const t = setTimeout(() => {
        if (typeof window.__reInitDeals === 'function') window.__reInitDeals();
        if (typeof window.__reInitBookingCart === 'function') window.__reInitBookingCart();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [activeMode]);

  return (
    <>
        <section
          className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 min-h-[500px] flex flex-col items-center justify-center text-center px-4 dark:bg-slate-950 transition-colors"
          data-step="search">
      
          
          <div className="absolute inset-0 z-0 select-none pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-b from-white/90 dark:from-slate-950/95 via-white/50 dark:via-slate-950/70 to-white/20 dark:to-slate-950/30 z-10 rounded-b-[40px]"></div>
            {activeMode === 'stays' ? (
              <img
                src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=80"
                className="absolute inset-0 w-full h-full object-cover object-center rounded-b-[40px] opacity-100 transition-opacity duration-1000 ease-in-out"
                alt="Hotel background"
              />
            ) : activeMode === 'attractions' ? (
              <img
                src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=2000&q=80"
                className="absolute inset-0 w-full h-full object-cover object-center rounded-b-[40px] opacity-100 transition-opacity duration-1000 ease-in-out"
                alt="Attractions background"
              />
            ) : (
              HERO_IMAGES.map((src, index) => (
                <img
                  key={src}
                  src={src}
                  className={`absolute inset-0 w-full h-full object-cover object-center rounded-b-[40px] transition-opacity duration-1000 ease-in-out ${index === currentHeroIndex ? 'opacity-100' : 'opacity-0'}`}
                  alt="Sky background"
                  onError={(e) => {
                    if (e.currentTarget.src !== HERO_IMAGES[1]) {
                      e.currentTarget.src = HERO_IMAGES[1];
                    }
                  }}
                />
              ))
            )}
          </div>
      
          
          <div className="relative z-10 max-w-4xl w-full mx-auto">
            <h1 className="text-5xl lg:text-7xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight mb-4">
              {activeMode === 'stays' ? 'Find Your Stay' : activeMode === 'attractions' ? 'Discover Attractions' : 'Fly Anywhere'}
            </h1>
            <p className="text-lg lg:text-xl text-slate-600 dark:text-slate-300 font-medium mb-8">
              {activeMode === 'stays' ? 'Hotels, apartments & more — all in one place.' : activeMode === 'attractions' ? 'Tours, experiences & things to do worldwide.' : 'Affordable Flights, Premium Service.'}
            </p>

            {/* Flights / Tour Guides / Stays mode switcher */}
            <div className="flex bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-2xl p-1 shadow-sm border border-white/80 dark:border-slate-700/80 mb-6 gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto sm:inline-flex">
              <button
                type="button"
                id="mode-flights-btn"
                onClick={() => setActiveMode('flights')}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  activeMode === 'flights'
                    ? 'bg-green-600 text-white shadow-md shadow-green-600/30'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <i className="ph ph-airplane-tilt text-base shrink-0"></i>
                <span className="hidden xs:inline sm:inline">Flights</span>
                <span className="xs:hidden sm:hidden">Fly</span>
              </button>
              <a
                href="/tour-guides"
                id="mode-guides-btn"
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white"
              >
                <i className="ph ph-compass text-base text-green-600 shrink-0"></i>
                <span className="hidden sm:inline">Tour Guides</span>
                <span className="sm:hidden">Guides</span>
              </a>
              <a
                href="/stays"
                id="mode-stays-btn"
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white"
              >
                <i className="ph ph-bed text-base text-blue-600 shrink-0"></i>
                <span>Stays</span>
              </a>
              <a
                href="/?mode=attractions"
                id="mode-attractions-btn"
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  activeMode === 'attractions'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                <i className={`ph ph-ticket text-base shrink-0 ${activeMode === 'attractions' ? '' : 'text-amber-500'}`}></i>
                <span className="hidden sm:inline">Attractions</span>
                <span className="sm:hidden">Events</span>
              </a>
            </div>

            <div className="mt-4 sm:mt-6 w-full max-w-7xl mx-auto text-left" role="region" aria-label="Search panel">

              {/* ──────────── FLIGHTS PANEL ──────────── */}
              {activeMode === 'flights' && (
                <>
                  <div className="inline-flex bg-white dark:bg-slate-800/60 dark:bg-slate-800/80 backdrop-blur rounded-xl p-1 shadow-sm border border-white/80 dark:border-slate-700/80 mb-2 tabs"
                    role="tablist">
                    <button type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 tab sm:text-sm sm:px-4 sm:py-2 sm:rounded-xl sm:gap-2" role="tab"
                      aria-selected="true" data-trip="round">
                      <i className="ph ph-arrows-left-right text-base"></i> Round Trip
                    </button>
                    <button type="button"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 tab sm:text-sm sm:px-4 sm:py-2 sm:rounded-xl sm:gap-2" role="tab"
                      aria-selected="false" data-trip="oneway">
                      <i className="ph ph-arrow-right text-base"></i> One-Way Trip
                    </button>
                    <a href="/aviation" id="flight-private-jet-btn" className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 sm:rounded-xl sm:px-4 sm:py-2 sm:text-sm">
                      <i className="ph ph-airplane-takeoff text-base text-emerald-700"></i> Private aviation
                    </a>
                  </div>

                  <div className="relative z-10 max-w-7xl w-full mx-auto px-0">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-1 sm:p-1.5 shadow-lg ring-1 ring-slate-100/80 dark:ring-slate-700/80 transition-colors">
                      <form data-search-form
                        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] gap-0">

                        <div className="min-w-0 sm:min-w-[11rem] lg:min-w-0 px-2 sm:px-3 py-1.5 relative suggest border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2 lg:col-start-1 lg:row-start-1">
                          <label className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="search-from">From</label>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                            <i className="ph ph-airplane-takeoff text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                            <input id="search-from"
                              className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                              name="from" data-airport-input placeholder="City or code" autoComplete="off" />
                          </div>
                          <ul className="suggest__list" role="listbox"></ul>
                        </div>

                        <div className="min-w-0 sm:min-w-[11rem] lg:min-w-0 px-2 sm:px-3 py-1.5 relative suggest border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2 lg:col-start-2 lg:row-start-1">
                          <label className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="search-to">To</label>
                          <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                            <i className="ph ph-airplane-landing text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                            <input id="search-to"
                              className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                              name="to" data-airport-input placeholder="City or code" autoComplete="off" />
                          </div>
                          <ul className="suggest__list" role="listbox"></ul>
                        </div>

                        <div className="min-w-0 w-full px-2 sm:px-3 py-1.5 flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0 border-b lg:border-b-0 lg:border-t border-slate-100/90 lg:col-span-3 lg:row-start-2">
                          <div className="flex-1 min-w-0 field flex flex-row items-center gap-2 sm:pr-2">
                            <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Out</span>
                            <button type="button" data-cal-trigger="depart"
                              className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                              <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                              <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="depart">Select</span>
                            </button>
                            <input type="hidden" name="depart" />
                          </div>
                          <div className="hidden sm:block w-px bg-slate-100 dark:bg-slate-700 self-center" style={{minHeight:'2rem'}}></div>
                          <div className="flex-1 min-w-0 field group flex flex-row items-center gap-2 sm:pl-2" data-return-field>
                            <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Back</span>
                            <button type="button" data-cal-trigger="return"
                              className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                              <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                              <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="return">Select</span>
                            </button>
                            <input type="hidden" name="return" />
                          </div>
                        </div>

                        <div className="px-2 sm:px-3 py-1.5 flex flex-row items-center gap-2 lg:gap-2.5 lg:pl-3 lg:pr-1.5 lg:col-start-3 lg:row-start-1">
                          <div className="dropdown relative flex-1 min-w-0 flex flex-row items-center gap-2" data-dropdown>
                            <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Pax</span>
                            <button className="flex-1 min-w-0 flex items-center gap-1.5 text-left bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 control sm:min-w-[6.5rem]" type="button"
                              data-dropdown-trigger data-passengers-trigger>
                              <i className="ph ph-users text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                              <span className="font-semibold text-slate-900 dark:text-slate-200 text-xs sm:text-sm truncate" data-passengers-summary>1 traveler</span>
                            </button>
                            <input type="hidden" name="passengers" value="" />

                            <div className="dropdown__panel" role="dialog">
                              <div data-passengers className="space-y-4">
                                <div className="flex justify-between items-center counter">
                                  <div className="counter__meta">
                                    <div className="font-medium text-slate-900 dark:text-slate-200">Adults</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Age 12+</div>
                                  </div>
                                  <div className="flex items-center gap-3 counter__controls">
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-minus="adults"><i className="ph ph-minus"></i></button>
                                    <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="adults">1</span>
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-plus="adults"><i className="ph ph-plus"></i></button>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center counter">
                                  <div className="counter__meta">
                                    <div className="font-medium text-slate-900 dark:text-slate-200">Children</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Age 2–11</div>
                                  </div>
                                  <div className="flex items-center gap-3 counter__controls">
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-minus="children"><i className="ph ph-minus"></i></button>
                                    <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="children">0</span>
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-plus="children"><i className="ph ph-plus"></i></button>
                                  </div>
                                </div>
                                <div className="flex justify-between items-center counter">
                                  <div className="counter__meta">
                                    <div className="font-medium text-slate-900 dark:text-slate-200">Infants</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Under 2</div>
                                  </div>
                                  <div className="flex items-center gap-3 counter__controls">
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-minus="infants"><i className="ph ph-minus"></i></button>
                                    <span className="font-medium w-4 text-center kpi dark:text-slate-200" data-count="infants">0</span>
                                    <button className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-700 hover:border-green-500 hover:text-green-600 transition-colors" type="button" data-plus="infants"><i className="ph ph-plus"></i></button>
                                  </div>
                                </div>

                                <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-700">
                                  <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Cabin</label>
                                  <select className="w-full bg-slate-50 dark:bg-slate-700 dark:text-slate-200 border-none rounded-lg text-sm font-semibold p-2 focus:ring-2 focus:ring-green-500 control select transition-colors" name="cabin">
                                    <option>Economy</option>
                                    <option>Premium Economy</option>
                                    <option>Business</option>
                                    <option>First</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>

                          <button
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 sm:h-10 px-4 sm:px-5 rounded-lg sm:rounded-xl shadow-md shadow-green-600/25 transition-all flex items-center justify-center gap-1.5 btn btn-primary shrink-0 text-xs sm:text-sm"
                            type="submit">
                            <i className="ph ph-magnifying-glass text-base sm:text-lg"></i>
                            Search
                          </button>
                        </div>

                        <div data-multicity style={{display:'none'}} className="p-2 border-t border-slate-100 dark:border-slate-700 lg:col-span-3">
                          <div className="text-sm text-slate-500 dark:text-slate-400">Multi-city search is not available yet.</div>
                        </div>
                      </form>

                    </div>
                  </div>
                </>
              )}

              {/* ──────────── STAYS PANEL ──────────── */}
              {activeMode === 'stays' && (
                <div className="relative z-10 max-w-7xl w-full mx-auto px-0 mt-2">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl p-1 sm:p-1.5 shadow-lg ring-1 ring-slate-100/80 dark:ring-slate-700/80 transition-colors">
                    <form
                      id="stays-search-form"
                      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const dest = staysDestination.trim();
                        
                        if (!dest || !staysCheckin || !staysCheckout) {
                          alert('Please fill out destination, check-in, and check-out dates.');
                          return;
                        }
                        const params = new URLSearchParams({
                          destination: dest,
                          checkin: staysCheckin,
                          checkout: staysCheckout,
                          guests: staysGuests.toString(),
                          rooms: staysRooms.toString()
                        });
                        const url = `/stays/results?${params.toString()}`;
                        if (typeof window.__bcNavigate === "function") window.__bcNavigate(url);
                        else window.location.href = url;
                      }}
                    >
                      {/* Destination */}
                      <div ref={suggestRef} className="min-w-0 px-2 sm:px-3 py-1.5 relative suggest border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2">
                        <label className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="stays-destination">Where</label>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                          <i className="ph ph-map-pin text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                          <input
                            id="stays-destination"
                            className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                            placeholder="City, hotel, or area"
                            value={staysDestination}
                            onChange={e => {
                              setStaysDestination(e.target.value);
                              setIsStaysSuggestOpen(true);
                            }}
                            onFocus={() => {
                              if (staysSuggestions.length > 0) setIsStaysSuggestOpen(true);
                            }}
                            autoComplete="off"
                          />
                        </div>
                        <ul className="suggest__list" role="listbox" data-open={isStaysSuggestOpen ? "true" : "false"}>
                          {staysSuggestions.map((item, i) => (
                            <li
                              key={i}
                              className="suggest__item"
                              role="option"
                              tabIndex="0"
                              onClick={() => {
                                setStaysDestination(item.name);
                                setIsStaysSuggestOpen(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  setStaysDestination(item.name);
                                  setIsStaysSuggestOpen(false);
                                }
                              }}
                            >
                              <span>{item.name} <span className="small">{item.fullName.split(',').slice(1).join(',')}</span></span>
                              <span className="suggest__code"><i className="ph ph-buildings"></i></span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Check-in */}
                      <div className="min-w-0 px-2 sm:px-3 py-1.5 field border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2">
                        <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">In</span>
                        <button type="button" data-cal-trigger="stays-checkin"
                          className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                          <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="stays-checkin">
                            {staysCheckin ? new Date(staysCheckin + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : 'Select'}
                          </span>
                        </button>
                        <input type="hidden" name="stays-checkin" value={staysCheckin} />
                      </div>

                      {/* Check-out */}
                      <div className="min-w-0 px-2 sm:px-3 py-1.5 field border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2">
                        <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Out</span>
                        <button type="button" data-cal-trigger="stays-checkout"
                          className="flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 transition-all cursor-pointer text-left">
                          <i className="ph ph-calendar-blank text-base text-slate-400 dark:text-slate-400 shrink-0" aria-hidden="true"></i>
                          <span className="text-slate-900 dark:text-slate-200 font-semibold text-xs sm:text-sm whitespace-nowrap overflow-x-auto no-scrollbar" data-cal-label="stays-checkout">
                            {staysCheckout ? new Date(staysCheckout + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : 'Select'}
                          </span>
                        </button>
                        <input type="hidden" name="stays-checkout" value={staysCheckout} />
                      </div>

                      {/* Guests & Rooms + Search */}
                      <div className="px-2 sm:px-3 py-1.5 flex flex-row items-center gap-2 lg:gap-2.5 lg:pl-3 lg:pr-1.5">
                        <div className="relative flex-1 min-w-0 flex flex-row items-center gap-2">
                          <span className="w-9 sm:w-10 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none">Guests</span>
                          <button
                            id="stays-guests-trigger"
                            type="button"
                            className="flex-1 min-w-0 flex items-center gap-1.5 text-left bg-slate-50 dark:bg-slate-700/50 rounded-lg px-2 h-9 sm:h-10 sm:min-w-[7rem]"
                            onClick={() => setStaysGuestOpen(v => !v)}
                          >
                            <i className="ph ph-users text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                            <span className="font-semibold text-slate-900 dark:text-slate-200 text-xs sm:text-sm truncate">
                              {staysGuests} guest{staysGuests !== 1 ? 's' : ''}, {staysRooms} room{staysRooms !== 1 ? 's' : ''}
                            </span>
                          </button>

                          {/* Guests/Rooms dropdown */}
                          {staysGuestOpen && (
                            <div
                              className="absolute top-full right-0 mt-2 z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-4 w-64 space-y-4"
                              role="dialog"
                              aria-label="Guests and rooms"
                            >
                              {/* Guests counter */}
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-200">Guests</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">Adults &amp; children</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    id="stays-guests-minus"
                                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-green-500 hover:text-green-600 transition-colors"
                                    onClick={() => setStaysGuests(g => Math.max(1, g - 1))}
                                  ><i className="ph ph-minus"></i></button>
                                  <span className="font-semibold w-5 text-center text-slate-900 dark:text-slate-200">{staysGuests}</span>
                                  <button
                                    type="button"
                                    id="stays-guests-plus"
                                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-green-500 hover:text-green-600 transition-colors"
                                    onClick={() => setStaysGuests(g => Math.min(30, g + 1))}
                                  ><i className="ph ph-plus"></i></button>
                                </div>
                              </div>

                              {/* Rooms counter */}
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-200">Rooms</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">Number of rooms</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    id="stays-rooms-minus"
                                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-green-500 hover:text-green-600 transition-colors"
                                    onClick={() => setStaysRooms(r => Math.max(1, r - 1))}
                                  ><i className="ph ph-minus"></i></button>
                                  <span className="font-semibold w-5 text-center text-slate-900 dark:text-slate-200">{staysRooms}</span>
                                  <button
                                    type="button"
                                    id="stays-rooms-plus"
                                    className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:border-green-500 hover:text-green-600 transition-colors"
                                    onClick={() => setStaysRooms(r => Math.min(30, r + 1))}
                                  ><i className="ph ph-plus"></i></button>
                                </div>
                              </div>

                              <button
                                type="button"
                                id="stays-guests-done"
                                className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-xl transition-colors text-sm"
                                onClick={() => setStaysGuestOpen(false)}
                              >Done</button>
                            </div>
                          )}
                        </div>

                        {/* Search button */}
                        <button
                          id="stays-search-btn"
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 sm:h-10 px-4 sm:px-5 rounded-lg sm:rounded-xl shadow-md shadow-green-600/25 transition-all flex items-center justify-center gap-1.5 shrink-0 text-xs sm:text-sm"
                          type="submit"
                        >
                          <i className="ph ph-magnifying-glass text-base sm:text-lg"></i>
                          Search
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ──────────── ATTRACTIONS PANEL ──────────── */}
              {activeMode === 'attractions' && (
                <div className="relative z-10 max-w-7xl w-full mx-auto px-0 mt-2">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl p-1 sm:p-1.5 shadow-lg ring-1 ring-slate-100/80 dark:ring-slate-700/80 transition-colors">
                    <form
                      id="attractions-search-form"
                      className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const q = attractionsQuery.trim();
                        const destination = selectedAttractionsDestination;
                        const params = new URLSearchParams();
                        if (q) params.set('q', q);
                        if (destination) { params.set('destination', destination.label); params.set('lat', destination.lat); params.set('lon', destination.lon); }
                        const url = params.toString() ? `/attractions/results?${params}` : '/attractions/results';
                        if (typeof window.__bcNavigate === 'function') window.__bcNavigate(url);
                        else window.location.href = url;
                      }}
                    >
                      {/* Destination */}
                      <div className="min-w-0 px-2 sm:px-3 py-1.5 border-b lg:border-b-0 lg:border-r border-slate-100/90 dark:border-slate-700/90 flex flex-row items-center gap-2">
                        <label className="w-16 sm:w-20 shrink-0 text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-none" htmlFor="attractions-dest">Where to</label>
                        <div className="relative flex-1 min-w-0 flex items-center gap-1.5 bg-slate-50 dark:bg-slate-700 rounded-lg px-2 h-9 sm:h-10">
                          <i className="ph ph-ticket text-base text-slate-400 shrink-0" aria-hidden="true"></i>
                          <input
                            id="attractions-dest"
                            className="w-full min-w-0 bg-transparent border-none p-0 text-slate-900 dark:text-white font-semibold placeholder:text-slate-400 text-sm leading-none"
                            placeholder="City, landmark, or destination"
                            value={attractionsQuery}
                            onChange={e => { setAttractionsQuery(e.target.value); setSelectedAttractionsDestination(null); }}
                            autoComplete="off"
                            aria-autocomplete="list"
                            aria-expanded={attractionsSuggestions.length > 0}
                          />
                          {attractionsSuggestions.length > 0 && <ul className="absolute left-0 right-0 top-full z-[1500] mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white text-left shadow-xl dark:border-slate-600 dark:bg-slate-800">{attractionsSuggestions.map((suggestion) => <li key={suggestion.id}><button type="button" onClick={() => { setAttractionsQuery(suggestion.name); setSelectedAttractionsDestination(suggestion); setAttractionsSuggestions([]); }} className="w-full px-4 py-3 hover:bg-emerald-50 dark:hover:bg-slate-700"><strong className="block text-sm">{suggestion.name}, {suggestion.country}</strong><span className="block truncate text-xs text-slate-400">{suggestion.label}</span></button></li>)}</ul>}
                        </div>
                      </div>

                      {/* Search button */}
                      <div className="px-2 sm:px-3 py-1.5 flex flex-row items-center gap-2 lg:gap-2.5 lg:pl-3 lg:pr-1.5">
                        <button
                          id="attractions-search-btn"
                          className="bg-green-600 hover:bg-green-700 text-white font-semibold h-9 sm:h-10 px-4 sm:px-5 rounded-lg sm:rounded-xl shadow-md shadow-green-600/25 transition-all flex items-center justify-center gap-1.5 shrink-0 text-xs sm:text-sm"
                          type="submit"
                        >
                          <i className="ph ph-magnifying-glass text-base sm:text-lg"></i>
                          Explore
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Quick-pick popular categories */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['Events', 'Safari', 'Museums', 'Nature', 'Landmarks', 'Family Fun', 'Adventure', 'Cultural'].map(category => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          const url = `/attractions/results?q=${encodeURIComponent(category)}`;
                          if (typeof window.__bcNavigate === 'function') window.__bcNavigate(url);
                          else window.location.href = url;
                        }}
                        className="flex items-center gap-1.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-full border border-white/80 dark:border-slate-700 shadow-sm hover:bg-white dark:hover:bg-slate-700 transition-all"
                      >
                        <i className="ph ph-sparkle text-amber-500 text-sm"></i>
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Calendar Popup (unconditionally rendered) */}
            <div id="cal-popup" className="cal-popup" style={{display:'none'}}>
              <div className="flex flex-col sm:flex-row gap-8">
                <div className="cal-month flex-1">
                  <div className="cal-header">
                    <button type="button" className="cal-nav" data-cal-prev><i className="ph-bold ph-caret-left"></i></button>
                    <span className="cal-title" data-cal-title-1></span>
                    <div className="w-9 h-9 sm:hidden">
                      <button type="button" className="cal-nav" data-cal-next><i className="ph-bold ph-caret-right"></i></button>
                    </div>
                    <div className="w-9 h-9 hidden sm:block"></div>
                  </div>
                  <div className="cal-weekdays">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                  <div className="cal-grid" data-cal-grid-1></div>
                </div>
                
                <div className="cal-month flex-1 hidden sm:block">
                  <div className="cal-header">
                    <div className="w-9 h-9 hidden sm:block"></div>
                    <span className="cal-title" data-cal-title-2></span>
                    <button type="button" className="cal-nav" data-cal-next><i className="ph-bold ph-caret-right"></i></button>
                  </div>
                  <div className="cal-weekdays">
                    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                  </div>
                  <div className="cal-grid" data-cal-grid-2></div>
                </div>
              </div>
            </div>
            
          </div>
        </section>


        {activeMode === 'attractions' ? <AttractionsHomeContent /> : <>
        {/* Recent Searches Section */}
        {recentSearches.length > 0 && (
          <section className="max-w-7xl mx-auto px-6 pt-12 pb-4 dark:bg-slate-950 transition-colors">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">Your recent searches</h2>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
              {recentSearches.map((search, idx) => {
                const isRoundTrip = search.tripType === 'round';
                
                // Helper to extract IATA
                const extractIata = (str) => {
                  if (!str) return '';
                  const m = str.match(/\(([A-Z]{3})\)/);
                  if (m) return m[1];
                  const m2 = str.match(/\b([A-Z]{3})\b/);
                  if (m2) return m2[1];
                  return str.split(',')[0].substring(0, 3).toUpperCase();
                };
                
                const fromCode = extractIata(search.from);
                const toCode = extractIata(search.to);
                
                // Format dates: '2026-04-30' -> 'Thu 4/30'
                const formatDate = (dateStr) => {
                  if (!dateStr) return '';
                  try {
                    const d = new Date(dateStr + "T12:00:00");
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    return `${days[d.getDay()]} ${d.getMonth()+1}/${d.getDate()}`;
                  } catch(e) { return dateStr; }
                };

                return (
                  <div 
                    key={idx} 
                    onClick={() => handleRecentSearchClick(search)}
                    className="flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer transition-all snap-start flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                          <i className="ph-fill ph-airplane-tilt text-lg"></i>
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            {fromCode} 
                            <i className="ph ph-caret-right text-slate-400 text-xs"></i> 
                            {toCode}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {formatDate(search.depart)} {isRoundTrip && search.return ? ` • ${formatDate(search.return)}` : ''}
                      </div>
                      <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">
                        1 traveler, {search.cabin || 'Economy'} <br/>
                        {isRoundTrip ? 'Round-trip' : 'One-way'}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-end mt-4">
                      <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-green-600 transition-colors">
                        View results
                      </div>
                      <button className="w-10 h-10 rounded-xl bg-green-600 hover:bg-green-700 text-white flex items-center justify-center transition-colors shadow-sm shadow-green-600/20">
                        <i className="ph-bold ph-magnifying-glass text-lg"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
              
              <div className="flex-shrink-0 w-72 bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md border border-slate-200 dark:border-slate-700 cursor-pointer transition-all snap-start flex flex-col items-center justify-center text-center"
                   onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}
              >
                <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-400 mb-4 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <i className="ph ph-plus text-xl"></i>
                </div>
                <div className="font-bold text-slate-900 dark:text-white mb-4">Start a new search</div>
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded bg-green-600 text-white flex items-center justify-center"><i className="ph-fill ph-airplane-tilt"></i></div>
                  <div className="w-8 h-8 rounded bg-green-600 text-white flex items-center justify-center"><i className="ph-fill ph-bed"></i></div>
                  <div className="w-8 h-8 rounded bg-green-600 text-white flex items-center justify-center"><i className="ph-fill ph-car"></i></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* USP Banner Section */}
        <section className="max-w-7xl mx-auto px-6 py-10 mb-2 dark:bg-slate-950 transition-colors">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {/* Search a huge selection */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Globe Background in Soft Green Grid */}
                  <circle cx="24" cy="24" r="18" fill="#F0FDF4" />
                  <circle cx="24" cy="24" r="18" stroke="#86EFAC" strokeWidth="1.5" strokeDasharray="3 3" />
                  {/* Longitudes & Latitudes */}
                  <path d="M24 6C24 6 29.5 13 29.5 24C29.5 35 24 42 24 42" stroke="#86EFAC" strokeWidth="1" />
                  <path d="M24 6C24 6 18.5 13 18.5 24C18.5 35 24 42 24 42" stroke="#86EFAC" strokeWidth="1" />
                  <line x1="6" y1="24" x2="42" y2="24" stroke="#86EFAC" strokeWidth="1" />
                  {/* Magnifying Glass */}
                  <circle cx="31" cy="31" r="6.5" fill="#FFFFFF" stroke="#16A34A" strokeWidth="2.5" />
                  <path d="M35.5 35.5L41.5 41.5" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Search a huge selection</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Easily compare flights, airlines, and prices – all in one place</p>
              </div>
            </div>

            {/* Pay no hidden fees */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Coin 1 Stack (Bottom Left) */}
                  <path d="M12 26C12 28.2 16 30 21 30C26 30 30 28.2 30 26V31C30 33.2 26 35 21 35C16 35 12 33.2 12 31V26Z" fill="#15803D" />
                  <path d="M12 20C12 22.2 16 24 21 24C26 24 30 22.2 30 20V25C30 27.2 26 29 21 29C16 29 12 27.2 12 25V20Z" fill="#16A34A" />
                  <ellipse cx="21" cy="20" rx="9" ry="4" fill="#4ADE80" stroke="#15803D" strokeWidth="1.5" />
                  
                  {/* Coin 2 Stack (Top Right) */}
                  <path d="M20 15C20 17.2 24 19 29 19C34 19 38 17.2 38 15V20C38 22.2 34 24 29 24C24 24 20 22.2 20 20V15Z" fill="#15803D" />
                  <ellipse cx="29" cy="15" rx="9" ry="4" fill="#86EFAC" stroke="#15803D" strokeWidth="1.5" />

                  {/* Checkmark badge */}
                  <circle cx="34" cy="26" r="7" fill="#16A34A" />
                  <circle cx="34" cy="26" r="7" stroke="#FFFFFF" strokeWidth="1.5" />
                  <path d="M31 26L33 28L37 24" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Pay no hidden fees</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Get a clear price breakdown every step of the way</p>
              </div>
            </div>

            {/* Get more flexibility */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-12 h-12">
                  {/* Underneath Ticket (Soft Green) */}
                  <path d="M12 28L28 38C30 39.2 32.5 38.6 33.7 36.6L38.7 28.6C39.9 26.6 39.3 24.1 37.3 22.9L21.7 12.9" fill="#DCFCE7" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" />
                  
                  {/* Top Ticket (Bright Green) */}
                  <rect x="8" y="14" width="28" height="18" rx="3" transform="rotate(-15 8 14)" fill="#F0FDF4" stroke="#16A34A" strokeWidth="2.2" />
                  
                  {/* Ticket punch details */}
                  <path d="M19 14.5C20.1 14.2 20.7 13 20.4 11.9" stroke="#16A34A" strokeWidth="2" />
                  <path d="M22.5 27.5C21.4 27.8 20.8 29 21.1 30.1" stroke="#16A34A" strokeWidth="2" />
                  
                  {/* Airplane icon on top ticket */}
                  <path d="M20 23.5L23.5 20.5L25 23L27.5 22.5L26.5 24.2L28.2 26L26.8 26.3L25.5 25.2L23.8 26.5L23.8 24.8L20 23.5Z" fill="#16A34A" />
                </svg>
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base mb-1 tracking-tight">Get more flexibility</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed font-medium">Change your travel dates with the Flexible ticket option</p>
              </div>
            </div>
          </div>
        </section>
      
        
        {activeMode === 'flights' ? (
          <section id="deals-section" className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
              <div>
                <div className="inline-flex items-center gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold text-xs px-3 py-1.5 rounded-full mb-3">
                  <i className="ph ph-fire text-base"></i> Personalized for You
                </div>
                <h2 id="deals-title" className="text-3xl font-extrabold text-slate-900 dark:text-white">Top Flight Deals</h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Real-time prices · Updated every 2 hours</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm transition-colors">
                  <i className="ph ph-map-pin text-green-600 dark:text-green-400"></i>
                  <input id="deals-origin-input" type="text" maxLength="3" placeholder="IATA e.g. LHR"
                    className="w-20 bg-transparent font-semibold text-slate-700 dark:text-slate-200 uppercase" />
                </div>
                <button id="deals-origin-btn"
                  className="bg-slate-900 text-white font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-slate-700 transition-all">
                  Change
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-6 transition-colors">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Sort:</span>
                  <button data-sort="price" className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-green-600 text-white transition-all">💰 Lowest Price</button>
                  <button data-sort="popular" className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">⭐ Popular</button>
                  <button data-sort="trending" className="data-sort px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">🔥 Trending</button>
                </div>
                <div className="hidden lg:block w-px h-8 bg-slate-200 dark:bg-slate-600 mx-2"></div>
                <div className="flex items-center gap-4 flex-wrap text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Budget:</span>
                    <input id="deals-min-price" type="range" min="0" max="2000" step="50" defaultValue="0" className="w-20 accent-green-600" />
                    <input id="deals-max-price" type="range" min="200" max="5000" step="50" defaultValue="5000" className="w-20 accent-green-600" />
                    <span id="deals-price-label" className="text-xs font-semibold text-slate-600 dark:text-slate-300">$0 – $5000+</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">Month:</span>
                    <select id="deals-month" className="bg-slate-50 dark:bg-slate-700 dark:text-slate-200 border-none rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <option value="">Any</option>
                      <option value="03">Mar</option>
                      <option value="04">Apr</option>
                      <option value="05">May</option>
                      <option value="06">Jun</option>
                      <option value="07">Jul</option>
                      <option value="08">Aug</option>
                      <option value="09">Sep</option>
                      <option value="10">Oct</option>
                      <option value="11">Nov</option>
                      <option value="12">Dec</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input id="deals-direct-only" type="checkbox" className="accent-green-600 w-4 h-4" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Direct only</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="relative">
              <button id="deals-prev" className="absolute -left-4 top-[45%] -translate-y-1/2 z-10 w-9 h-9 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:shadow-xl transition-all hidden sm:flex" aria-label="Scroll left">
                <i className="ph ph-caret-left text-sm font-bold"></i>
              </button>
              <div id="deals-grid" className="flex flex-row gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"></div>
              <button id="deals-next" className="absolute -right-4 top-[45%] -translate-y-1/2 z-10 w-9 h-9 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:shadow-xl transition-all hidden sm:flex" aria-label="Scroll right">
                <i className="ph ph-caret-right text-sm font-bold"></i>
              </button>
            </div>

            <div className="text-center mt-10">
              <a href="/results" className="inline-flex items-center gap-2 border-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white font-bold px-8 py-3 rounded-2xl transition-all text-sm">
                <i className="ph ph-magnifying-glass"></i> Search More Flights
              </a>
            </div>
          </section>
        ) : (
          <section className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">

            {/* ── Explore [Country] section ── */}
            <div className="mb-12">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {exploreLoading
                      ? <span className="inline-block w-48 h-7 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse align-middle" />
                      : <>Explore {exploreCountryName}</>}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    These popular destinations have a lot to offer
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {!exploreLoading && (
                    <button
                      type="button"
                      onClick={() => setLocationPickerOpen((open) => !open)}
                      aria-expanded={locationPickerOpen}
                      data-testid="explore-location-pill"
                      className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-green-500 hover:text-green-600 transition-colors"
                    >
                      <i className="ph ph-map-pin" />
                      <span className="max-w-[12rem] truncate">
                        {exploreCity ? `${exploreCity}, ${exploreCountryName}` : exploreCountryName}
                      </span>
                      <span className="font-medium text-slate-400">· Change</span>
                    </button>
                  )}
                  {!exploreLoading && (
                    <a
                      href={`/stays/results?destination=${encodeURIComponent(exploreCountryName)}`}
                      className="hidden sm:flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                    >
                      See all <i className="ph ph-caret-right text-xs" />
                    </a>
                  )}
                </div>
              </div>

              {locationPickerOpen && (
                <div className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <i className="ph ph-magnifying-glass text-slate-400" />
                    <input
                      autoFocus
                      value={locationQuery}
                      onChange={(event) => setLocationQuery(event.target.value)}
                      placeholder="Search a city, e.g. Nairobi"
                      className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setLocationPickerOpen(false)}
                      aria-label="Close location search"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <i className="ph ph-x" />
                    </button>
                  </div>

                  {locationQuery.trim().length >= 2 && (
                    <div className="mt-2 max-h-56 overflow-auto divide-y divide-slate-100 dark:divide-slate-800" data-testid="explore-location-results">
                      {locationResults.length === 0 ? (
                        <p className="py-2 text-xs text-slate-400">{locationSearching ? 'Searching…' : 'No matches found'}</p>
                      ) : (
                        locationResults.map((result) => (
                          <button
                            key={`${result.name}-${result.lat}-${result.lon}`}
                            type="button"
                            onClick={() => handlePickLocation(result)}
                            className="block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {result.name}
                            </span>
                            <span className="block truncate text-xs text-slate-400">{result.fullName}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-slate-400">
                    {exploreSource === 'manual'
                      ? 'You picked this location. '
                      : 'Location detected from your connection. '}
                    <button
                      type="button"
                      onClick={handleUseDetectedLocation}
                      className="font-semibold text-green-600 hover:text-green-700"
                    >
                      Use my detected location
                    </button>
                  </p>
                </div>
              )}

              {/* City cards — skeleton while loading, bento grid once geo resolves */}
              {exploreLoading ? (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[0,1].map(i => <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse h-[220px]" />)}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[0,1,2].map(i => <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse h-[160px]" />)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {/* Row 1: country tile (large left) + first city (large right) */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Tile 0: User's country */}
                    <a
                      href={`/stays/results?destination=${encodeURIComponent(exploreCountryName)}`}
                      className="relative group rounded-2xl overflow-hidden block h-[220px] sm:h-[260px] bg-slate-200 dark:bg-slate-700 cursor-pointer"
                    >
                      <img
                        src={exploreCountryImg}
                        alt={exploreCountryName}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        loading="lazy"
                        onError={e => { e.target.src = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80'; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-4 left-4">
                        <p className="text-white font-extrabold text-xl sm:text-2xl leading-tight drop-shadow-md">
                          {exploreCountryName} {exploreCountryFlag}
                        </p>
                        <p className="text-white/70 text-xs font-semibold mt-0.5">Explore all stays</p>
                      </div>
                    </a>
                    {/* Tile 1: First city */}
                    {exploreDestinations[0] && (
                      <a
                        href={`/stays/results?destination=${encodeURIComponent(exploreDestinations[0].city)}`}
                        className="relative group rounded-2xl overflow-hidden block h-[220px] sm:h-[260px] bg-slate-200 dark:bg-slate-700 cursor-pointer"
                      >
                        <img
                          src={exploreDestinations[0].img}
                          alt={exploreDestinations[0].city}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          loading="lazy"
                          onError={e => { e.target.src = 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                        <div className="absolute bottom-4 left-4">
                          <p className="text-white font-extrabold text-xl sm:text-2xl leading-tight drop-shadow-md">
                            {exploreDestinations[0].city} {exploreDestinations[0].flag}
                          </p>
                          <p className="text-white/70 text-xs font-semibold mt-0.5">
                            {exploreDestinations[0].props
                              ? `${exploreDestinations[0].props} properties`
                              : exploreDestinations[0].note || 'Popular stays'}
                          </p>
                        </div>
                      </a>
                    )}
                  </div>
                  {/* Row 2: next 3 cities */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {exploreDestinations.slice(1, 4).map((dest) => (
                      <a
                        key={dest.city}
                        href={`/stays/results?destination=${encodeURIComponent(dest.city)}`}
                        className="relative group rounded-2xl overflow-hidden block h-[160px] sm:h-[190px] bg-slate-200 dark:bg-slate-700 cursor-pointer"
                      >
                        <img
                          src={dest.img}
                          alt={dest.city}
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                          loading="lazy"
                          onError={e => { e.target.src = 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=600&q=80'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                        <div className="absolute bottom-3 left-3">
                          <p className="text-white font-extrabold text-base sm:text-lg leading-tight drop-shadow-md">
                            {dest.city} {dest.flag}
                          </p>
                          <p className="text-white/70 text-xs font-semibold mt-0.5">
                            {dest.props ? `${dest.props} properties` : dest.note || 'Popular stays'}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Trending hotels near user's location */}
            <div className="mb-6 flex items-end justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold text-xs px-3 py-1 rounded-full mb-2">
                  <i className="ph ph-fire" /> Trending now
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mb-0.5 tracking-tight">Trending hotels</h2>
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                  {trendingHotelsCity ? `Top-rated stays near ${trendingHotelsCity}` : 'Top-rated stays near you'}
                </p>
              </div>
              <a
                href={trendingHotelsCity ? `/stays/results?destination=${encodeURIComponent(trendingHotelsCity)}` : '/stays/results'}
                className="hidden sm:flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-300 hover:text-green-600 dark:hover:text-green-400 transition-colors"
              >
                View all <i className="ph ph-caret-right text-xs" />
              </a>
            </div>

            {/* Loading skeletons */}
            {trendingHotelsLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm animate-pulse">
                    <div className="h-44 bg-slate-200 dark:bg-slate-700" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded-full w-3/4" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full w-1/2" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Hotel cards — real platform listings */}
            {!trendingHotelsLoading && trendingHotels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                {trendingHotels.map((hotel, idx) => {
                  const info = hotel.step_property_info || hotel;
                  const loc = hotel.step_location || {};
                  const gallery = Array.isArray(hotel.step_gallery) ? hotel.step_gallery : [];
                  const firstImg = gallery[0]?.url || gallery[0] || info.featured_image || info.image || info.coverImage || '';
                  const hotelName = info.hotelName || info.name || hotel.name || 'Hotel';
                  const city = loc.city || info.city || hotel.city || '';
                  const country = loc.country || info.country || hotel.country || '';
                  const priceFrom = info.priceFrom || info.price || hotel.price_per_night || hotel.price || '';
                  const rating = info.starRating || hotel.rating || hotel.star_rating || '';
                  const hotelId = hotel.id;
                  const starsCount = parseInt(rating, 10) || 0;

                  return (
                    <a
                      key={hotelId || idx}
                      href={`/stays/results?destination=${encodeURIComponent(city || hotelName)}&hotel_id=${hotelId || ''}`}
                      className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 block"
                    >
                      {/* Image */}
                      <div className="relative h-44 overflow-hidden bg-slate-100 dark:bg-slate-700">
                        {firstImg ? (
                          <img
                            src={firstImg}
                            alt={hotelName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <i className="ph ph-buildings text-5xl text-slate-300 dark:text-slate-600" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        {starsCount > 0 && (
                          <div className="absolute top-3 left-3 flex items-center gap-0.5">
                            {Array.from({ length: starsCount }).map((_, s) => (
                              <i key={s} className="ph-fill ph-star text-amber-400 text-xs" />
                            ))}
                          </div>
                        )}
                        <div className="absolute bottom-3 right-3 bg-green-600 text-white text-[10px] font-black px-2 py-1 rounded-full">
                          Available
                        </div>
                      </div>

                      {/* Info */}
                      <div className="p-4">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight line-clamp-1 group-hover:text-green-600 transition-colors mb-1">
                          {hotelName}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-2">
                          <i className="ph ph-map-pin text-green-600 text-sm flex-shrink-0" />
                          <span className="truncate">{[city, country].filter(Boolean).join(', ') || 'Location on file'}</span>
                        </p>
                        <div className="flex items-center justify-between">
                          {priceFrom ? (
                            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                              from <span className="text-green-600">{typeof priceFrom === 'number' ? `$${priceFrom}` : priceFrom}</span>
                              <span className="text-xs font-normal text-slate-400 ml-1">/night</span>
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400">Check availability</p>
                          )}
                          <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 px-2 py-0.5 rounded-full">
                            Book
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Fallback: no local hotels found */}
            {!trendingHotelsLoading && trendingHotels.length === 0 && (
              <div className="mb-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-10 text-center shadow-sm">
                <i className="ph ph-buildings text-5xl text-slate-200 dark:text-slate-700 mb-3 block" />
                <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-1">Discover hotels near you</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
                  {trendingHotelsCity
                    ? `We're expanding in ${trendingHotelsCity}. Search all available stays below.`
                    : 'Search destinations to find the best stays for your next trip.'}
                </p>
                <a
                  href={trendingHotelsCity ? `/stays/results?destination=${encodeURIComponent(trendingHotelsCity)}` : '/stays/results'}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all shadow-md shadow-green-600/20"
                >
                  <i className="ph ph-magnifying-glass" />
                  {trendingHotelsCity ? `Search stays in ${trendingHotelsCity}` : 'Search all stays'}
                </a>
              </div>
            )}

            {/* Browse by property type */}
            <div className="mb-6">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Browse by property type in Manchester</h2>
            </div>
            
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 -mx-6 px-6 lg:mx-0 lg:px-0 snap-x">
              <div className="flex-shrink-0 w-64 md:w-[280px] group cursor-pointer snap-start">
                <div className="h-48 md:h-52 rounded-2xl overflow-hidden mb-3">
                  <img src="https://images.pexels.com/photos/258154/pexels-photo-258154.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop" alt="Hotels" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Hotels</h3>
              </div>
              <div className="flex-shrink-0 w-64 md:w-[280px] group cursor-pointer snap-start">
                <div className="h-48 md:h-52 rounded-2xl overflow-hidden mb-3">
                  <img src="https://images.pexels.com/photos/1918291/pexels-photo-1918291.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop" alt="Apartments" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Apartments</h3>
              </div>
              <div className="flex-shrink-0 w-64 md:w-[280px] group cursor-pointer snap-start">
                <div className="h-48 md:h-52 rounded-2xl overflow-hidden mb-3">
                  <img src="https://images.pexels.com/photos/261394/pexels-photo-261394.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop" alt="Villas" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Villas</h3>
              </div>
              <div className="flex-shrink-0 w-64 md:w-[280px] group cursor-pointer snap-start">
                <div className="h-48 md:h-52 rounded-2xl overflow-hidden mb-3">
                  <img src="https://images.pexels.com/photos/189296/pexels-photo-189296.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop" alt="Resorts" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Resorts</h3>
              </div>
            </div>
          </section>
        )}

        {/* For travel pros section */}
        <section className="max-w-7xl mx-auto px-6 py-16 dark:bg-slate-950 transition-colors">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-8 tracking-tight">For travel pros</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Explore Card */}
            <a href="/explore" className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer block">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Explore</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">See destinations on your budget</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="70" cy="70" r="50" fill="#E2E8F0" className="dark:fill-slate-700" />
                  <circle cx="70" cy="70" r="50" fill="url(#globe-grad)" opacity="0.8" />
                  <path d="M40 50C55 40 85 40 100 50C110 60 110 80 100 90C85 100 55 100 40 90C30 80 30 60 40 50Z" stroke="white" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
                  <circle cx="85" cy="55" r="24" fill="white" stroke="#16A34A" strokeWidth="4" />
                  <path d="M102 72L116 86" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" />
                  <path d="M78 50L85 57L92 50" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="globe-grad" x1="20" y1="20" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#38BDF8" />
                      <stop offset="1" stopColor="#818CF8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </a>

            {/* Trips Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Trips</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Keep all your plans in one place</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="25" y="45" width="90" height="60" rx="4" fill="#F1F5F9" className="dark:fill-slate-700" transform="rotate(-10 70 75)" />
                  <path d="M30 50L110 35M25 70L105 55M20 90L100 75" stroke="#CBD5E1" strokeWidth="1" className="dark:stroke-slate-600" />
                  <rect x="50" y="30" width="40" height="50" rx="4" fill="#F8FAFC" stroke="#16A34A" strokeWidth="2" className="dark:fill-slate-800" />
                  <path d="M55 40H85M55 48H75M55 56H80" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" />
                  <rect x="40" y="70" width="30" height="20" rx="2" fill="#F59E0B" />
                  <circle cx="48" cy="90" r="4" fill="#475569" />
                  <circle cx="62" cy="90" r="4" fill="#475569" />
                  <path d="M45 75H65M45 80H65" stroke="white" strokeWidth="1" opacity="0.5" />
                </svg>
              </div>
            </div>

            {/* Price Alerts Card */}
            <div className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Price Alerts</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Know when prices change</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="45" y="30" width="50" height="85" rx="8" fill="#38BDF8" transform="rotate(15 70 72)" />
                  <rect x="49" y="35" width="42" height="75" rx="4" fill="white" className="dark:fill-slate-800" transform="rotate(15 70 72)" />
                  <path d="M55 50L85 58M53 58L83 66M51 66L81 74" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" className="dark:stroke-slate-700" />
                  <circle cx="50" cy="45" r="16" fill="#F97316" />
                  <path d="M50 38C46 38 44 41 44 44C44 47 41 49 41 51H59C59 49 56 47 56 44C56 41 54 38 50 38Z" fill="white" />
                  <circle cx="50" cy="53" r="2" fill="white" />
                  <path d="M30 80L35 85M110 50L105 55M95 100L100 95M40 40L35 35" stroke="#F97316" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
                  <circle cx="35" cy="65" r="2" fill="#38BDF8" />
                  <circle cx="105" cy="75" r="3" fill="#16A34A" />
                  <circle cx="85" cy="35" r="2" fill="#F59E0B" />
                </svg>
              </div>
            </div>

            {/* Flight Tracker Card */}
            <a href="/tracker" className="bg-white dark:bg-slate-800 rounded-[24px] p-6 sm:p-8 flex flex-col items-center text-center shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-100 dark:border-slate-700 transition-all duration-300 group cursor-pointer block">
              <div className="w-full flex flex-col items-start text-left mb-8">
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-white mb-2 group-hover:text-green-600 transition-colors">Flight Tracker</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">See real-time delays</p>
              </div>
              <div className="relative w-40 h-40 flex items-center justify-center transform group-hover:scale-105 transition-transform duration-500">
                <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="20" y="65" width="100" height="60" rx="6" fill="#1E293B" transform="rotate(-15 70 95)" />
                  <rect x="25" y="70" width="90" height="50" rx="3" fill="#38BDF8" transform="rotate(-15 70 95)" opacity="0.9" />
                  <path d="M35 85Q70 60 105 95" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M45 45L70 30L65 40L90 45L45 75L50 60L35 55L45 45Z" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="1" />
                  <path d="M70 30L65 40L90 45" fill="#E2E8F0" />
                  <circle cx="100" cy="50" r="12" fill="#F59E0B" />
                  <circle cx="95" cy="55" r="8" fill="#F8FAFC" opacity="0.9" />
                  <circle cx="105" cy="55" r="6" fill="#F8FAFC" opacity="0.9" />
                  <rect x="90" y="85" width="24" height="24" rx="4" fill="white" className="dark:fill-slate-800" stroke="#16A34A" strokeWidth="2" transform="rotate(-15 102 97)" />
                  <path d="M96 92L108 102M108 92L96 102" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" transform="rotate(-15 102 97)" />
                </svg>
              </div>
            </a>

          </div>
        </section>

        {/* Dynamic Top Flights from Location Section */}
        <section id="popular-routes-section" className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-100 dark:border-slate-800 dark:bg-slate-950 transition-colors">
          <h2 id="popular-routes-title" className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-1">
            Top flights from Romania
          </h2>
          <p id="popular-routes-subtitle" className="text-slate-500 dark:text-slate-400 font-medium mb-6">
            Explore destinations you can reach from Romania and start making new plans
          </p>

          {/* Dynamic tabs list */}
          <div id="popular-routes-tabs" className="flex flex-wrap gap-2 mb-8">
            <button data-tab="popular" className="px-4 py-2 text-sm font-bold rounded-full border border-green-600 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 transition-all cursor-pointer">
              Popular routes
            </button>
            <button data-tab="cities" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Cities
            </button>
            <button data-tab="countries" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Countries
            </button>
            <button data-tab="regions" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Regions
            </button>
            <button data-tab="airports" className="px-4 py-2 text-sm font-bold rounded-full border border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 transition-all cursor-pointer">
              Airports
            </button>
          </div>

          {/* Grid of routes */}
          <div id="popular-routes-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {/* Populated dynamically by deals.js */}
          </div>
        </section>

        {/* FAQ Accordion Section */}
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-100 dark:border-slate-800 dark:bg-slate-950 transition-colors">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-8">
            Frequently asked questions
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {/* Column 1 */}
            <div className="space-y-4">
              {FAQ_ITEMS[0].map((item, idx) => {
                const id = `col1-${idx}`;
                const isOpen = !!openFaq[id];
                return (
                  <div key={id} className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-800 transition-all duration-300 ${isOpen ? 'border-green-500 shadow-sm shadow-green-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    <button
                      onClick={() => toggleFaq(id)}
                      className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white transition-colors animate-fade-in"
                    >
                      <span>{item.q}</span>
                      <i className={`ph ph-caret-down text-lg text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-green-600' : ''}`}></i>
                    </button>
                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        isOpen ? 'max-h-[300px] border-t border-slate-100 dark:border-slate-700' : 'max-h-0'
                      }`}
                    >
                      <div className="p-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900">
                        {item.a}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              {FAQ_ITEMS[1].map((item, idx) => {
                const id = `col2-${idx}`;
                const isOpen = !!openFaq[id];
                return (
                  <div key={id} className={`border rounded-2xl overflow-hidden bg-white dark:bg-slate-800 transition-all duration-300 ${isOpen ? 'border-green-500 shadow-sm shadow-green-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    <button
                      onClick={() => toggleFaq(id)}
                      className="w-full flex items-center justify-between p-5 text-left font-bold text-slate-800 dark:text-slate-100 hover:text-slate-900 dark:text-slate-100 dark:hover:text-white transition-colors animate-fade-in"
                    >
                      <span>{item.q}</span>
                      <i className={`ph ph-caret-down text-lg text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-green-600' : ''}`}></i>
                    </button>
                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        isOpen ? 'max-h-[300px] border-t border-slate-100 dark:border-slate-700' : 'max-h-0'
                      }`}
                    >
                      <div className="p-5 text-sm text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900">
                        {item.a}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        </>}
      <FlightFooter />
      
    </>

  );
}
