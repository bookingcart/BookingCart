import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/stays.js?v=1'];

export default function StaysDetailsPage() {
  useEffect(() => { document.title = 'BookingCart — Stays Details'; }, []);
  useLegacyScripts(SCRIPTS, 'stays-details');
  return (
    <>
        <main className="layout" data-stays-details>
          <div className="container">
            <div className="steps stays-steps" aria-label="Stays steps">
              <a className="step" href="/stays"><span className="step__dot">1</span> Search</a>
              <a className="step" href="/stays/results"><span className="step__dot">2</span> Results</a>
              <span className="step" data-active="true"><span className="step__dot">3</span> Details</span>
              <span className="step"><span className="step__dot">4</span> Checkout</span>
              <span className="step"><span className="step__dot">5</span> Confirm</span>
            </div>
      
            <div className="card" style={{"marginTop":"14px"}}>
              <div className="card__body">
                <div className="row space" style={{"flexWrap":"wrap","gap":"12px"}}>
                  <div>
                    <div className="kpi" style={{"fontSize":"22px"}} data-hotel-name>â€”</div>
                    <div className="small" style={{"marginTop":"4px"}} data-hotel-sub>â€”</div>
                    <div className="muted" style={{"marginTop":"8px"}} data-hotel-address>â€”</div>
                  </div>
                  <div className="rating-badge">
                    <div className="kpi" style={{"fontSize":"16px"}}>Rating</div>
                    <div className="small" data-hotel-rating>â€”</div>
                  </div>
                </div>
      
                <div className="hr"></div>
      
                <div className="gallery" data-hotel-gallery aria-label="Hotel photo gallery"></div>
      
                <div className="hr"></div>
      
                <div className="grid-2" style={{"gridTemplateColumns":"1fr 340px"}}>
                  <section aria-label="Hotel details">
                    <div className="card" style={{"margin":0}}>
                      <div className="card__body">
                        <div className="kpi">Amenities</div>
                        <div className="row" style={{"gap":"8px","flexWrap":"wrap","marginTop":"10px"}} data-hotel-amenities></div>
                      </div>
                    </div>
      
                    <div className="card" style={{"marginTop":"12px"}}>
                      <div className="card__body">
                        <div className="kpi">About this property</div>
                        <div className="muted" style={{"marginTop":"6px"}} data-hotel-desc>â€”</div>
                      </div>
                    </div>
      
                    <div className="card" style={{"marginTop":"12px"}}>
                      <div className="card__body">
                        <div className="kpi">House rules</div>
                        <div className="hr"></div>
                        <div style={{"display":"grid","gap":"10px"}} data-hotel-rules></div>
                      </div>
                    </div>
      
                    <div className="card" style={{"marginTop":"12px"}}>
                      <div className="card__body">
                        <div className="kpi">Policies</div>
                        <div className="hr"></div>
                        <div style={{"display":"grid","gap":"10px"}} data-hotel-policies></div>
                      </div>
                    </div>
      
                    <div className="card" style={{"marginTop":"12px"}}>
                      <div className="card__body">
                        <div className="kpi">Guest reviews</div>
                        <div className="muted" style={{"marginTop":"6px"}}>This UI shows a preview. Connect a reviews API later.</div>
                        <div className="hr"></div>
                        <div className="row" style={{"gap":"8px","flexWrap":"wrap"}}>
                          <span className="pill">Clean rooms</span>
                          <span className="pill">Great location</span>
                          <span className="pill">Friendly staff</span>
                          <span className="pill">Fast Wiâ€‘Fi</span>
                        </div>
                      </div>
                    </div>
                  </section>
      
                  <aside className="sidebar" aria-label="Map">
                    <div className="card" style={{"margin":0}}>
                      <div className="card__body">
                        <div className="kpi">Map</div>
                        <div className="muted" style={{"marginTop":"6px"}}>Preview</div>
                        <div style={{"marginTop":"10px"}} data-map></div>
                      </div>
                    </div>
                  </aside>
                </div>
      
                <div className="card" style={{"marginTop":"12px"}}>
                  <div className="card__body">
                    <div className="row space" style={{"flexWrap":"wrap"}}>
                      <div>
                        <div className="kpi">Room types</div>
                        <div className="muted" style={{"marginTop":"6px"}}>Select a room to continue to checkout.</div>
                      </div>
                      <a className="muted" href="/stays/results" style={{"fontWeight":800}}>Change property</a>
                    </div>
                    <div className="hr"></div>
                    <div style={{"display":"grid","gap":"12px"}} data-room-list></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      
        <FlightFooter />
    </>
  );
}
