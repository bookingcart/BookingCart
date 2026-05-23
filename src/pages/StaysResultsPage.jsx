import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/stays.js?v=2'];

export default function StaysResultsPage() {
  useEffect(() => { document.title = 'BookingCart — Stays Results'; }, []);
  useLegacyScripts(SCRIPTS, 'stays-results');
  return (
    <>
        <main className="layout" data-stays-results>
          <div className="container">
            <div className="steps stays-steps" aria-label="Stays steps">
              <a className="step" href="/stays"><span className="step__dot">1</span> Search</a>
              <span className="step" data-active="true"><span className="step__dot">2</span> Results</span>
              <span className="step"><span className="step__dot">3</span> Details</span>
              <span className="step"><span className="step__dot">4</span> Checkout</span>
              <span className="step"><span className="step__dot">5</span> Confirm</span>
            </div>
      
            <div style={{"marginTop":"14px"}}>
              <h1 className="section-title" style={{"fontSize":"24px","margin":0}}><span data-stays-route>â€”</span></h1>
              <div className="muted" style={{"marginTop":"6px","fontWeight":650}} data-stays-meta>â€”</div>
            </div>
      
            <div className="grid-2" style={{"marginTop":"14px"}}>
              <aside className="sidebar" aria-label="Filters">
                <div className="sidebar__header">
                  <div className="sidebar__title">Filters</div>
                  <a className="muted" href="/stays" style={{"fontWeight":800}}>New search</a>
                </div>
                <div className="sidebar__body">
                  <div className="field">
                    <div className="label">Max price / night</div>
                    <input className="control" type="range" name="maxPrice" min="60" max="500" value="450" />
                    <div className="small">Slide to narrow results by nightly price.</div>
                  </div>
      
                  <div className="hr"></div>
      
                  <div className="field">
                    <div className="label">Star rating</div>
                    <div className="checklist">
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="stars" value="5" checked /> <span className="muted">5 stars</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="stars" value="4" checked /> <span className="muted">4 stars</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="stars" value="3" checked /> <span className="muted">3 stars</span></label>
                    </div>
                  </div>
      
                  <div className="hr"></div>
      
                  <div className="field">
                    <div className="label">Guest rating (min)</div>
                    <input className="control" type="range" name="minRating" min="0" max="10" value="0" step="0.5" />
                    <div className="small">Higher rating = better reviews.</div>
                  </div>
      
                  <div className="hr"></div>
      
                  <div className="field">
                    <div className="label">Amenities</div>
                    <div className="checklist">
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="amenities" value="wifi" /> <span className="muted">Wiâ€‘Fi</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="amenities" value="breakfast" /> <span className="muted">Breakfast</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="amenities" value="parking" /> <span className="muted">Parking</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="amenities" value="pool" /> <span className="muted">Pool</span></label>
                    </div>
                  </div>
      
                  <div className="hr"></div>
      
                  <div className="field">
                    <div className="label">Property type</div>
                    <div className="checklist">
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="type" value="Hotel" checked /> <span className="muted">Hotel</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="type" value="Apartment" checked /> <span className="muted">Apartment</span></label>
                      <label className="row" style={{"gap":"10px"}}><input type="checkbox" name="type" value="Lodge" checked /> <span className="muted">Lodge</span></label>
                    </div>
                  </div>
      
                  <div className="hr"></div>
      
                  <div className="field">
                    <div className="label">Sort</div>
                    <select className="control select" name="sort">
                      <option value="popularity">Popularity</option>
                      <option value="price">Price (low to high)</option>
                      <option value="rating">Guest rating</option>
                    </select>
                  </div>
                </div>
              </aside>
      
              <section aria-label="Results">
                <div className="row space" style={{"marginBottom":"10px"}}>
                  <div className="kpi">Available stays</div>
                  <div className="pill">Tip: use filters to narrow down options</div>
                </div>
                <div style={{"display":"grid","gap":"12px"}} data-hotel-list></div>
              </section>
            </div>
          </div>
        </main>
      
        <FlightFooter />
    </>
  );
}
