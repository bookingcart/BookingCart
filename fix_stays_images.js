const fs = require('fs');

const file = 'src/pages/HomePage.jsx';
let content = fs.readFileSync(file, 'utf8');

const genericTravel = [
  "https://images.pexels.com/photos/325193/pexels-photo-325193.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/460672/pexels-photo-460672.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/338515/pexels-photo-338515.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/290386/pexels-photo-290386.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/3935702/pexels-photo-3935702.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/3290075/pexels-photo-3290075.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/2064827/pexels-photo-2064827.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/777059/pexels-photo-777059.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/1682748/pexels-photo-1682748.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/2031706/pexels-photo-2031706.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/2104152/pexels-photo-2104152.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/421655/pexels-photo-421655.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/2263683/pexels-photo-2263683.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/1174732/pexels-photo-1174732.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/378570/pexels-photo-378570.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/161853/prague-church-city-sky-161853.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/1796715/pexels-photo-1796715.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/315191/pexels-photo-315191.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/1130628/pexels-photo-1130628.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  "https://images.pexels.com/photos/1486222/pexels-photo-1486222.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
];

const specificHotels = {
  hotel: "https://images.pexels.com/photos/258154/pexels-photo-258154.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  apartment: "https://images.pexels.com/photos/439227/pexels-photo-439227.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  villa: "https://images.pexels.com/photos/261394/pexels-photo-261394.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop",
  resort: "https://images.pexels.com/photos/189296/pexels-photo-189296.jpeg?auto=compress&cs=tinysrgb&w=600&h=400&fit=crop"
};

let genericIndex = 0;

content = content.replace(/https:\/\/loremflickr\.com\/[^'"]+/g, (match) => {
  if (match.includes('hotel')) return specificHotels.hotel;
  if (match.includes('apartment')) return specificHotels.apartment;
  if (match.includes('villa')) return specificHotels.villa;
  if (match.includes('resort')) return specificHotels.resort;
  
  const img = genericTravel[genericIndex % genericTravel.length];
  genericIndex++;
  return img;
});

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced loremflickr urls with pexels');
