// src/lib/camera.js
// Shared camera helpers for the QR validators (cinema, attractions, stays,
// transport and aviation all mount the same scanners).
//
// Two things decide whether a scan can start, and neither is visible in the UI
// otherwise: the document must be a secure context, and the hosting headers must
// allow `camera=(self)` in Permissions-Policy. These helpers turn the browser
// failures into instructions a staff member at the door can act on.

const REAR_CAMERA = /back|rear|environment|world/i;
const FRONT_CAMERA = /front|fac(e|ing|al)|user|selfie/i;
// USB/HDMI capture sticks, document cameras and scanner guns report names like
// these; at a venue door they are what staff actually point at the ticket.
const EXTERNAL_CAMERA = /external|usb|hdmi|capture|scanner|barcode|document/i;

/** Phones list the front camera first, so prefer the rear one for scanning. */
export function pickRearCamera(devices = []) {
  if (!devices.length) return null;
  return devices.find((device) => REAR_CAMERA.test(device.label || ''))
    || [...devices].reverse().find((device) => !FRONT_CAMERA.test(device.label || ''))
    || devices[0];
}

export function isExternalCamera(device) {
  return EXTERNAL_CAMERA.test(String(device?.label || ''));
}

/**
 * An explicit choice always wins, then a plugged-in camera or scanner, then the
 * rear phone camera. Used both when starting and when a device is hot-swapped.
 */
export function pickBestCamera(devices = [], preferredId = '') {
  if (!devices.length) return null;
  const chosen = preferredId && devices.find((device) => device.id === preferredId);
  if (chosen) return chosen;
  return devices.find((device) => isExternalCamera(device)) || pickRearCamera(devices);
}

/** Readable name for a device that may not expose its label until permitted. */
export function cameraLabel(device, index = 0) {
  const label = String(device?.label || '').trim();
  if (label) return label;
  return `Camera ${index + 1}`;
}

/** Video inputs currently attached, including ones added after the page loaded. */
export async function listVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  } catch {
    return [];
  }
}

/** Empty string when the browser can try, otherwise the reason it cannot. */
export function cameraUnavailableReason() {
  if (typeof window === 'undefined') return '';
  if (cameraPolicyBlocked()) {
    return 'This site is sending a camera-blocking Permissions-Policy, so no camera can open anywhere in the dashboard. It must allow camera=(self) — see vercel.json / netlify.toml — then reload. Type the ticket number until then.';
  }
  if (!window.isSecureContext) {
    return 'The camera only works on a secure page. Open this dashboard on its https:// address and try again.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'This browser cannot open the camera. Type the ticket number instead.';
  }
  return '';
}

/**
 * True when this page's own Permissions-Policy forbids the camera. A policy block
 * and a user denial both raise NotAllowedError, so the header is the only way to
 * tell a clerk whether reloading or changing a browser setting could help.
 */
export function cameraPolicyBlocked() {
  if (typeof document === 'undefined') return false;
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (!policy || typeof policy.allowsFeature !== 'function') return false;
  try {
    return !policy.allowsFeature('camera');
  } catch {
    return false;
  }
}

/** A message worth showing for the error html5-qrcode or getUserMedia throws. */
export function cameraErrorMessage(error) {
  const name = error?.name || '';
  if (cameraPolicyBlocked()) {
    return cameraUnavailableReason();
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then tap Scan QR again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found on this device. Type the ticket number instead.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The camera is already in use by another app or tab. Close it and try again.';
  }
  const detail = String(error?.message || '').trim();
  return detail ? `Could not start the camera: ${detail}` : 'Could not start the camera. Type the ticket number instead.';
}
