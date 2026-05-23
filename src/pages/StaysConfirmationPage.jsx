import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/stays.js?v=1'];

export default function StaysConfirmationPage() {
  useEffect(() => { document.title = 'BookingCart — Stays Confirmation'; }, []);
  useLegacyScripts(SCRIPTS, 'stays-confirmation');
  return (
    <>
        <main className="layout" data-stays-confirmation>
          <div className="container">
            <div className="steps stays-steps" aria-label="Stays steps">
              <a className="step" href="/stays"><span className="step__dot">1</span> Search</a>
              <a className="step" href="/stays/results"><span className="step__dot">2</span> Results</a>
              <span className="step"><span className="step__dot">3</span> Details</span>
              <span className="step"><span className="step__dot">4</span> Checkout</span>
              <span className="step" data-active="true"><span className="step__dot">5</span> Confirm</span>
            </div>
      
            <div className="card" style={{"marginTop":"14px"}}>
              <div className="card__body">
                <div className="row space" style={{"flexWrap":"wrap","gap":"12px"}}>
                  <div>
                    <div className="kpi" style={{"fontSize":"22px"}}>Booking confirmed</div>
                    <div className="muted" style={{"marginTop":"6px","fontWeight":650}}>Confirmation: <span className="kpi" data-confirm-ref>â€”</span></div>
                  </div>
                  <div className="pill pill--info">Total: <span className="kpi" data-confirm-total style={{"marginLeft":"6px"}}>â€”</span></div>
                </div>
      
                <div className="hr"></div>
      
                <div style={{"display":"grid","gap":"10px"}}>
                  <div className="row space" style={{"flexWrap":"wrap"}}>
                    <div className="muted" style={{"fontWeight":850}}>Hotel</div>
                    <div className="kpi" data-confirm-hotel>â€”</div>
                  </div>
                  <div className="row space" style={{"flexWrap":"wrap"}}>
                    <div className="muted" style={{"fontWeight":850}}>Room</div>
                    <div className="kpi" data-confirm-room>â€”</div>
                  </div>
                  <div className="row space" style={{"flexWrap":"wrap"}}>
                    <div className="muted" style={{"fontWeight":850}}>Dates</div>
                    <div className="kpi" data-confirm-dates>â€”</div>
                  </div>
                  <div className="row space" style={{"flexWrap":"wrap"}}>
                    <div className="muted" style={{"fontWeight":850}}>Payment</div>
                    <div className="kpi" data-confirm-payment>â€”</div>
                  </div>
                  <div className="row space" style={{"flexWrap":"wrap"}}>
                    <div className="muted" style={{"fontWeight":850}}>Cancellation</div>
                    <div className="kpi" data-confirm-policy>â€”</div>
                  </div>
                </div>
      
                <div className="hr"></div>
      
                <div className="row" style={{"flexWrap":"wrap"}}>
                  <a className="btn btn-primary" href="#" data-download-receipt style={{"display":"inline-flex","alignItems":"center","justifyContent":"center"}}>Download receipt</a>
                  <a className="btn btn-secondary" href="#" data-contact-support style={{"display":"inline-flex","alignItems":"center","justifyContent":"center"}}>Contact support</a>
                </div>
      
                <div className="small" style={{"marginTop":"12px"}}>This is a stays UI demo. Connect a real hotel API and payments later.</div>
              </div>
            </div>
          </div>
        </main>
      
        <FlightFooter />
    </>
  );
}
