// Ticket artwork uploads.
//
// Artwork is downscaled and re-encoded in the browser first, so a phone photo
// of a poster still fits the serverless request limit, then stored through the
// shared /api/upload endpoint. PNG/WebP sources keep transparency; everything
// else is flattened onto white.

const MAX_EDGE = 1600;
const TARGET_LENGTH = 1_400_000; // base64 characters, roughly 1 MB of binary

export async function prepareArtwork(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Artwork must be less than 20 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();

    const keepsAlpha = /png|webp/i.test(file.type);
    let edge = Math.min(MAX_EDGE, Math.max(image.width, image.height));

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const scale = edge / Math.max(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const encoders = keepsAlpha
        ? [() => canvas.toDataURL('image/png'), () => canvas.toDataURL('image/jpeg', 0.9)]
        : [];
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
      edge = Math.round(edge * 0.8);
    }
    throw new Error('This artwork could not be made small enough. Try another image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadArtwork(file, headers) {
  const image = await prepareArtwork(file);
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
