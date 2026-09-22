'use strict';

const { randomUUID } = require('node:crypto');
const { query, initDb, isDbConfigured } = require('../lib/db');
const { verifyRequestBearer } = require('../lib/google-verify');

let tableReady;
async function ensureTable() {
  if (!tableReady) {
    tableReady = query(`CREATE TABLE IF NOT EXISTS bc_uploaded_images (
      id UUID PRIMARY KEY,
      owner_email TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      image_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch(error => { tableReady = null; throw error; });
  }
  await tableReady;
}

module.exports = async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ ok: false, error: 'Image storage is unavailable.' });
  await initDb();
  await ensureTable();

  if (req.method === 'GET') {
    const id = String(req.params?.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(404).end();
    }
    const result = await query('SELECT mime_type, image_data FROM bc_uploaded_images WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).end();
    res.setHeader('Content-Type', result.rows[0].mime_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).end(result.rows[0].image_data);
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const auth = await verifyRequestBearer(req);
  if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

  const image = req.body?.image;
  const match = typeof image === 'string' && image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return res.status(400).json({ ok: false, error: 'Choose a JPEG, PNG or WebP image.' });
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 2 * 1024 * 1024) {
    return res.status(413).json({ ok: false, error: 'Photo must be less than 2 MB after processing.' });
  }
  const validSignature = match[1] === 'jpeg'
    ? data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : match[1] === 'png'
      ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!validSignature) return res.status(400).json({ ok: false, error: 'The photo file is invalid.' });
  const mime = `image/${match[1]}`;
  const id = randomUUID();
  await query(
    'INSERT INTO bc_uploaded_images (id, owner_email, mime_type, image_data) VALUES ($1, $2, $3, $4)',
    [id, auth.email, mime, data]
  );
  return res.status(201).json({ ok: true, url: `/api/upload/${id}` });
};
