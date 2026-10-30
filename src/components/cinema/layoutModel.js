// Pure helpers behind the auditorium layout editor.
//
// The document shape matches lib/cinema-layout.js on the server, so what the
// owner drags around here is exactly what gets validated and published. Every
// helper returns a new document: the editor keeps history snapshots, and
// mutating in place would make undo impossible.

export const SEAT_STATUSES = ['available', 'blocked', 'out_of_service'];
export const MAX_COLS = 60;
export const MAX_ROWS = 200;
export const MAX_SEATS = 800;

let autoId = 0;

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round2(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function clampInt(value, min, max, fallback = min) {
  return Math.min(max, Math.max(min, toInt(value, fallback)));
}

/** A, B … Z, AA, AB … so long halls keep readable row names. */
export function rowLabel(index) {
  let value = '';
  let remaining = Math.max(0, toInt(index, 0));
  do {
    value = String.fromCharCode(65 + (remaining % 26)) + value;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return value;
}

export function rowIndex(label) {
  const value = String(label || '').toUpperCase();
  if (!/^[A-Z]{1,4}$/.test(value)) return -1;
  let total = 0;
  for (const character of value) total = total * 26 + (character.charCodeAt(0) - 64);
  return total - 1;
}

export function nextSeatId() {
  autoId += 1;
  return `s-${Date.now().toString(36)}-${autoId}`;
}

export function seatKey(seat) {
  return `${seat.row}${seat.number}`;
}

export function normalizeSeat(seat = {}, index = 0) {
  const row = String(seat.row || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 4);
  const price = seat.priceOverride;
  return {
    id: String(seat.id || `seat-${index}`),
    row,
    number: toInt(seat.number ?? seat.no, 0),
    x: clampInt(seat.x, 1, MAX_COLS, 1),
    y: clampInt(seat.y, 1, MAX_ROWS, 1),
    category: String(seat.category || 'standard'),
    status: SEAT_STATUSES.includes(seat.status) ? seat.status : 'available',
    priceOverride: price === null || price === undefined || price === '' ? null : Math.max(0, round2(price)),
    label: String(seat.label || seat.customLabel || '').slice(0, 24),
  };
}

/** Rebuild a predictable document from anything the server (or a template) sent. */
export function normalizeDoc(input = {}) {
  const spacing = input.spacing && typeof input.spacing === 'object' ? input.spacing : {};
  const screen = input.screen && typeof input.screen === 'object' ? input.screen : {};
  const seats = Array.isArray(input.seats) ? input.seats.slice(0, MAX_SEATS + 50).map(normalizeSeat) : [];
  return {
    v: 1,
    cols: clampInt(input.cols, 4, MAX_COLS, 16),
    spacing: {
      seat: clampInt(spacing.seat, 0, 24, 4),
      row: clampInt(spacing.row, 0, 40, 10),
    },
    screen: {
      position: screen.position === 'bottom' ? 'bottom' : 'top',
      width: clampInt(screen.width, 20, 100, 70),
      label: String(screen.label || '').slice(0, 40),
    },
    seats,
    aisles: (Array.isArray(input.aisles) ? input.aisles : []).slice(0, 40).map((aisle, index) => ({
      id: String(aisle.id || `aisle-${index}`),
      fromX: clampInt(aisle.fromX ?? aisle.x, 1, MAX_COLS, 1),
      width: clampInt(aisle.width, 1, 8, 1),
      fromY: clampInt(aisle.fromY ?? aisle.y0, 1, MAX_ROWS, 1),
      toY: clampInt(aisle.toY ?? aisle.y1, 1, MAX_ROWS, 1),
      label: String(aisle.label || '').slice(0, 24),
    })),
    entrances: (Array.isArray(input.entrances) ? input.entrances : []).slice(0, 20).map((entrance, index) => ({
      id: String(entrance.id || `entrance-${index}`),
      side: ['left', 'right', 'top', 'bottom'].includes(entrance.side) ? entrance.side : 'left',
      offset: clampInt(entrance.offset, 0, 100, 50),
      label: String(entrance.label || 'Entrance').slice(0, 24),
    })),
    sections: (Array.isArray(input.sections) ? input.sections : []).slice(0, 20).map((section, index) => ({
      id: String(section.id || `section-${index}`),
      name: String(section.name || `Section ${index + 1}`).slice(0, 40),
      color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(section.color || '')) ? String(section.color) : '',
      rows: Array.isArray(section.rows)
        ? Array.from(new Set(section.rows.map((row) => String(row || '').toUpperCase().slice(0, 4)).filter(Boolean)))
        : [],
    })),
  };
}

/** A simple rectangle of seats, used for new halls and for “add row”. */
export function gridDoc({ rows = 6, perRow = 10, cols = 16, category = 'standard', screenLabel = '' } = {}) {
  const width = Math.min(cols, perRow);
  const startX = Math.max(1, Math.floor((cols - width) / 2) + 1);
  const seats = [];
  for (let r = 0; r < rows; r += 1) {
    for (let s = 0; s < width; s += 1) {
      seats.push(normalizeSeat({
        id: nextSeatId(),
        row: rowLabel(r),
        number: s + 1,
        x: startX + s,
        y: r + 1,
        category,
      }));
    }
  }
  return normalizeDoc({
    cols,
    spacing: { seat: 4, row: 10 },
    screen: { position: 'top', width: 70, label: screenLabel },
    seats,
  });
}

export function cloneDoc(doc) {
  return normalizeDoc(JSON.parse(JSON.stringify(doc || {})));
}

export function rowsOf(doc) {
  const map = new Map();
  for (const seat of doc.seats) {
    if (!map.has(seat.row)) map.set(seat.row, []);
    map.get(seat.row).push(seat);
  }
  return Array.from(map.entries())
    .map(([label, seats]) => ({
      label,
      y: Math.min(...seats.map((seat) => seat.y)),
      seats: [...seats].sort((a, b) => a.number - b.number || a.x - b.x),
    }))
    .sort((a, b) => a.y - b.y || rowIndex(a.label) - rowIndex(b.label));
}

export function statsOf(doc) {
  const byCategory = {};
  for (const seat of doc.seats) {
    byCategory[seat.category] = (byCategory[seat.category] || 0) + 1;
  }
  return {
    total: doc.seats.length,
    saleable: doc.seats.filter((seat) => seat.status === 'available').length,
    blocked: doc.seats.filter((seat) => seat.status !== 'available').length,
    rows: new Set(doc.seats.map((seat) => seat.row)).size,
    byCategory,
  };
}

/** Fast client-side mirror of the server validation, so Publish is never a surprise. */
export function issuesOf(doc, seatTypes = []) {
  const errors = [];
  const warnings = [];
  const slugs = new Set(seatTypes.map((type) => type.slug));
  if (!doc.seats.length) errors.push('Add at least one seat before publishing.');
  if (doc.seats.length > MAX_SEATS) errors.push(`An auditorium cannot hold more than ${MAX_SEATS} seats.`);

  const seen = new Set();
  const duplicates = new Set();
  const cells = new Map();
  for (const seat of doc.seats) {
    const key = seatKey(seat);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    if (!seat.row) errors.push(`A seat on row ${seat.y} has no row label.`);
    if (seat.number < 1) errors.push(`Seat ${key || '?'} has an invalid number.`);
    if (seat.x < 1 || seat.x > doc.cols) errors.push(`Seat ${key} sits outside the auditorium width.`);
    if (!seat.y) errors.push(`Seat ${key} has no row position.`);
    if (slugs.size && !slugs.has(seat.category)) errors.push(`Seat ${key} uses the unknown type “${seat.category}”.`);
    const cell = `${seat.x}:${seat.y}`;
    if (cells.has(cell)) errors.push(`Seats ${cells.get(cell)} and ${key} sit on the same spot.`);
    else cells.set(cell, key);
  }
  if (duplicates.size) errors.push(`Duplicate seat numbers: ${Array.from(duplicates).slice(0, 8).join(', ')}.`);

  const wheelchairs = doc.seats.filter((seat) => seat.category === 'wheelchair'
    || seatTypes.find((type) => type.slug === seat.category)?.accessible);
  const companions = doc.seats.filter((seat) => seat.category === 'companion');
  if (!wheelchairs.length) warnings.push('No wheelchair space yet — add one so the hall is accessible.');
  else if (!companions.length) warnings.push('Wheelchair spaces have no companion seat next to them.');

  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)) };
}

