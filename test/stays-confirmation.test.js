'use strict';

/**
 * The stay confirmation is a printed voucher, not a web letter: it wears the
 * same brand band, perforated stub and print rules as the transport and event
 * tickets, and it never shows a raw room number as the room name.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const stayPage = () => read('src/pages/StaysConfirmationPage.jsx');

test('the stay confirmation is a ticket, matching the other passes', () => {
  const page = stayPage();
  assert.match(page, /bookingcart-logo-on-dark\.png/, 'the pass carries the brand band');
  assert.match(page, /Compare · Book · Instant/, 'the brand line matches the other tickets');
  assert.match(page, /ticket-print/, 'the pass must print as one intact card');
  assert.match(page, /border-t-2 border-dashed/, 'a perforated stub holds the reference');
});

test('the old green letter header is gone', () => {
  const page = stayPage();
  assert.doesNotMatch(page, /from-emerald-600 via-emerald-500 to-teal-500/, 'no gradient hero banner');
  assert.doesNotMatch(page, /rounded-t-3xl border border-b-0/, 'the letter is not one tall column anymore');
  assert.match(page, /@media print/, 'printing needs its own rules');
  assert.match(page, /print-hide/, 'the summary panels must drop out of the printout');
});

test('a bare numeric room name is read as a room number', () => {
  const page = stayPage();
  assert.match(page, /\^\\d\+\$/, 'a purely numeric name must be recognised');
  assert.match(page, /`Room \$\{rawRoomName\}`/, 'and printed as "Room 4" rather than "4"');
  assert.match(page, /\{roomLabel\}/, 'the pass shows the tidied label');
});

test('light and dark both have a home on the voucher', () => {
  const page = stayPage();
  assert.match(page, /dark:bg-slate-950/, 'the page needs a dark surface');
  assert.match(page, /dark:bg-slate-800/, 'the summary cards need a dark surface');
});
