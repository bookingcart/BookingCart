import QRCode from 'qrcode';
import { CLIENT_ARTWORK_SIZE } from '../../lib/artworkImage.js';
import { Modal } from './TicketingShared.jsx';

// Printing engine for physical tickets and receipts.
//
// Everything is rendered into a self-contained HTML document and sent to a
// hidden iframe, so the browser's own print dialog handles paper size, margins
// and "Save as PDF" without any server round trip. The QR payload is the signed
// ticket token — never a name, email or payment reference.

export const LAYOUTS = {
  a4_1: { label: '1 ticket per A4', page: 'A4 portrait', columns: 1, perPage: 1 },
  a4_4: { label: '4 tickets per A4', page: 'A4 portrait', columns: 2, perPage: 4 },
  a4_8: { label: '8 tickets per A4', page: 'A4 portrait', columns: 2, perPage: 8 },
  thermal: { label: 'Thermal receipt (80mm)', page: '80mm auto', columns: 1, perPage: 1 },
};

export const PAPER_SIZES = ['A4', 'A5', 'Letter', 'Thermal 80mm'];

// The whole ticket is a fixed 900 × 351 proportion. Print layouts derive their
// height from it, and the design panel shows the same face at exactly this
// pixel size, so what the owner composes is what the sheet prints.
export const TICKET_SIZE = { width: 900, height: 351 };
const TICKET_RATIO = TICKET_SIZE.width / TICKET_SIZE.height;

// CSS px per mm at the browser's 96 dpi reference: the face preview lays the
// strip out at one-per-page width and scales it up to TICKET_SIZE.
const PX_PER_MM = 96 / 25.4;
const FACE_WIDTH_MM = 190;

const PAPER_CSS = {
  A4: 'A4 portrait',
  A5: 'A5 portrait',
  Letter: 'Letter portrait',
  'Thermal 80mm': '80mm auto',
};

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function moneyText(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const code = String(currency || 'USD').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'code' }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

