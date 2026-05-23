import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/stays.js?v=1'];

export default function StaysCheckoutPage() {
  useEffect(() => { document.title = 'BookingCart — Stays Checkout'; }, []);
  useLegacyScripts(SCRIPTS, 'stays-checkout');
  return (
    <>
        <main className="layout" data-stays-checkout>
          <div className="container">
            <div className="steps stays-steps" aria-label="Stays steps">
              <a className="step" href="/stays"><span className="step__dot">1</span> Search</a>
              <a className="step" href="/stays/results"><span className="step__dot">2</span> Results</a>
              <a className="step" href="#" onclick="history.back();return false;"><span className="step__dot">3</span> Details</a>
              <span className="step" data-active="true"><span className="step__dot">4</span> Checkout</span>
              <span className="step"><span className="step__dot">5</span> Confirm</span>
            </div>
      
            <div className="grid-2" style={{"marginTop":"14px"}}>
              <aside className="sidebar" aria-label="Booking summary">
                <div className="sidebar__header">
                  <div className="sidebar__title">Booking summary</div>
                  <a className="muted" href="/stays/results" style={{"fontWeight":800}}>Change</a>
                </div>
                <div className="sidebar__body">
                  <div className="kpi" data-sum-hotel>â€”</div>
                  <div className="muted" style={{"marginTop":"6px"}} data-sum-room>â€”</div>
                  <div className="hr"></div>
                  <div className="row space">
                    <div className="muted" style={{"fontWeight":800}}>Dates</div>
                    <div className="kpi" data-sum-dates>â€”</div>
                  </div>
                  <div className="row space" style={{"marginTop":"10px"}}>
                    <div className="muted" style={{"fontWeight":800}}>Guests</div>
                    <div className="kpi" data-sum-guests>â€”</div>
                  </div>
                  <div className="hr"></div>
                  <div className="row space">
                    <div className="muted" style={{"fontWeight":800}}>Nightly rate</div>
                    <div className="kpi" data-sum-nightly>â€”</div>
                  </div>
                  <div className="row space" style={{"marginTop":"10px"}}>
                    <div className="muted" style={{"fontWeight":800}}>Taxes & fees</div>
                    <div className="kpi" data-sum-taxes>â€”</div>
                  </div>
                  <div className="hr"></div>
                  <div className="row space">
                    <div className="muted" style={{"fontWeight":900}}>Total</div>
                    <div className="price" data-sum-total>â€”</div>
                  </div>
                  <div className="small" style={{"marginTop":"8px"}}>Final price may vary based on property and payment method.</div>
                </div>
              </aside>
      
              <section aria-label="Checkout">
                <h1 className="section-title" style={{"fontSize":"24px","margin":0}}>Checkout</h1>
                <div className="muted" style={{"marginTop":"6px","fontWeight":650}}>Enter guest details and choose a payment method.</div>
      
                <form data-stays-checkout-form style={{"marginTop":"12px"}}>
                  <div className="card">
                    <div className="card__body">
                      <div className="kpi">Guest details</div>
                      <div className="hr"></div>
      
                      <div style={{"display":"grid","gridTemplateColumns":"1fr 1fr","gap":"12px"}}>
                        <div className="field">
                          <div className="label">Full name</div>
                          <input className="control" name="fullName" placeholder="Full name" required />
                        </div>
                        <div className="field">
                          <div className="label">Email</div>
                          <input className="control" name="email" type="email" placeholder="you@example.com" required />
                        </div>
                        <div className="field" style={{"gridColumn":"span 2"}}>
                          <div className="label">Phone</div>
                          <input className="control" name="phone" placeholder="+1 555 000 000" />
                        </div>
                        <div className="field" style={{"gridColumn":"span 2"}}>
                          <div className="label">Special requests (optional)</div>
                          <textarea className="control" name="requests" rows="3" placeholder="Late check-in, high floor, quiet room..."></textarea>
                        </div>
                      </div>
                    </div>
                  </div>
      
                  <div className="card" style={{"marginTop":"12px"}}>
                    <div className="card__body">
                      <div className="kpi">Payment</div>
                      <div className="muted" style={{"marginTop":"6px"}}>Select how youâ€™d like to pay.</div>
                      <div className="hr"></div>
                      <div data-pay-options></div>
                    </div>
                  </div>
      
                  <div className="card" style={{"marginTop":"12px"}}>
                    <div className="card__body">
                      <div className="kpi">Important notices</div>
                      <div className="hr"></div>
                      <div style={{"display":"grid","gap":"10px"}}>
                        <div className="muted">Cancellation depends on the selected room policy.</div>
                        <div className="muted">Prices are shown as an estimate for this demo.</div>
                        <label className="row" style={{"gap":"10px","alignItems":"flex-start"}}>
                          <input type="checkbox" name="terms" />
                          <span className="muted">I agree to the <a href="/terms" style={{"fontWeight":800}}>Terms & Conditions</a>.</span>
                        </label>
                      </div>
                    </div>
                  </div>
      
                  <div className="actions" style={{"paddingLeft":0,"paddingRight":0}}>
                    <button className="btn btn-primary" type="submit">Confirm booking</button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </main>
      
        <FlightFooter />
    </>
  );
}
