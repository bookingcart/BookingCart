const fs = require('fs');
const path = 'public/js/account-settings.js';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('function escapeHTML')) {
  const escapeFunc = `
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
`;
  content = content.replace('const state = {', escapeFunc + '\nconst state = {');
}

// 1. renderLoginActivity
content = content.replace(/\$\{a\.device\}/g, '${escapeHTML(a.device)}');
content = content.replace(/\$\{a\.location\}/g, '${escapeHTML(a.location)}');
content = content.replace(/\$\{a\.date\}/g, '${escapeHTML(a.date)}');

// 2. renderPaymentMethods
content = content.replace(/\$\{p\.brand\}/g, '${escapeHTML(p.brand)}');
content = content.replace(/\$\{p\.last4\}/g, '${escapeHTML(p.last4)}');
content = content.replace(/\$\{p\.expiry\}/g, '${escapeHTML(p.expiry)}');

// 3. renderTrips
content = content.replace(/\$\{t\.destination\}/g, '${escapeHTML(t.destination)}');
content = content.replace(/\$\{t\.date\}/g, '${escapeHTML(t.date)}');

// 4. renderSearchHistory
content = content.replace(/\$\{s\.query\}/g, '${escapeHTML(s.query)}');
content = content.replace(/\$\{s\.date\}/g, '${escapeHTML(s.date)}');

// 5. renderSavedFlights
content = content.replace(/\$\{f\.route\}/g, '${escapeHTML(f.route)}');
content = content.replace(/\$\{f\.airline\}/g, '${escapeHTML(f.airline)}');
content = content.replace(/\$\{f\.price\}/g, '${escapeHTML(f.price)}');

// 6. toast innerHTML
content = content.replace(
  'toast.innerHTML = `<i class="ph ${icon} text-xl"></i> ${message}`;',
  'toast.innerHTML = `<i class="ph ${icon} text-xl"></i> <span></span>`;\n  toast.querySelector("span").textContent = message;'
);

fs.writeFileSync(path, content);