function dateText(iso) {
  if (!iso) return '';
  const parsed = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(iso);
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateTimeText(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function ticketKey(ticket) {
  return String(ticket?.ticketNo || ticket?.ticketNumber || '');
}

/** Accept both the API shapes: POS tickets and batch inventory rows. */
export function normalizeTicket(ticket = {}) {
  return {
    ...ticket,
    ticketNo: ticketKey(ticket),
    type: ticket.type || ticket.ticketTypeName || 'Admission',
    admissions: Number(ticket.admissions ?? ticket.admissionsTotal ?? 1),
    reference: ticket.reference || ticket.bookingRef || '',
  };
}

/** Generate QR data URLs for a list of tickets, keyed by ticket number. */
export async function buildQrMap(tickets = []) {
  const entries = await Promise.all(
    tickets.map(async (ticket) => {
      const payload = ticket.qrToken || ticket.qrCode || ticketKey(ticket);
      if (!payload) return [ticketKey(ticket), ''];
      try {
        const url = await QRCode.toDataURL(String(payload), {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 240,
          color: { dark: '#000000', light: '#ffffff' },
        });
        return [ticketKey(ticket), url];
      } catch (error) {
        console.warn('[ticket-qr] could not render', error);
        return [ticketKey(ticket), ''];
      }
    })
  );
  return Object.fromEntries(entries);
}

// ─── Ticket sheet ────────────────────────────────────────────────────────────

/**
 * Every ticket is a three-panel strip, mirroring the printed design:
 *   1. the admission stub  — pass label, QR, ticket number, price (torn off)
 *   2. the company panel   — artwork an administrator uploads once, printed on
 *                            every ticket the platform issues
 *   3. the client panel    — the attraction's own 851 × 315 px artwork, printed
 *                            full-bleed with the venue and visit captioned over
 *                            the foot of it
 */
function artworkTag(url, fit, className = 'art') {
  if (!url) return '';
  const mode = fit === 'contain' ? 'contain' : 'cover';
  return `<img class="${className} fit-${mode}" src="${escapeHtml(url)}" alt="" />`;
}

function buildCompanyPanel(company = {}) {
  const name = company.companyName || 'BookingCart';
  const tagline = company.companyTagline || '';
  // Panel space is scarce at 4-up, so the domain prints without the "www."
  // prefix — it still resolves, and the whole address stays on one line.
  const website = String(company.companyWebsite || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
  const artwork = artworkTag(company.artworkUrl, company.artworkFit);
  return `
      <div class="company">
        ${artwork}
        ${artwork ? '<div class="scrim"></div>' : ''}
        <div class="company-top">
          <div class="company-name">${escapeHtml(name)}</div>
          ${tagline ? `<div class="company-tagline">${escapeHtml(tagline)}</div>` : ''}
        </div>
        ${website ? `<div class="company-site">${escapeHtml(website)}</div>` : ''}
      </div>`;
}

function buildClientPanel({ attraction, ticket, reference, admissions, visit, slot }) {
  const artwork = artworkTag(attraction.artworkUrl, attraction.artworkFit);
  const detail = [ticket.type, `${admissions} ${admissions === 1 ? 'admission' : 'admissions'}`].filter(Boolean).join(' · ');
  const when = [visit, slot].filter(Boolean).join(' · ');
  // With artwork on the ticket the panel belongs to the client's design, so only
  // the two facts a steward reads off it — venue and visit — are captioned over
  // the foot. Without artwork the panel prints the full details instead.
  const caption = [detail, when].filter(Boolean).join(' · ');
  const fill = artwork && attraction.artworkFit === 'contain'
    ? `<div class="art-fill" style="background-image: url(&quot;${escapeHtml(attraction.artworkUrl)}&quot;)"></div>`
    : '';
  const details = artwork
    ? (caption ? `<div class="line strong">${escapeHtml(caption)}</div>` : '')
    : [
      detail ? `<div class="line strong">${escapeHtml(detail)}</div>` : '',
      when ? `<div class="line">${escapeHtml(when)}</div>` : '',
      attraction.contact ? `<div class="line soft">${escapeHtml(attraction.contact)}</div>` : '',
      reference ? `<div class="line soft mono">Ref ${escapeHtml(reference)}</div>` : '',
    ].join('');
  return `
      <div class="client ${artwork ? 'has-art' : 'no-art'}">
        ${fill}
        ${artwork}
        <div class="client-body">
          <div class="venue-row">
            ${attraction.logoUrl ? `<img class="logo" src="${escapeHtml(attraction.logoUrl)}" alt="" />` : ''}
            <div class="venue">${escapeHtml(attraction.name || 'Admission')}</div>
          </div>
          ${details}
        </div>
      </div>`;
}

function buildThermalCard({ ticket, attraction, company, reference, admissions, visit, slot, priceText, qr }) {
  const detail = [ticket.type, `${admissions} ${admissions === 1 ? 'admission' : 'admissions'}`].filter(Boolean).join(' · ');
  const when = [visit, slot].filter(Boolean).join(' · ');
  const band = artworkTag(company.artworkUrl, 'cover', 't-band');
  return `
      <article class="ticket thermal">
        <div class="t-pass">Tourism Pass</div>
        <div class="t-venue">${escapeHtml(attraction.name || 'Admission')}</div>
        ${detail ? `<div class="t-line">${escapeHtml(detail)}</div>` : ''}
        ${when ? `<div class="t-line">${escapeHtml(when)}</div>` : ''}
        <div class="t-qr">${qr ? `<img src="${qr}" alt="QR code for ${escapeHtml(ticketKey(ticket))}" />` : '<span class="noqr">QR</span>'}</div>
        <div class="t-no">${escapeHtml(ticketKey(ticket))}</div>
        ${priceText ? `<div class="t-price">${escapeHtml(priceText)}</div>` : ''}
        ${reference ? `<div class="t-line soft">Ref ${escapeHtml(reference)}</div>` : ''}
        ${band}
        <div class="t-company">
          ${escapeHtml(company.companyName || 'BookingCart')}${company.companyTagline ? ` · ${escapeHtml(company.companyTagline)}` : ''}${company.companyWebsite ? ` · ${escapeHtml(company.companyWebsite)}` : ''}
        </div>
      </article>`;
}

export function buildTicketSheetHtml({
  tickets = [],
  attraction = {},
  company = {},
  layout = 'a4_4',
  paperSize = 'A4',
  margin = 10,
  terms = '',
  qrMap = {},
  batchRef = '',
  title = 'Admission tickets',
  showPrice = true,
  preview = false,
  face = false,
}) {
  const preset = LAYOUTS[layout] || LAYOUTS.a4_4;
  const page = PAPER_CSS[paperSize] || preset.page;
  const safeMargin = Math.max(0, Math.min(30, Number(margin) || 10));
  const isThermal = paperSize === 'Thermal 80mm' || layout === 'thermal';
  // One ticket per page has room for a larger QR and type; a 4/8-up sheet has
  // to stay legible at roughly half an A4 width.
  const roomy = preset.perPage === 1 && !isThermal;
  const qrSize = isThermal ? 26 : roomy ? 30 : 14;
  // The 900-wide face preview: the strip is laid out at one-per-page width and
  // scaled up into a TICKET_SIZE box, so type and artwork keep their print
  // proportions instead of being re-invented at screen sizes.
  const faceScale = TICKET_SIZE.width / (FACE_WIDTH_MM * PX_PER_MM);
  const faceCss = face ? `
  @media screen {
    html, body { width: ${TICKET_SIZE.width}px; height: ${TICKET_SIZE.height}px; margin: 0; padding: 0; overflow: hidden; background: #fff; }
    .sheet { display: block; max-width: none; }
    .ticket { width: ${FACE_WIDTH_MM}mm; height: ${(FACE_WIDTH_MM / TICKET_RATIO).toFixed(2)}mm; transform: scale(${faceScale.toFixed(5)}); transform-origin: top left; }
  }` : '';

  const cards = tickets.map((ticket) => {
    const qr = qrMap[ticketKey(ticket)];
    const visit = dateText(ticket.visitDate);
    const slot = ticket.slotLabel ? `Entry ${ticket.slotLabel}` : '';
    const admissions = Number(ticket.admissions ?? ticket.admissionsTotal ?? 1);
    const reference = ticket.reference || batchRef;
    const priceText = showPrice && ticket.unitPrice !== undefined
      ? moneyText(ticket.unitPrice, ticket.currency || attraction.currency)
      : '';

    if (isThermal) {
      return buildThermalCard({ ticket, attraction, company, reference, admissions, visit, slot, priceText, qr });
    }

    return `
      <article class="ticket">
        <div class="stub">
          <div class="pass">Tourism Pass</div>
          <div class="stub-block">
            <div class="cap">Ticket number</div>
            <div class="no">${escapeHtml(ticketKey(ticket))}</div>
          </div>
          <div class="qr">
            ${qr ? `<img src="${qr}" alt="QR code for ${escapeHtml(ticketKey(ticket))}" />` : '<span class="noqr">QR</span>'}
          </div>
          ${priceText ? `<div class="stub-block"><div class="cap">Ticket price</div><div class="price">${escapeHtml(priceText)}</div></div>` : ''}
        </div>
        ${buildCompanyPanel(company)}
        ${buildClientPanel({ attraction, ticket, reference, admissions, visit, slot })}
      </article>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${page}; margin: ${isThermal ? 3 : safeMargin}mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: grid; grid-template-columns: repeat(${preset.columns}, minmax(0, 1fr)); gap: ${isThermal ? 3 : 5}mm; }

  .ticket { display: flex; break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 3mm; overflow: hidden; aspect-ratio: ${TICKET_SIZE.width} / ${TICKET_SIZE.height}; background: #fff; }

  /* 1 — admission stub: white card, black QR, the three facts a steward checks */
  .stub { width: ${roomy ? 20 : 22}%; flex: 0 0 auto; padding: ${roomy ? '4mm 3mm' : '1.4mm'}; background: #fff; color: #0f172a; display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: ${roomy ? 2 : '.8'}mm; text-align: left; border-right: 1px dashed #9aa7b8; }
  .stub .pass { font-size: ${roomy ? 13 : 6.8}pt; font-weight: 800; line-height: 1.05; letter-spacing: -.02em; }
  .stub .qr { align-self: center; line-height: 0; }
  .stub .qr img { width: ${qrSize}mm; height: ${qrSize}mm; display: block; }
  .stub .noqr { display: flex; align-items: center; justify-content: center; width: ${qrSize}mm; height: ${qrSize}mm; border: 1px dashed #cbd5e1; border-radius: 1.5mm; font-size: 6pt; color: #94a3b8; }
  .stub .cap { font-size: ${roomy ? 6.6 : 4.4}pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #64748b; }
  .stub .no { font-family: ui-monospace, Menlo, monospace; font-size: ${roomy ? 9 : 4.6}pt; font-weight: 700; line-height: 1.2; word-break: break-all; }
  .stub .price { font-size: ${roomy ? 11 : 6.8}pt; font-weight: 800; line-height: 1.15; }

  /* 2 — company artwork panel */
  .company { position: relative; width: ${roomy ? 22 : 24}%; flex: 0 0 auto; display: flex; flex-direction: column; justify-content: space-between; gap: 1.5mm; padding: ${roomy ? '4mm 3mm' : '2mm 1.8mm'}; overflow: hidden; color: #fff; background: linear-gradient(150deg, #15803d 0%, #16a34a 58%, #15803d 100%); }
  .company .art, .client .art { position: absolute; inset: 0; width: 100%; height: 100%; }
  .art.fit-cover { object-fit: cover; }
  .art.fit-contain { object-fit: contain; }
  .company .art.fit-contain { background: #0f3d24; }
  .client .art.fit-contain { background: transparent; }
  .company .scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(3,28,17,.78) 0%, rgba(3,28,17,.22) 45%, rgba(3,28,17,.86) 100%); }
  .company-top, .company-site { position: relative; z-index: 1; }
  .company-name { font-size: ${roomy ? 13 : 7.2}pt; font-weight: 800; font-style: italic; letter-spacing: -.02em; line-height: 1.05; text-transform: uppercase; }
  .company-tagline { font-size: ${roomy ? 7 : 5.4}pt; font-weight: 600; font-style: italic; color: #dcfce7; margin-top: .8mm; }
  .company-site { font-size: ${roomy ? 6.8 : 5}pt; font-weight: 700; font-style: italic; text-decoration: underline; color: #dcfce7; letter-spacing: .02em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* 3 — client artwork space: the client's design fills the panel */
  .client { position: relative; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; background: #eef2f7; }
  /* Clients compose their artwork at ${CLIENT_ARTWORK_SIZE.width} × ${CLIENT_ARTWORK_SIZE.height} px and it prints over the whole
     panel. A "fit inside" upload leaves bands top and bottom, so a blurred copy
     of the same artwork fills them and the panel still reads as one surface. */
  .client .art-fill { position: absolute; inset: -3mm; background-size: cover; background-position: center; filter: blur(5mm); opacity: .4; }
  .client-body { position: relative; z-index: 1; padding: ${roomy ? '4mm' : '1.6mm 2mm'}; display: flex; flex-direction: column; gap: ${roomy ? '.7' : '.4'}mm; color: #0f172a; }
  .client.has-art .client-body { background: linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.9) 30%, rgba(255,255,255,.97) 100%); }
  .venue-row { display: flex; align-items: center; gap: 1.6mm; }
  .venue-row .logo { height: ${roomy ? 9 : 6}mm; width: auto; max-width: 18mm; object-fit: contain; flex: 0 0 auto; }
  .venue { font-size: ${roomy ? 11 : 8}pt; font-weight: 800; line-height: ${roomy ? 1.15 : 1.12}; }
  .line { font-size: ${roomy ? 7.4 : 6}pt; line-height: ${roomy ? 1.3 : 1.25}; }
  .line.strong { font-weight: 700; }
  .line.soft { color: #64748b; }
  .line.mono { font-family: ui-monospace, Menlo, monospace; }

  /* Thermal roll */
  .ticket.thermal { display: block; aspect-ratio: auto; min-height: 0; padding: 3mm; border-radius: 2mm; text-align: center; }
  .t-pass { font-size: 8pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #1d4ed8; }
  .t-venue { font-size: 10pt; font-weight: 800; margin-top: 1mm; line-height: 1.2; }
  .t-line { font-size: 7pt; margin-top: .8mm; }
  .t-line.soft { color: #64748b; }
  .t-qr { margin: 2.5mm 0 1mm; }
  .t-qr img { width: 26mm; height: 26mm; display: block; margin: 0 auto; }
  .t-qr .noqr { display: block; margin: 0 auto; width: 26mm; height: 26mm; border: 1px dashed #cbd5e1; border-radius: 1.5mm; font-size: 6pt; color: #94a3b8; }
  .t-no { font-family: ui-monospace, Menlo, monospace; font-size: 8pt; font-weight: 700; }
  .t-price { font-size: 10pt; font-weight: 800; margin-top: .8mm; }
  .t-band { display: block; width: 100%; height: 12mm; object-fit: cover; border-radius: 1.5mm; margin-top: 2.5mm; }
  .t-company { font-size: 6pt; font-weight: 600; color: #334155; margin-top: 2mm; border-top: 1px dashed #cbd5e1; padding-top: 1.5mm; }

  .terms { margin-top: 4mm; font-size: 6.5pt; color: #64748b; line-height: 1.4; }
  @media screen {
    body { padding: 8mm; background: #f8fafc; }
    .sheet { ${preview ? 'max-width: 1000px; margin: 0 auto;' : ''} }
    .ticket { box-shadow: 0 8px 24px rgba(15, 23, 42, .10); }
  }
  ${faceCss}
</style></head>
<body>
  <div class="sheet">${cards || '<p>No tickets selected.</p>'}</div>
  ${terms ? `<div class="terms">${escapeHtml(terms)}</div>` : ''}
</body></html>`;
}

/**
 * Print call sites all receive the POS `context`; this mapper keeps the
 * attraction artwork and the platform artwork consistent across them.
 */
export function printAttraction(context = {}) {
  const attraction = context.attraction || {};
  const settings = context.settings || {};
  return {
    ...attraction,
    logoUrl: settings.ticketLogoUrl || attraction.logoUrl || '',
    contact: settings.ticketContact || attraction.contact || '',
    artworkUrl: settings.ticketArtworkUrl || attraction.artworkUrl || '',
    artworkFit: settings.ticketArtworkFit || attraction.artworkFit || 'cover',
  };
}

export function printCompany(context = {}) {
  return context.company || {};
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

export function buildReceiptHtml({ receipt, paperSize = 'Thermal 80mm', margin = 4 }) {
  if (!receipt) return '';
  const page = PAPER_CSS[paperSize] || '80mm auto';
  const rows = (receipt.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}${Number(item.quantity) > 1 ? ` × ${Number(item.quantity)}` : ''}</td>
      <td class="right">${escapeHtml(moneyText(item.lineTotal, receipt.currency))}</td>
    </tr>`).join('');

  const tickets = (receipt.tickets || [])
    .map((ticket) => `<li>${escapeHtml(ticket.ticketNo)} · ${escapeHtml(ticket.type || '')} · ${Number(ticket.admissions)} adm.</li>`)
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Receipt ${escapeHtml(receipt.receiptNo)}</title>
<style>
  @page { size: ${page}; margin: ${Math.max(0, Number(margin) || 4)}mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #0f172a; font-size: 9pt; -webkit-print-color-adjust: exact; }
  .wrap { max-width: ${paperSize === 'Thermal 80mm' ? '72mm' : '110mm'}; margin: 0 auto; }
  h1 { font-size: 11pt; margin: 0 0 1mm; }
  .muted { color: #64748b; font-size: 7.5pt; }
  .rule { border-top: 1px dashed #94a3b8; margin: 3mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  td { padding: .8mm 0; vertical-align: top; }
  .right { text-align: right; white-space: nowrap; }
  .total { font-size: 11pt; font-weight: 700; }
  ul { margin: 1mm 0 0; padding-left: 4mm; font-size: 7.5pt; font-family: ui-monospace, Menlo, monospace; }
  .center { text-align: center; }
  @media screen { body { padding: 6mm; background: #f8fafc; } .wrap { background: #fff; padding: 5mm; border-radius: 3mm; } }
</style></head>
<body><div class="wrap">
  <div class="center">
    ${receipt.attraction?.logoUrl ? `<img src="${escapeHtml(receipt.attraction.logoUrl)}" alt="" style="height:12mm;object-fit:contain" />` : ''}
    <h1>${escapeHtml(receipt.attraction?.name || 'Attraction')}</h1>
    ${receipt.attraction?.contact ? `<div class="muted">${escapeHtml(receipt.attraction.contact)}</div>` : ''}
    ${receipt.attraction?.header ? `<div class="muted">${escapeHtml(receipt.attraction.header)}</div>` : ''}
  </div>
  <div class="rule"></div>
  <table>
    <tr><td class="muted">Receipt</td><td class="right">${escapeHtml(receipt.receiptNo || '—')}</td></tr>
    <tr><td class="muted">Sale</td><td class="right">${escapeHtml(receipt.saleRef || '—')}</td></tr>
    <tr><td class="muted">Date</td><td class="right">${escapeHtml(dateTimeText(receipt.createdAt))}</td></tr>
    <tr><td class="muted">Cashier</td><td class="right">${escapeHtml(receipt.cashier?.name || receipt.cashier?.email || '—')}</td></tr>
    ${receipt.customerName ? `<tr><td class="muted">Visitor</td><td class="right">${escapeHtml(receipt.customerName)}</td></tr>` : ''}
    <tr><td class="muted">Visit</td><td class="right">${escapeHtml(dateText(receipt.visitDate))}</td></tr>
  </table>
  <div class="rule"></div>
  <table>
    ${rows || '<tr><td class="muted">No line items</td><td></td></tr>'}
    <tr><td class="muted">Subtotal</td><td class="right">${escapeHtml(moneyText(receipt.subtotal, receipt.currency))}</td></tr>
    ${Number(receipt.discount) > 0 ? `<tr><td class="muted">Discount${receipt.promoCode ? ` (${escapeHtml(receipt.promoCode)})` : ''}</td><td class="right">−${escapeHtml(moneyText(receipt.discount, receipt.currency))}</td></tr>` : ''}
    ${Number(receipt.taxAmount) > 0 ? `<tr><td class="muted">Tax</td><td class="right">${escapeHtml(moneyText(receipt.taxAmount, receipt.currency))}</td></tr>` : ''}
    ${Number(receipt.serviceFee) > 0 ? `<tr><td class="muted">Service fee</td><td class="right">${escapeHtml(moneyText(receipt.serviceFee, receipt.currency))}</td></tr>` : ''}
  </table>
  <div class="rule"></div>
  <table>
    <tr><td class="total">Total paid</td><td class="total right">${escapeHtml(moneyText(receipt.total, receipt.currency))}</td></tr>
    <tr><td class="muted">Method</td><td class="right">${escapeHtml(String(receipt.paymentMethod || '').replace(/_/g, ' '))}</td></tr>
    ${Number(receipt.amountReceived) > 0 ? `<tr><td class="muted">Received</td><td class="right">${escapeHtml(moneyText(receipt.amountReceived, receipt.currency))}</td></tr>` : ''}
    ${Number(receipt.changeGiven) > 0 ? `<tr><td class="muted">Change</td><td class="right">${escapeHtml(moneyText(receipt.changeGiven, receipt.currency))}</td></tr>` : ''}
  </table>
  ${tickets ? `<div class="rule"></div><div class="muted">Tickets</div><ul>${tickets}</ul>` : ''}
  <div class="rule"></div>
  <div class="center muted">
    ${escapeHtml(receipt.attraction?.footer || 'Thank you for visiting.')}
    ${receipt.attraction?.terms ? `<br />${escapeHtml(receipt.attraction.terms)}` : ''}
  </div>
</div></body></html>`;
}

// ─── Printing ────────────────────────────────────────────────────────────────

/**
 * Print an HTML document through a hidden iframe. Returns a cleanup function.
 * If the browser blocks printing we still remove the frame, so the caller can
 * surface a "printer unavailable" message without losing the sale.
 */
export function printHtml(html, { title = 'ticket' } = {}) {
  if (typeof document === 'undefined' || !html) return Promise.resolve(false);

  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('title', title);
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 800);
      resolve(ok);
    };

    try {
      const doc = frame.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      frame.contentWindow.onafterprint = () => finish(true);
      window.setTimeout(() => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          finish(true);
        } catch {
          finish(false);
        }
      }, 350);
      // Never leave the frame behind if the dialog is cancelled silently.
      window.setTimeout(() => finish(true), 60000);
    } catch {
      finish(false);
    }
  });
}

export function downloadHtml(html, filename = 'tickets.html') {
  if (typeof document === 'undefined' || !html) return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function PrintPreview({ open, onClose, html, title = 'Print preview', children }) {
  return (
    <Modal open={open} onClose={onClose} title={title} icon="ph-printer" wide>
      <iframe
        title={title}
        srcDoc={html}
        className="w-full h-[60vh] bg-white rounded-2xl border border-slate-200 dark:border-slate-700"
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">{children}</div>
    </Modal>
  );
}