// ─── Seat operations ─────────────────────────────────────────────────────────

export function addSeat(doc, { row = 'A', x = 1, y = 1, category = 'standard' } = {}) {
  const inRow = doc.seats.filter((seat) => seat.row === row);
  const number = inRow.length ? Math.max(...inRow.map((seat) => seat.number)) + 1 : 1;
  const next = {
    ...doc,
    seats: [...doc.seats, normalizeSeat({
      id: nextSeatId(), row, number, x, y, category,
    })],
  };
  return next;
}

/** Append a whole row of seats below the last one. */
export function addRow(doc, { count = 0, category = 'standard', label = '' } = {}) {
  const bottom = doc.seats.reduce((best, seat) => (!best || seat.y > best.y ? seat : best), null);
  const lastY = bottom ? bottom.y : 0;
  const nextIndex = bottom ? rowIndex(bottom.row) + 1 : 0;
  const row = String(label || rowLabel(Math.max(0, nextIndex))).toUpperCase().slice(0, 4);
  const seats = [];
  // Without an explicit count the new row copies the row above, so skipped numbers
  // and the gap where an aisle runs stay put instead of one long block through the hall.
  const above = bottom ? doc.seats.filter((seat) => seat.y === bottom.y).sort((a, b) => a.x - b.x) : [];
  if (!count && above.length) {
    for (const seat of above) {
      seats.push(normalizeSeat({ id: nextSeatId(), row, number: seat.number, x: seat.x, y: lastY + 1, category }));
    }
  } else {
    const total = count || above.length || 10;
    const startX = Math.max(1, Math.ceil((doc.cols - total) / 2) + 1);
    for (let index = 0; index < total; index += 1) {
      seats.push(normalizeSeat({
        id: nextSeatId(),
        row,
        number: index + 1,
        x: Math.min(doc.cols, startX + index),
        y: lastY + 1,
        category,
      }));
    }
  }
  return { ...doc, seats: [...doc.seats, ...seats] };
}

