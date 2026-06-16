const fs = require('fs');

const file = 'public/js/deals.js';
let content = fs.readFileSync(file, 'utf8');

const pexelsImages = {
  'new york': 'https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'london': 'https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'paris': 'https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'tokyo': 'https://images.pexels.com/photos/2552584/pexels-photo-2552584.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'dubai': 'https://images.pexels.com/photos/325193/pexels-photo-325193.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'singapore': 'https://images.pexels.com/photos/777059/pexels-photo-777059.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'rome': 'https://images.pexels.com/photos/1797161/pexels-photo-1797161.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'barcelona': 'https://images.pexels.com/photos/1388030/pexels-photo-1388030.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'amsterdam': 'https://images.pexels.com/photos/2031706/pexels-photo-2031706.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'sydney': 'https://images.pexels.com/photos/219692/pexels-photo-219692.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'bangkok': 'https://images.pexels.com/photos/1682748/pexels-photo-1682748.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'istanbul': 'https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'las vegas': 'https://images.pexels.com/photos/2837909/pexels-photo-2837909.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'miami': 'https://images.pexels.com/photos/421655/pexels-photo-421655.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'los angeles': 'https://images.pexels.com/photos/2263683/pexels-photo-2263683.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop',
  'fallback': 'https://images.pexels.com/photos/358319/pexels-photo-358319.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop'
};

content = content.replace(/'new york': 'https:\/\/loremflickr\.com[^']+'/, `'new york': '${pexelsImages['new york']}'`);
content = content.replace(/'london': 'https:\/\/loremflickr\.com[^']+'/, `'london': '${pexelsImages['london']}'`);
content = content.replace(/'paris': 'https:\/\/loremflickr\.com[^']+'/, `'paris': '${pexelsImages['paris']}'`);
content = content.replace(/'tokyo': 'https:\/\/loremflickr\.com[^']+'/, `'tokyo': '${pexelsImages['tokyo']}'`);
content = content.replace(/'dubai': 'https:\/\/loremflickr\.com[^']+'/, `'dubai': '${pexelsImages['dubai']}'`);
content = content.replace(/'singapore': 'https:\/\/loremflickr\.com[^']+'/, `'singapore': '${pexelsImages['singapore']}'`);
content = content.replace(/'rome': 'https:\/\/loremflickr\.com[^']+'/, `'rome': '${pexelsImages['rome']}'`);
content = content.replace(/'barcelona': 'https:\/\/loremflickr\.com[^']+'/, `'barcelona': '${pexelsImages['barcelona']}'`);
content = content.replace(/'amsterdam': 'https:\/\/loremflickr\.com[^']+'/, `'amsterdam': '${pexelsImages['amsterdam']}'`);
content = content.replace(/'sydney': 'https:\/\/loremflickr\.com[^']+'/, `'sydney': '${pexelsImages['sydney']}'`);
content = content.replace(/'bangkok': 'https:\/\/loremflickr\.com[^']+'/, `'bangkok': '${pexelsImages['bangkok']}'`);
content = content.replace(/'istanbul': 'https:\/\/loremflickr\.com[^']+'/, `'istanbul': '${pexelsImages['istanbul']}'`);
content = content.replace(/'las vegas': 'https:\/\/loremflickr\.com[^']+'/, `'las vegas': '${pexelsImages['las vegas']}'`);
content = content.replace(/'miami': 'https:\/\/loremflickr\.com[^']+'/, `'miami': '${pexelsImages['miami']}'`);
content = content.replace(/'los angeles': 'https:\/\/loremflickr\.com[^']+'/, `'los angeles': '${pexelsImages['los angeles']}'`);

content = content.replace(/const FALLBACK_IMAGE = 'https:\/\/loremflickr\.com[^']+';/, `const FALLBACK_IMAGE = '${pexelsImages['fallback']}';`);

// Let's also make sure we use deal.imageUrl if available
content = content.replace(/const imgUrl = getImage\(deal\.image \|\| deal\.city\);/, `const imgUrl = deal.imageUrl || getImage(deal.image || deal.city);`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed deals.js images');
