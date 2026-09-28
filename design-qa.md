# Ticket Design QA

## Source references

- Private-jet boarding pass: `/var/folders/fm/gnkjxp6s5v3dx6cx18wvplbc0000gp/T/codex-clipboard-c2106714-1c54-47ec-94d8-d50dfc16f949.png`
- Attraction ticket: `/var/folders/fm/gnkjxp6s5v3dx6cx18wvplbc0000gp/T/codex-clipboard-6a610c38-6546-4308-860e-953eb2c1988e.png`

## Implementation captures

- Private-jet ticket: in-app Browser tab at `http://127.0.0.1:4173/aviation/confirmation?preview=ticket`
- Attraction ticket: in-app Browser tab at `http://127.0.0.1:4173/event-confirmation?preview=ticket`

## Comparison

| Area | Source | Implementation | Result |
| --- | --- | --- | --- |
| Ticket silhouette | Tall portrait card with large rounded corners and punched divider edges | 430px portrait card, 28px radius, circular punched divider edges | Pass |
| Brand header | Charcoal header, centered BookingCart mark and tracked tagline | Same hierarchy, color family, centered real BookingCart asset and tagline | Pass |
| Private-jet hero | Full-bleed aircraft, boarding-pass label, oversized route codes | Dynamic aircraft image, boarding-pass label, route codes and airport names | Pass |
| Private-jet details | Dark flight strip, green passenger strip, white QR footer | Same three-band composition with live booking data | Pass |
| Attraction hero | Full-bleed venue image, booking reference, venue and location overlay | Dynamic event banner with the same overlay hierarchy | Pass |
| Attraction details | Light ticket metadata block and dark guest/entrance QR panel | Same block order, spacing, colors and live ticket data | Pass |
| Responsive behavior | Portrait ticket shown as a standalone artifact | Full-width below 430px; desktop card remains 430px and summary reflows beside it | Pass |
| Booking integrity | Reference assumes tickets are already issued | Tickets render only for `confirmed` bookings; pending reservations never show a ticket | Pass |

## Notes

- Event and aircraft photography is intentionally dynamic so each issued ticket uses the booked listing's image instead of permanently copying the example photography.
- Development-only `?preview=ticket` fixtures support repeatable visual QA and are omitted from production behavior by `import.meta.env.DEV`.

## Final result

Passed