export function removeSeats(doc, ids) {
  const remove = new Set(ids);
  return { ...doc, seats: doc.seats.filter((seat) => !remove.has(seat.id)) };
}

export function removeRow(doc, label) {
  return { ...doc, seats: doc.seats.filter((seat) => seat.row !== label) };
}

export function patchSeats(doc, ids, patch) {
  const target = new Set(ids);
  return {
    ...doc,
    seats: doc.seats.map((seat) => {
      if (!target.has(seat.id)) return seat;
      const next = { ...seat, ...patch };
      if (patch.priceOverride !== undefined) {
        next.priceOverride = patch.priceOverride === null || patch.priceOverride === '' ? null : Math.max(0, round2(patch.priceOverride));
      }
      return next;
    }),
  };
}

export function renumberSelection(doc, ids, start = 1, step = 1) {
  const target = new Set(ids);
  const ordered = doc.seats
    .filter((seat) => target.has(seat.id))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  let number = Math.max(1, toInt(start, 1));
  const numbering = new Map();
  for (const seat of ordered) {
    numbering.set(seat.id, number);
    number += Math.max(1, toInt(step, 1));
  }
  return {
    ...doc,
    seats: doc.seats.map((seat) => (numbering.has(seat.id) ? { ...seat, number: numbering.get(seat.id) } : seat)),
  };
}

export function renameRow(doc, label, nextLabel) {
  const clean = String(nextLabel || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 4);
  if (!clean || clean === label) return doc;
  return {
    ...doc,
    seats: doc.seats.map((seat) => (seat.row === label ? { ...seat, row: clean } : seat)),
    sections: doc.sections.map((section) => ({
      ...section,
      rows: section.rows.map((row) => (row === label ? clean : row)),
    })),
  };
}

