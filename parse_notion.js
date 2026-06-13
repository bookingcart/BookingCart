const fs = require('fs');
fetch('https://notion-api.splitbee.io/v1/page/30615ea949aa801cbf9fcf5649ead6d9').then(r => r.json()).then(data => {
  let text = '';
  for (const key in data) {
    const block = data[key].value;
    if (block && block.properties && block.properties.title) {
      block.properties.title.forEach(t => {
        if (t[0]) text += t[0] + ' ';
      });
      text += '\n';
    }
  }
  console.log(text);
}).catch(e => console.error(e));
