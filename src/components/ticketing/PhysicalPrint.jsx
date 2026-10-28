import QRCode from 'qrcode';
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
  return `${String(currency || 'USD').toUpperCase()} ${value.toFixed(2)}`;
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
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        return [ticketKey(ticket), url];
      } catch {
        return [ticketKey(ticket), ''];
      }
    })
  );
  return Object.fromEntries(entries);
}

// ─── Ticket sheet ────────────────────────────────────────────────────────────

export function buildTicketSheetHtml({
  tickets = [],
  attraction = {},
  layout = 'a4_4',
  paperSize = 'A4',
  margin = 10,
  terms = '',
  qrMap = {},
  batchRef = '',
  title = 'Admission tickets',
  showPrice = true,
}) {
  const preset = LAYOUTS[layout] || LAYOUTS.a4_4;
  const page = PAPER_CSS[paperSize] || preset.page;
  const safeMargin = Math.max(0, Math.min(30, Number(margin) || 10));
  const isThermal = paperSize === 'Thermal 80mm' || layout === 'thermal';

  const cards = tickets.map((ticket) => {
    const qr = qrMap[ticketKey(ticket)];
    const visit = dateText(ticket.visitDate);
    const slot = ticket.slotLabel ? `<div class="slot">Entry ${escapeHtml(ticket.slotLabel)}</div>` : '';
    return `
      <article class="ticket">
        <div class="stub">
          <div class="type">${escapeHtml(ticket.type || ticket.ticketTypeName || 'Admission')}</div>
          <div class="admissions">${escapeHtml(ticket.admissions ?? ticket.admissionsTotal ?? 1)} ${Number(ticket.admissions ?? ticket.admissionsTotal ?? 1) === 1 ? 'admission' : 'admissions'}</div>
          ${visit ? `<div class="visit">${escapeHtml(visit)}</div>` : ''}
          ${slot}
          ${showPrice && ticket.unitPrice !== undefined
            ? `<div class="price">${escapeHtml(moneyText(ticket.unitPrice, ticket.currency || attraction.currency))}</div>`
            : ''}
        </div>
        <div class="body">
          <div class="head">
            ${attraction.logoUrl ? `<img class="logo" src="${escapeHtml(attraction.logoUrl)}" alt="" />` : ''}
            <div>
              <div class="venue">${escapeHtml(attraction.name || 'Admission')}</div>
              ${attraction.contact ? `<div class="contact">${escapeHtml(attraction.contact)}</div>` : ''}
            </div>
          </div>
          <div class="qr">
            ${qr ? `<img src="${qr}" alt="QR code for ${escapeHtml(ticketKey(ticket))}" />` : '<span class="noqr">QR</span>'}
          </div>
          <div class="no">${escapeHtml(ticketKey(ticket))}</div>
          ${ticket.reference || batchRef
            ? `<div class="ref">Ref ${escapeHtml(ticket.reference || batchRef)}</div>`
            : ''}
        </div>
      </article>`;
  }).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${page}; margin: ${isThermal ? 3 : safeMargin}mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: grid; grid-template-columns: repeat(${preset.columns}, minmax(0, 1fr)); gap: ${isThermal ? 3 : 5}mm; }
  .ticket { display: flex; break-inside: avoid; page-break-inside: avoid; border: 1px solid #cbd5e1; border-radius: 4mm; overflow: hidden; min-height: ${isThermal ? 46 : 44}mm; background: #fff; }
  .stub { width: 32%; padding: 4mm 3mm; background: #0f172a; color: #fff; display: flex; flex-direction: column; gap: 2mm; justify-content: center; }
  .stub .type { font-size: 10pt; font-weight: 700; line-height: 1.15; }
  .stub .admissions { font-size: 8pt; letter-spacing: .04em; text-transform: uppercase; color: #a7f3d0; }
  .stub .visit { font-size: 8pt; color: #e2e8f0; }
  .stub .slot { font-size: 7.5pt; color: #cbd5e1; }
  .stub .price { margin-top: auto; font-size: 9pt; font-weight: 700; }
  .body { flex: 1; display: flex; align-items: center; gap: 3mm; padding: 3mm; }
  .head { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 2mm; }
  .head .logo { width: 9mm; height: 9mm; object-fit: contain; }
  .venue { font-size: 9pt; font-weight: 700; line-height: 1.2; }
  .contact { font-size: 6.5pt; color: #64748b; margin-top: .6mm; }
  .qr { flex: 0 0 auto; text-align: center; }
  .qr img { width: ${isThermal ? 26 : 22}mm; height: ${isThermal ? 26 : 22}mm; display: block; }
  .noqr { display: block; width: 22mm; height: 22mm; border: 1px dashed #cbd5e1; border-radius: 2mm; font-size: 7pt; color: #94a3b8; }
  .no { font-size: 8pt; font-weight: 700; font-family: ui-monospace, Menlo, monospace; letter-spacing: .02em; }
  .ref { font-size: 6.5pt; color: #64748b; }
  .terms { margin-top: 4mm; font-size: 6.5pt; color: #64748b; line-height: 1.4; }
  @media screen { body { padding: 8mm; background: #f8fafc; } }
</style></head>
<body>
  <div class="sheet">${cards || '<p>No tickets selected.</p>'}</div>
  ${terms ? `<div class="terms">${escapeHtml(terms)}</div>` : ''}
</body></html>`;
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