/** Move every selected seat, stopping short of the hall edges and of other seats. */
export function moveSeats(doc, ids, dx, dy) {
  const target = new Set(ids);
  const chosen = doc.seats.filter((seat) => target.has(seat.id));
  if (!chosen.length) return doc;
  const occupied = new Set(
    doc.seats.filter((seat) => !target.has(seat.id)).map((seat) => `${seat.x}:${seat.y}`)
  );
  const minX = Math.min(...chosen.map((seat) => seat.x));
  const maxX = Math.max(...chosen.map((seat) => seat.x));
  const minY = Math.min(...chosen.map((seat) => seat.y));
  const maxY = Math.max(...chosen.map((seat) => seat.y));
  const wantedX = Math.min(Math.max(dx, 1 - minX), doc.cols - maxX);
  const wantedY = Math.min(Math.max(dy, 1 - minY), MAX_ROWS - maxY);
  const free = (shiftX, shiftY) => chosen.every((seat) => !occupied.has(`${seat.x + shiftX}:${seat.y + shiftY}`));
  // Slide as far as the free cells allow instead of dropping a seat onto another one.
  const steps = Math.max(Math.abs(wantedX), Math.abs(wantedY));
  let shiftX = 0;
  let shiftY = 0;
  for (let step = steps; step >= 1; step -= 1) {
    const tryX = Math.round((wantedX * step) / steps);
    const tryY = Math.round((wantedY * step) / steps);
    if (free(tryX, tryY)) {
      shiftX = tryX;
      shiftY = tryY;
      break;
    }
  }
  if (!shiftX && !shiftY) return doc;
  return {
    ...doc,
    seats: doc.seats.map((seat) => (target.has(seat.id)
      ? { ...seat, x: seat.x + shiftX, y: seat.y + shiftY }
      : seat)),
  };
}

export function boundsOf(seats) {
  return {
    minX: Math.min(...seats.map((seat) => seat.x)),
    maxX: Math.max(...seats.map((seat) => seat.x)),
    minY: Math.min(...seats.map((seat) => seat.y)),
    maxY: Math.max(...seats.map((seat) => seat.y)),
  };
}

/** Rotate a block of seats 90° clockwise inside its own bounding box. */
export function rotateSeats(doc, ids) {
  const target = new Set(ids);
  const chosen = doc.seats.filter((seat) => target.has(seat.id));
  if (chosen.length < 2) return doc;
  const { minX, maxX, minY, maxY } = boundsOf(chosen);
  return {
    ...doc,
    seats: doc.seats.map((seat) => {
      if (!target.has(seat.id)) return seat;
      const offsetX = seat.x - minX;
      const offsetY = seat.y - minY;
      return { ...seat, x: minX + (maxY - minY - offsetY), y: minY + offsetX };
    }),
  };
}

export function mirrorSeats(doc, ids) {
  const target = new Set(ids);
  const chosen = doc.seats.filter((seat) => target.has(seat.id));
  if (chosen.length < 2) return doc;
  const { minX, maxX } = boundsOf(chosen);
  return {
    ...doc,
    seats: doc.seats.map((seat) => (target.has(seat.id)
      ? { ...seat, x: maxX - (seat.x - minX) + minX }
      : seat)),
  };
}

export function setSeatTypeEverywhere(doc, from, to) {
  return {
    ...doc,
    seats: doc.seats.map((seat) => (seat.category === from ? { ...seat, category: to } : seat)),
  };
}

/** Selected seats grouped into contiguous row runs, for “select row” helpers. */
export function rowIds(doc, label) {
  return doc.seats.filter((seat) => seat.row === label).map((seat) => seat.id);
}

export function sectionIds(doc, sectionId) {
  const section = doc.sections.find((entry) => entry.id === sectionId);
  if (!section) return [];
  const rows = new Set(section.rows);
  return doc.seats.filter((seat) => rows.has(seat.row)).map((seat) => seat.id);
}

export function priceLabel(seat, seatTypes) {
  const type = seatTypes.find((entry) => entry.slug === seat.category);
  if (seat.priceOverride !== null && seat.priceOverride !== undefined) return seat.priceOverride;
  return type?.defaultPrice ?? null;
}
