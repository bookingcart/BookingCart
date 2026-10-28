// Ticket artwork uploads.
//
// Artwork is downscaled and re-encoded in the browser first, so a phone photo
// of a poster still fits the serverless request limit, then stored through the
// shared /api/upload endpoint. PNG/WebP sources keep transparency; everything
// else is flattened onto white.

const MAX_EDGE = 1600;
const TARGET_LENGTH = 1_400_000; // base64 characters, roughly 1 MB of binary

// The client artwork slot beside the stub and the company panel. The design
// form, the upload preview and the printed banner all use this one size, so
// what the client composes is exactly what the ticket shows.
export const CLIENT_ARTWORK_SIZE = { width: 851, height: 315 };

function blankCanvas(width, height, keepAlpha) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d');
  if (!keepAlpha) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { canvas, context };
}

function encodeLadder(canvas, keepsAlpha) {
  const encoders = keepsAlpha ? [() => canvas.toDataURL('image/png')] : [];
  encoders.push(
    () => canvas.toDataURL('image/jpeg', 0.9),
    () => canvas.toDataURL('image/jpeg', 0.78),
    () => canvas.toDataURL('image/jpeg', 0.62),
    () => canvas.toDataURL('image/jpeg', 0.5)
  );
  for (const encode of encoders) {
    const dataUrl = encode();
    if (dataUrl.length <= TARGET_LENGTH) return dataUrl;
  }
  return '';
}

// A fixed slot is drawn at exactly the size the design asks for: the source is
// centre-cropped to the slot's ratio, so nothing is stretched and the print
// shows precisely the frame the client composed.
function drawIntoSlot(image, slot, keepsAlpha) {
  const { canvas, context } = blankCanvas(slot.width, slot.height, keepsAlpha);
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

  const dataUrl = encodeLadder(canvas, keepsAlpha);
  if (dataUrl) return dataUrl;

  // A transparent PNG that is still too heavy has to lose its alpha channel.
  const flattened = blankCanvas(slot.width, slot.height, false);
  flattened.context.drawImage(canvas, 0, 0);
  return encodeLadder(flattened.canvas, false);
}

export async function prepareArtwork(file, slot) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Artwork must be less than 20 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();

    const keepsAlpha = /png|webp/i.test(file.type);

    if (slot?.width && slot?.height) {
      const dataUrl = drawIntoSlot(image, slot, keepsAlpha);
      if (!dataUrl) throw new Error('This artwork could not be made small enough. Try another image.');
      return dataUrl;
    }

    let edge = Math.min(MAX_EDGE, Math.max(image.width, image.height));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const scale = edge / Math.max(image.width, image.height);
      const { canvas, context } = blankCanvas(image.width * scale, image.height * scale, keepsAlpha);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const dataUrl = encodeLadder(canvas, keepsAlpha);
      if (dataUrl) return dataUrl;
      edge = Math.round(edge * 0.8);
    }
    throw new Error('This artwork could not be made small enough. Try another image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadArtwork(file, headers, slot) {
  const image = await prepareArtwork(file, slot);
  let response;
  try {
    response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify({ image }),
    });
  } catch {
    throw new Error('Could not reach the server — check your connection and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.url) {
    throw new Error(result.error || 'Artwork upload failed. Please try again.');
  }
  return result.url;
}
