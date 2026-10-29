'use strict';

/**
 * Guards header density: the desktop row holds the logo, five section links,
 * the utility tools, a context CTA and the account cluster. If the low-value
 * items stop giving way at xl, the links start drawing over the logo again.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const navbar = fs.readFileSync(path.join(ROOT, 'src/components/BookingCartNavbar.jsx'), 'utf8');

test('the header row widens on large screens and keeps its groups in flow', () => {
  assert.match(navbar, /max-w-7xl px-4 sm:px-6 2xl:max-w-\[1500px\]/, 'the row needs the extra 2xl width');
  assert.match(navbar, /flex h-16 items-center justify-between gap-4/, 'the row must stay a single non-wrapping flex line');
  assert.match(navbar, /className="bookingcart-nav hidden min-w-0 flex-1 items-center justify-center gap-0\.5 xl:flex"/);
  assert.match(navbar, /flex h-9 shrink-0 items-center gap-1\.5 rounded-xl px-2\.5[^`]*whitespace-nowrap/);
});

test('decorative items step aside below 2xl so the nav links never collide', () => {
  assert.match(navbar, /bookingcart-currency hidden h-9[^"]*2xl:flex/, 'the currency read-out is display-only and hides below 2xl');
  assert.match(navbar, /<span className="hidden 2xl:inline">Support<\/span>/, 'Support keeps its icon below 2xl, its label at 2xl');
  assert.match(navbar, /aria-label="Support"/, 'the icon-only Support link still needs an accessible name');
  assert.match(navbar, /ph \$\{icon\} hidden text-sm 2xl:inline/, 'nav icons return only where there is room');
});
