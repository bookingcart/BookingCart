/**
 * Crops the official BookingCart wordmarks to their ink box so they can be used
 * at a predictable height in the navbar, ticket headers and the splash screen.
 * The supplied art is 2000x740 with ~65% transparent padding.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const PAD = 6;
// The mark never renders wider than ~200px, so 720px keeps it crisp at 2x DPR
// without shipping a 1810px-wide file to every visitor.
const TARGET_WIDTH = 720;

function downscale(png, targetWidth) {
  const ratio = png.width / targetWidth;
  const width = targetWidth;
  const height = Math.round(png.height / ratio);
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Box filter over the source block keeps the anti-aliased edges smooth.
      const x0 = Math.floor(x * ratio);
      const x1 = Math.min(png.width, Math.ceil((x + 1) * ratio));
      const y0 = Math.floor(y * ratio);
      const y1 = Math.min(png.height, Math.ceil((y + 1) * ratio));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * png.width + sx) * 4;
          const alpha = png.data[i + 3] / 255;
          r += png.data[i] * alpha;
          g += png.data[i + 1] * alpha;
          b += png.data[i + 2] * alpha;
          a += png.data[i + 3];
          n += 1;
        }
      }
      const i = (y * width + x) * 4;
      const weight = Math.max(1, n) * (a / Math.max(1, n) / 255);
      out.data[i] = Math.round(r / Math.max(1, weight));
      out.data[i + 1] = Math.round(g / Math.max(1, weight));
      out.data[i + 2] = Math.round(b / Math.max(1, weight));
      out.data[i + 3] = Math.round(a / Math.max(1, n));
    }
  }
  return out;
}

function crop(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const left = Math.max(0, minX - PAD);
  const top = Math.max(0, minY - PAD);
  const right = Math.min(png.width - 1, maxX + PAD);
  const bottom = Math.min(png.height - 1, maxY + PAD);
  const width = right - left + 1;
  const height = bottom - top + 1;

  const out = new PNG({ width, height });
  PNG.bitblt(png, out, left, top, width, height, 0, 0);
  const scaled = downscale(out, Math.min(TARGET_WIDTH, width));
  fs.writeFileSync(file, PNG.sync.write(scaled));
  console.log(path.basename(file), `${png.width}x${png.height} -> ${width}x${height} -> ${scaled.width}x${scaled.height}`);
}

// Pass file names to re-crop a single variant; with no args both are processed.
const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : ['public/images/bookingcart-logo.png', 'public/images/bookingcart-logo-on-dark.png'];
targets.forEach((file) => crop(path.join(__dirname, '..', file)));
