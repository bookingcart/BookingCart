        let allBookings = [];
        let currentFilter = 'all';
        const loadingUi = window.bookingcartLoading;

        function setStatsLoading(isLoading) {
            const ids = ['stat-total', 'stat-new', 'stat-confirmed', 'stat-issued', 'stat-downloads', 'stat-revenue', 'stat-users'];
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (isLoading) {
                    el.innerHTML = '<span class="bc-skeleton bc-skeleton-line" style="display:inline-block;width:72px;height:18px;border-radius:999px"></span>';
                }
            });
        }

        function setTableLoading(isLoading) {
            const body = document.getElementById('bookings-body');
            const empty = document.getElementById('empty-state');
            if (!body || !empty) return;
            if (isLoading) {
                empty.style.display = 'none';
                if (loadingUi && typeof loadingUi.renderTableSkeletons === 'function') {
                    loadingUi.renderTableSkeletons(body, 6, 7);
                } else {
                    body.innerHTML = '<tr><td colspan="7" class="px-6 py-10 text-center text-slate-400">Loading…</td></tr>';
                }
            }
        }

        // â”€â”€ PIN Login â”€â”€
        const overlay = document.getElementById('login-overlay');
        const pinInput = document.getElementById('pin-input');
        const pinBtn = document.getElementById('pin-btn');
        const pinError = document.getElementById('pin-error');

        pinBtn.addEventListener('click', tryLogin);
        pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

        async function tryLogin() {
            adminPin = pinInput.value.trim();
            if (!adminPin) return;
            pinError.style.display = 'none';
            try {
                setStatsLoading(true);
                setTableLoading(true);
                const resp = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'list', pin: adminPin })
                });
                const data = await resp.json();
                if (!data.ok) {
                    pinError.textContent = data.error || 'Invalid PIN';
                    pinError.style.display = 'block';
                    return;
                }
                overlay.style.display = 'none';
                allBookings = data.bookings || [];
                renderAll();
            } catch (err) {
                setStatsLoading(false);
                pinError.textContent = 'Error: ' + err.message;
                pinError.style.display = 'block';
            }
        }

        // â”€â”€ Refresh â”€â”€
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', loadBookings);

        async function loadBookings() {
            try {
                setStatsLoading(true);
                setTableLoading(true);
                const resp = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'list', pin: adminPin })
                });
                const data = await resp.json();
                if (data.ok) {
                    allBookings = data.bookings || [];
                    renderAll();
                }
                setStatsLoading(false);
            } catch (e) { console.error(e); }
        }

        // â”€â”€ Filters â”€â”€
        document.querySelectorAll('.admin-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilter = btn.dataset.filter;
                document.querySelectorAll('.admin-filter').forEach(b => {
                    b.className = 'admin-filter px-3 py-1.5 rounded-lg text-sm font-semibold ' +
                        (b.dataset.filter === currentFilter
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200');
                });
                renderTable();
            });
        });

        // â”€â”€ Render â”€â”€
        function renderAll() {
            renderStats();
            renderTable();
            loadUserCount();
        }

        async function loadUserCount() {
            try {
                const resp = await fetch('/api/user?action=count&pin=' + encodeURIComponent(adminPin));
                const data = await resp.json();
                if (data.ok) {
                    document.getElementById('stat-users').textContent = data.count || 0;
                }
                if (loadingUi && typeof loadingUi.setBusy === 'function') {
                    loadingUi.setBusy(document.getElementById('stat-users'), false);
                }
            } catch (e) { console.error('Failed to load user count:', e); }
        }

        function renderStats() {
            document.getElementById('stat-total').textContent = allBookings.length;
            document.getElementById('stat-new').textContent = allBookings.filter(b => b.status === 'new').length;
            document.getElementById('stat-confirmed').textContent = allBookings.filter(b => b.status === 'confirmed').length;
            document.getElementById('stat-issued').textContent = allBookings.filter(b => b.status === 'issued').length;

            const totalDownloads = allBookings.reduce((sum, b) => sum + (b.downloadCount || 0), 0);
            document.getElementById('stat-downloads').textContent = totalDownloads;

            const revenue = allBookings
                .filter(b => b.status === 'confirmed' || b.status === 'issued')
                .reduce((sum, b) => sum + (parseFloat(b.total) || 0), 0);
            document.getElementById('stat-revenue').textContent = '$' + Math.round(revenue).toLocaleString();
            setStatsLoading(false);
        }

        function renderTable() {
            const filtered = currentFilter === 'all'
                ? allBookings
                : allBookings.filter(b => b.status === currentFilter);

            const body = document.getElementById('bookings-body');
            const empty = document.getElementById('empty-state');

            if (!filtered.length) {
                body.innerHTML = '';
                empty.style.display = 'block';
                setStatsLoading(false);
                if (loadingUi && typeof loadingUi.setBusy === 'function') {
                    loadingUi.setBusy(body, false);
                }
                return;
            }
            empty.style.display = 'none';
            if (loadingUi && typeof loadingUi.setBusy === 'function') {
                loadingUi.setBusy(body, false);
            }

            body.innerHTML = filtered.map(b => {
                const statusColors = {
                    new: 'bg-yellow-100 text-yellow-700',
                    confirmed: 'bg-green-100 text-green-700',
                    issued: 'bg-purple-100 text-purple-700',
                    cancelled: 'bg-red-100 text-red-700'
                };
                const badge = statusColors[b.status] || 'bg-slate-100 text-slate-700';
                const email = (b.contact && b.contact.email) || '—';
                const paxCount = (b.passengers && b.passengers.length) || 1;
                const clientContent = `<div>${email}</div><div class="text-xs text-slate-400 mt-0.5">${paxCount} passenger${paxCount > 1 ? 's' : ''}</div>`;
                const airline = (b.flight && b.flight.airline) ? b.flight.airline : '—';
                const routeContent = `<div>${b.route || '—'}</div><div class="text-xs font-bold text-indigo-600 mt-0.5"><i class="ph-fill ph-airplane-tilt"></i> ${airline}</div>`;
                const total = b.total ? ('$' + b.total) : '—';

                return `
          <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-4 font-bold text-slate-900">${b.ref || '—'}</td>
            <td class="px-6 py-4 text-slate-600">${clientContent}</td>
            <td class="px-6 py-4 font-medium text-slate-700">${routeContent}</td>
            <td class="px-6 py-4 text-slate-600">${b.dates || '—'}</td>
            <td class="px-6 py-4 font-bold text-green-600">${total}</td>
            <td class="px-6 py-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${badge} capitalize">${b.status}</span></td>
            <td class="px-6 py-4 text-right">
              <div class="flex justify-end gap-2">
                ${(b.status === 'confirmed') ? `<button onclick="generateTicketPDF('${b.ref}')" class="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors"><i class="ph-bold ph-magic-wand"></i> Generate</button>` : ''}
                ${(b.status === 'confirmed') ? `<button onclick="openUploadModal('${b.ref}')" class="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors"><i class="ph-bold ph-upload-simple"></i> Upload</button>` : ''}
                ${(b.status === 'issued') ? `<button onclick="generateTicketPDF('${b.ref}')" class="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-colors"><i class="ph-bold ph-magic-wand"></i> Regenerate</button>` : ''}
                ${(b.status === 'issued') ? `<button onclick="openUploadModal('${b.ref}')" class="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200 transition-colors"><i class="ph-bold ph-arrows-down-up"></i> Update</button>` : ''}
                ${(b.status !== 'confirmed' && b.status !== 'issued') ? `<button onclick="setStatus('${b.ref}','confirmed')" class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors">Confirm</button>` : ''}
                ${b.status !== 'cancelled' ? `<button onclick="setStatus('${b.ref}','cancelled')" class="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-bold hover:bg-red-200 transition-colors">Cancel</button>` : ''}
              </div>
            </td>
          </tr>`;
            }).join('');
        }

        // â”€â”€ Status Update â”€â”€
        async function setStatus(ref, newStatus) {
            try {
                const resp = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'status', id: ref, status: newStatus, pin: adminPin })
                });
                const data = await resp.json();
                if (data.ok) {
                    await loadBookings();
                } else {
                    alert('Error: ' + (data.error || 'Unknown'));
                }
            } catch (err) {
                alert('Error: ' + err.message);
            }
        }

        // ── Ticket Upload ──
        let currentUploadRef = null;

        function openUploadModal(ref) {
            const b = allBookings.find(x => x.ref === ref);
            if (!b) return;
            currentUploadRef = ref;

            document.getElementById('upload-ref').textContent = b.ref;
            document.getElementById('upload-route').textContent = b.route || '—';

            const paxCount = (b.passengers && b.passengers.length) || 1;
            const paxName = (b.passengers && b.passengers[0]) ? ((b.passengers[0].firstName || '') + ' ' + (b.passengers[0].lastName || '')).trim().toUpperCase() : (b.contact && b.contact.email ? b.contact.email.split('@')[0].toUpperCase() : 'PASSENGER');
            document.getElementById('upload-pax').innerHTML = `<div>${paxName}</div><div class="text-xs text-slate-500 mt-0.5">${paxCount} traveler${paxCount > 1 ? 's' : ''}</div>`;

            document.getElementById('upload-overlay').style.display = 'flex';
        }

        function closeUploadModal() {
            document.getElementById('upload-overlay').style.display = 'none';
            document.getElementById('upload-form').reset();
            currentUploadRef = null;
        }

        document.getElementById('upload-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUploadRef) return;

            const btn = document.getElementById('upload-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-circle-notch animate-spin"></i> Uploading...';

            try {
                const fileInput = document.getElementById('ticket-file');
                const file = fileInput.files[0];
                if (!file) throw new Error("Please select a file.");

                // Read file to Base64
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64String = reader.result;

                    const ticketData = {
                        ticketNumber: document.getElementById('ticket-num').value.trim(),
                        airline: document.getElementById('ticket-airline').value.trim(),
                        fileName: file.name,
                        fileData: base64String, // The Base64 encoded payload
                        issuedAt: new Date().toISOString()
                    };

                    const resp = await fetch('/api/bookings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'upload_ticket',
                            id: currentUploadRef,
                            ticket: ticketData,
                            pin: adminPin
                        })
                    });

                    const data = await resp.json();
                    if (data.ok) {
                        alert('âœ… Ticket successfully issued!\n\nAn automated email notification has been dispatched to the customer.');
                        closeUploadModal();
                        await loadBookings();
                    } else {
                        alert('Error: ' + (data.error || 'Upload failed'));
                    }

                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph-bold ph-upload-simple"></i> Upload & Issue Ticket';
                };
                reader.readAsDataURL(file);

            } catch (err) {
                alert('Error: ' + err.message);
                btn.disabled = false;
                btn.innerHTML = '<i class="ph-bold ph-upload-simple"></i> Upload & Issue Ticket';
            }
        });

        // ── Auto Ticket Generation ──
        async function generateTicketPDF(ref) {
            const b = allBookings.find(x => x.ref === ref);
            if (!b) return;

            if (!confirm('Auto-generate and issue an e-ticket for ' + ref + '?')) return;

            try {
                // Initialize jsPDF
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

                // Colors
                const GREEN = [0, 180, 90];
                const WHITE = [255, 255, 255];
                const BLACK = [30, 30, 30];
                const GREY = [100, 100, 100];
                const L_GREY = [243, 244, 246];

                // Data Extraction
                const routeParts = (b.route || '').split(' \u2192 ');
                const origin = routeParts[0] || 'EBB';
                const dest = routeParts[1] || 'ADD';
                const dateParts = (b.dates || '').split(' \u2192 ');
                const depDate = dateParts[0] || 'TBD';
                const arrDate = dateParts[1] || depDate;
                const timeParts = (b.flight && b.flight.time) ? b.flight.time.split(' \u2192 ') : [];
                const depTime = timeParts[0] || '07:00 AM';
                const arrTime = timeParts[1] || '12:00 AM';
                const airline = (b.flight && b.flight.airline) ? b.flight.airline.toUpperCase() : 'GLOBAL AIRLINES';
                const pnr = b.ref || 'ABC123';
                const ticketNum = 'TKT-' + Math.floor(100000000 + Math.random() * 900000000);
                const paxName = (b.passengers && b.passengers[0])
                    ? ((b.passengers[0].firstName || '') + ' ' + (b.passengers[0].lastName || '')).trim().toUpperCase()
                    : (b.contact && b.contact.email ? b.contact.email.split('@')[0].toUpperCase() : 'PASSENGER');

                let depDayName = 'DEPARTURE', depDateFmt = depDate, arrDateFmt = arrDate;
                try {
                    const d = new Date(depDate);
                    const da = new Date(arrDate);
                    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                    depDayName = days[d.getDay()];
                    depDateFmt = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
                    arrDateFmt = da.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
                } catch (e) { }

                // Dashed line helper
                function drawDash(x1, y1, x2, y2, d = 2, g = 1.5) {
                    const dx = x2 - x1, dy = y2 - y1, dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist === 0) return;
                    const s = Math.floor(dist / (d + g)), ux = dx / dist, uy = dy / dist;
                    for (let i = 0; i <= s; i++) {
                        const sx = x1 + ux * i * (d + g), sy = y1 + uy * i * (d + g);
                        doc.line(sx, sy, sx + ux * d, sy + uy * d);
                    }
                }

                // ── HEADER ────────────────────────────────────────
                doc.setFillColor(...GREEN);
                doc.roundedRect(10, 10, 190, 24, 3, 3, 'F');
                doc.setFillColor(...WHITE);
                doc.roundedRect(13, 13, 65, 18, 3, 3, 'F');

                // Logo inside white box
                // We use a small green triangle to replace the 'plane' in Booking
                doc.setFillColor(...GREEN);
                doc.triangle(14, 23, 14, 19, 18, 21, 'F');
                doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
                doc.text("Booking", 19, 25);
                doc.setTextColor(...GREEN);
                doc.text("Cart", 48, 25);

                // Right Tagline
                doc.setTextColor(...WHITE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text("FLY ANY WHERE", 195, 17, { align: 'right' });
                doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
                doc.text("AFFORDABLE FLIGHTS, PREMIUM SERVICE.", 195, 25, { align: 'right' });

                // ── PASSENGER ROW ─────────────────────────────────
                let y = 46;
                doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
                doc.text('PREPARED FOR', 14, y);
                doc.text('TRIP TO ' + dest.toUpperCase() + ', ' + dest.substring(0, 2).toUpperCase(), 84, y);
                y += 6;
                doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
                doc.text(paxName, 14, y);
                doc.setFontSize(10);
                doc.text(depDateFmt, 84, y);
                doc.setDrawColor(...[180, 230, 180]); doc.setLineWidth(0.4);
                drawDash(114, y - 1, 130, y - 1);
                // Simple green plane icon -> triangle
                doc.setFillColor(...GREEN);
                doc.triangle(133, y - 2, 133, y + 1, 137, y - 0.5, 'F');
                doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.text(arrDateFmt, 142, y);

                // ── SEGMENT CARD FUNCTION ─────────────────────────
                function drawSegment(cardY, fromCode, toCode, dTime, aTime, dDateStr, aDateStr, dayName, segAirline, pnrSpan) {
                    // Left Grey Box
                    doc.setFillColor(...L_GREY);
                    doc.roundedRect(10, cardY, 134, 82, 4, 4, 'F');

                    // Right Green Box
                    doc.setFillColor(...GREEN);
                    doc.roundedRect(147, cardY, 53, 82, 4, 4, 'F');

                    // --- Left Box Content ---
                    // Inner Pill
                    doc.setFillColor(...WHITE);
                    doc.roundedRect(15, cardY + 5, 124, 15, 3, 3, 'F');

                    // Plane icons in pill
                    doc.setFillColor(...BLACK);
                    doc.triangle(19, cardY + 11, 19, cardY + 14, 24, cardY + 12.5, 'F');
                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
                    doc.text('DEPARTURE', 27, cardY + 14);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...GREY);
                    doc.text('Please verify flight times prior to departure', 27, cardY + 18);

                    doc.setDrawColor(...GREY);
                    drawDash(65, cardY + 12, 83, cardY + 12);
                    doc.setFillColor(...BLACK);
                    doc.triangle(86, cardY + 11, 86, cardY + 14, 90, cardY + 12.5, 'F');

                    doc.setTextColor(...GREEN); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
                    doc.text(dayName, 93, cardY + 11);
                    doc.setTextColor(...BLACK); doc.setFontSize(9);
                    doc.text(dDateStr, 93, cardY + 16);

                    // Columns (EBB | ADD | DURATION)
                    const yCol = cardY + 36;
                    const c1 = 18, c2 = 54, c3 = 94;

                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
                    doc.text(fromCode, c1, yCol);
                    doc.text(toCode, c2, yCol);

                    doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
                    doc.text(fromCode + " INTERNATIONAL\nAIRPORT", c1, yCol + 4, { maxWidth: 30 });
                    doc.text(toCode + " INTERNATIONAL\nAIRPORT", c2, yCol + 4, { maxWidth: 30 });

                    doc.setTextColor(...BLACK); doc.setFontSize(6);
                    doc.text("Departure", c1, yCol + 14);
                    doc.text("Arrival", c2, yCol + 14);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
                    doc.text(dTime, c1, yCol + 20);
                    doc.text(aTime, c2, yCol + 20);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(6);
                    doc.text("Terminal", c1, yCol + 28);
                    doc.text("Terminal", c2, yCol + 28);

                    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
                    doc.text("TERMINAL 2", c1, yCol + 33);
                    doc.text("NOT AVAILABLE", c2, yCol + 33);

                    // Column 3
                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
                    doc.text("DURATION", c3, yCol);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                    doc.text("2hr(s) 10min(s)", c3, yCol + 6);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
                    doc.text("CARBIN", c3, yCol + 16);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                    doc.text("Economy", c3, yCol + 22);

                    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
                    doc.text("STATUS", c3, yCol + 32);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                    doc.text("Confirmed", c3, yCol + 38);

                    // --- Right Box Content ---
                    doc.setFillColor(...WHITE);
                    doc.roundedRect(150, cardY + 5, 47, 15, 3, 3, 'F');

                    // Tiny colored polygons to mimic Ethiopian Airlines logo style
                    doc.setFillColor(...[0, 160, 50]); doc.triangle(153, cardY + 16, 157, cardY + 11, 161, cardY + 16, 'F');
                    doc.setFillColor(...[250, 200, 0]); doc.triangle(153, cardY + 17, 157, cardY + 19, 161, cardY + 17, 'F');
                    doc.setFillColor(...[220, 20, 20]); doc.triangle(153, cardY + 18, 157, cardY + 20, 161, cardY + 18, 'F');

                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
                    const splits = doc.splitTextToSize(segAirline, 30);
                    doc.text(splits, 165, cardY + 11);

                    doc.setTextColor(...[170, 230, 180]); doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
                    doc.text("AIR CRAFT :", 151, cardY + 34);
                    doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
                    doc.text("BOEING 737-800 JET", 151, cardY + 39);

                    doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
                    doc.text("DISTANCE : 754 MILES", 151, cardY + 49);
                    doc.text("MEALS :", 151, cardY + 56);
                    doc.text("SNACK :", 151, cardY + 61);

                    // --- Bottom Footer Box ---
                    const footY = cardY + 86;
                    doc.setFillColor(...L_GREY);
                    doc.roundedRect(10, footY, 190, 15, 3, 3, 'F');

                    doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
                    doc.text("PASSENGERS NAME :", 16, footY + 6);
                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
                    doc.text(paxName, 16, footY + 11);

                    doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
                    doc.text("SEATS :", 94, footY + 6);
                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
                    doc.text("CHECK-IN REQUIRED", 94, footY + 11);

                    doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
                    doc.text("ETICKET RECIEPTS (PNR) :", 151, footY + 6);
                    doc.setTextColor(...BLACK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
                    doc.text("0714788390387", 151, footY + 11);
                }

                // Draw departure segment
                drawSegment(65, origin, dest, depTime, arrTime, depDateFmt, arrDateFmt, depDayName, airline, ticketNum);

                // Draw return segment if round-trip
                const hasReturn = dateParts[1] && dateParts[1] !== dateParts[0];
                if (hasReturn) {
                    let retDay = 'RETURN';
                    try {
                        const dr = new Date(arrDate);
                        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
                        retDay = days[dr.getDay()];
                    } catch (e) { }
                    drawSegment(172, dest, origin, arrTime, depTime, arrDateFmt, depDateFmt, retDay, airline, ticketNum);
                }

                // ── AIRLINE POLICY ───────────────────────────────
                const policyY = hasReturn ? 278 : 172;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6);
                doc.setTextColor(...BLACK);
                doc.text('Airline Ticket Policy', 10, policyY);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(4.5);
                doc.setTextColor(...GREY);
                const pol1 = 'All airline tickets issued are subject to the fare rules, conditions, and policies of the respective airline. Once a booking is confirmed and ticketed, the passenger is responsible for complying with the airline\'s terms and conditions, including baggage allowance, check-in requirements, travel documentation, and visa regulations.';
                const pol2 = '\nTickets may be non-refundable, non-transferable, or subject to change penalties depending on the fare class purchased. Any modifications, cancellations, or refund requests will be processed according to the airline\'s fare rules and may include additional airline fees, service charges, or fare differences. Passengers are advised to verify all travel details including passenger names, travel dates, and destinations immediately upon receipt of the ticket. The agency will not be responsible for errors not reported within 24 hours of ticket issuance.';
                const pol3 = '\nTravelers must arrive at the airport in accordance with airline check-in deadlines and carry valid travel documents such as passports, visas, and health certificates where required. Flight schedules, aircraft types, and services are subject to change by the airline without prior notice. The airline remains the operating carrier and is solely responsible for the transportation service provided. By accepting this receipt and ticket confirmation, the passenger acknowledges and agrees to the airline\'s terms and conditions of carriage.';
                doc.text(pol1 + pol2 + pol3, 10, policyY + 4, { maxWidth: 190 });

                // No QR Code. Immediately generate base64 and save to server
                const pdfBase64 = doc.output('datauristring');

                const ticketData = {
                    ticketNumber: ticketNum,
                    airline: airline,
                    fileName: pnr + '-E-Ticket.pdf',
                    fileData: pdfBase64,
                    issuedAt: new Date().toISOString()
                };

                const resp = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'upload_ticket', id: pnr, ticket: ticketData, pin: adminPin })
                });

                const data = await resp.json();
                if (data.ok) {
                    alert('\u2705 Ticket successfully auto-generated and issued!\n\nEmail dispatched.');
                    await loadBookings();
                } else {
                    alert('Error saving ticket: ' + (data.error || 'Unknown'));
                }

            } catch (err) {
                console.error(err);
                alert("Generation error: " + err.message);
            }
        }
