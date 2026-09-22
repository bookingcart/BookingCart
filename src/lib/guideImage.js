// Keep individual photo uploads small for the serverless request limit.
export async function prepareGuideImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Photo must be less than 20 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    let edge = Math.min(1400, Math.max(image.width, image.height));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const scale = edge / Math.max(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68, 0.54, 0.4]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= 135000) return dataUrl;
      }
      edge = Math.round(edge * 0.78);
    }
    throw new Error('This photo could not be made small enough. Try another image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadGuideImage(file, token) {
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const image = await prepareGuideImage(file);
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.url) throw new Error(result.error || 'Photo upload failed. Please try again.');
  return result.url;
}
