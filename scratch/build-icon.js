/**
 * Builds the square tab icon from the brand "B + swoosh" mark: trims the huge
 * transparent margin of public/images/favicon.png, centres the glyph on a
 * transparent square and exports a 512px PNG for the browser tab + touch icon.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'public', 'images', 'favicon.png');
const OUT = path.join(__dirname, '..', 'public', 'images', 'bookingcart-icon.png');
const SIZE = 512;
const MARGIN = 0.08;

function bbox(png) {
  const box = { left: png.width, top: png.height, right: 0, bottom: 0 };
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
      const ink = a > 20 && !(r > 245 && g > 245 && b > 245);
      if (!ink) continue;
      if (x < box.left) box.left = x;
      if (y < box.top) box.top = y;
      if (x > box.right) box.right = x;
      if (y > box.bottom) box.bottom = y;
    }
  }
  return box;
}

function resample(src, width) {
  const ratio = src.width / width;
  const height = Math.round(src.height / ratio);
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * ratio);
      const x1 = Math.min(src.width, Math.ceil((x + 1) * ratio));
      const y0 = Math.floor(y * ratio);
      const y1 = Math.min(src.height, Math.ceil((y + 1) * ratio));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * src.width + sx) * 4;
          const alpha = src.data[i + 3] / 255;
          r += src.data[i] * alpha;
          g += src.data[i + 1] * alpha;
          b += src.data[i + 2] * alpha;
          a += src.data[i + 3];
          n += 1;
        }
      }
      const i = (y * width + x) * 4;
      const alphaSum = a / 255;
      out.data[i] = Math.round(r / Math.max(1, alphaSum));
      out.data[i + 1] = Math.round(g / Math.max(1, alphaSum));
      out.data[i + 2] = Math.round(b / Math.max(1, alphaSum));
      out.data[i + 3] = Math.round(a / Math.max(1, n));
    }
  }
  return out;
}

const source = PNG.sync.read(fs.readFileSync(SRC));
const box = bbox(source);
const glyphWidth = box.right - box.left + 1;
const glyphHeight = box.bottom - box.top + 1;
const side = Math.round(Math.max(glyphWidth, glyphHeight) * (1 + MARGIN * 2));

// Centre the glyph in a transparent square, then scale the square to SIZE.
const square = new PNG({ width: side, height: side });
square.data.fill(0);
PNG.bitblt(
  source, square,
  box.left, box.top, glyphWidth, glyphHeight,
  Math.round((side - glyphWidth) / 2), Math.round((side - glyphHeight) / 2),
);

fs.writeFileSync(OUT, PNG.sync.write(resample(square, SIZE)));
console.log(`icon ${glyphWidth}x${glyphHeight} -> ${side}x${side} -> ${SIZE}x${SIZE}`, OUT);
