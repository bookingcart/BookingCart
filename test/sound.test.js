'use strict';

/**
 * Guards the sound contract: chimes are synthesised (no missing asset risk),
 * every confirmation route celebrates exactly once per booking, incoming
 * notifications ping, and the visitor can mute both.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('chimes are synthesised with the Web Audio API', () => {
  const sound = read('src/lib/sound.js');
  assert.match(sound, /new Ctor\(\)/, 'the store must create an AudioContext lazily');
  assert.match(sound, /createOscillator\(\)/, 'tones must be generated, not loaded from files');
  assert.match(sound, /exponentialRampToValueAtTime/, 'notes need an envelope so they never click');
  assert.match(sound, /booking\(at\)/, 'the booking chime must exist');
  assert.match(sound, /notification\(at\)/, 'the notification chime must exist');
});

test('audio survives the autoplay policy and the mute preference', () => {
  const sound = read('src/lib/sound.js');
  assert.match(sound, /localStorage\.getItem\(SOUND_KEY\) !== 'off'/, 'sound must be on unless muted');
  assert.match(sound, /localStorage\.setItem\(SOUND_KEY, enabled \? 'on' : 'off'\)/, 'muting must persist');
  assert.match(sound, /window\.addEventListener\('pointerdown', unlock/, 'the first gesture must unlock audio');
  assert.match(sound, /window\.addEventListener\('keydown', unlock/, 'keyboard users need the unlock too');
  assert.match(sound, /PENDING_TTL_MS/, 'a chime requested before the gesture must be held, not lost');
  assert.match(sound, /if \(!soundEnabled\(\) \|\| !CHIMES\[name\]\) return false;/, 'muted or unknown sounds must stay silent');

  assert.match(read('src/main.jsx'), /initSound\(\)/, 'main.jsx must wire the unlock on boot');
});

test('a booking chimes once, not on every revisit of the ticket link', () => {
  const sound = read('src/lib/sound.js');
  assert.match(sound, /sessionStorage\.getItem\(PLAYED_KEY\)/, 'played bookings must be remembered for the tab');
  assert.match(sound, /REPLAY_WINDOW_MS/, 'the guard must expire so later bookings still chime');
  assert.match(sound, /export function useBookingSound\(key\)/, 'pages need a single hook to fire the chime');

  const pages = [
    'src/pages/ConfirmationPage.jsx',
    'src/pages/StaysConfirmationPage.jsx',
    'src/pages/TourGuideConfirmationPage.jsx',
    'src/pages/EventConfirmationPage.jsx',
    'src/pages/TransportConfirmationPage.jsx',
    'src/pages/AttractionTicketsConfirmationPage.jsx',
    'src/pages/CinemaConfirmationPage.jsx',
    'src/pages/AviationConfirmationPage.jsx',
  ];
  pages.forEach((file) => {
    const page = read(file);
    assert.match(page, /import \{ useBookingSound \} from ['"]\.\.\/lib\/sound\.js['"]/, `${file} must import the chime hook`);
    assert.match(page, /useBookingSound\(/, `${file} must fire the booking chime`);
  });

  // Unpaid or cancelled states must not celebrate.
  assert.match(read('src/pages/CinemaConfirmationPage.jsx'), /status === 'confirmed'/, 'cinema waits for a confirmed order');
  assert.match(read('src/pages/AttractionTicketsConfirmationPage.jsx'), /status === 'confirmed'/, 'attractions wait for a paid ticket');
  assert.match(read('src/pages/EventConfirmationPage.jsx'), /booking\?\.status === 'confirmed'/, 'events wait for confirmed payment');
  assert.match(read('src/pages/TransportConfirmationPage.jsx'), /order\.status !== 'cancelled'/, 'cancelled transport bookings stay silent');
});

test('incoming notifications ping as they arrive', () => {
  const bell = read('src/components/NotificationBell.jsx');
  assert.match(bell, /import \{ playNotificationSound \} from '\.\.\/lib\/sound\.js'/);
  assert.match(bell, /setUnread\(\(n\) => n \+ 1\);\s*\/\/[^\n]*\n\s*playNotificationSound\(\);/, 'the SSE push must play the chime');
});

test('the visitor can mute sound from the header and the drawer', () => {
  const navbar = read('src/components/BookingCartNavbar.jsx');
  assert.match(navbar, /import \{ SoundToggle, SoundToggleRow \} from '\.\/SoundToggle\.jsx'/);
  assert.match(navbar, /<SoundToggle \/>/, 'desktop header tools need the mute button');
  assert.match(navbar, /<SoundToggleRow \/>/, 'the mobile drawer needs the switch');

  const toggle = read('src/components/SoundToggle.jsx');
  assert.match(toggle, /aria-label=\{label\}/, 'the icon button must be labelled for screen readers');
  assert.match(toggle, /aria-pressed=\{enabled\}/, 'the icon button must report its state');
  assert.match(toggle, /role="switch"/, 'the drawer row must read as a switch');
  assert.match(toggle, /aria-checked=\{enabled\}/, 'the switch must report its state');
  assert.match(toggle, /const \{ enabled, toggle \} = useSound\(\)/, 'both controls must share one store');
});
