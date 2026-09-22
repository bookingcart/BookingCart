const fs = require('fs');
const path = require('path');
const { verifyRequestBearer } = require('../lib/jwt');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const auth = await verifyRequestBearer(req);
    if (!auth.ok) return res.status(401).json({ ok: false, error: 'Authentication required' });

    const { image, folder } = req.body;
    if (!image) return res.status(400).json({ ok: false, error: 'No image data provided' });

    // Validate and parse the data URL
    const matches = image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ ok: false, error: 'Invalid base64 image data' });
    }

    const type = matches[1];
    const data = Buffer.from(matches[2], 'base64');
    
    // Choose the extension
    let ext = 'jpg';
    if (type.includes('png')) ext = 'png';
    else if (type.includes('gif')) ext = 'gif';
    else if (type.includes('webp')) ext = 'webp';
    else if (type.includes('jpeg')) ext = 'jpg';

    // Build the upload directory
    const targetFolder = folder || 'misc';
    // Prevent directory traversal
    if (targetFolder.includes('..') || targetFolder.includes('/')) {
      return res.status(400).json({ ok: false, error: 'Invalid folder name' });
    }

    const uploadDir = path.join(__dirname, '../public/uploads', targetFolder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate a unique filename
    const filename = `${auth.userId || 'user'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // Save the file
    fs.writeFileSync(filePath, data);

    // Return the public URL
    const publicUrl = `/uploads/${targetFolder}/${filename}`;
    return res.status(200).json({ ok: true, url: publicUrl });
  } catch (err) {
    console.error('[upload] Error saving image:', err);
    return res.status(500).json({ ok: false, error: 'Failed to upload image' });
  }
};
