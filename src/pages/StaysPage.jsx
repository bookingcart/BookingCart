import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/stays.js?v=2'];

export default function StaysPage() {
  useEffect(() => { document.title = 'BookingCart — Stays'; }, []);
  useLegacyScripts(SCRIPTS, 'stays');
  return (
    <>
        <section className="hero" aria-label="Stays search">
          <div className="hero__bg" aria-hidden="true"></div>
          <div className="container hero__content" data-stays-search>
            <div className="badge">Find hotels, apartments, and lodges</div>
            <h1 className="h1">Book stays with confidence.</h1>
            <p className="lead">Compare location, amenities, and flexible policies â€” then checkout in a fast, secure flow.</p>
      
            <div className="panel" role="region" aria-label="Search stays panel">
              <div className="panel__inner">
                <form data-stays-form>
                  <div className="form-grid form-grid--stays">
                    <div className="field suggest" data-span="2">
                      <div className="label">Destination</div>
                      <input className="control" name="destination" data-dest-input placeholder="City, hotel, or landmark" autoComplete="off" />
                      <ul className="suggest__list" data-dest-list role="listbox" aria-label="Destination suggestions"></ul>
                    </div>
      
                    <div className="field">
                      <div className="label">Check-in</div>
                      <input className="control" name="checkIn" type="date" />
                    </div>
      
                    <div className="field">
                      <div className="label">Check-out</div>
                      <input className="control" name="checkOut" type="date" />
                    </div>
      
                    <div className="field">
                      <div className="label">Guests</div>
                      <div className="guests" data-guests>
                        <button className="control" type="button" data-guests-trigger style={{"textAlign":"left"}}>2 adults â€¢ 0 children â€¢ 1 room</button>
                        <div className="guests__panel" data-guests-panel role="dialog" aria-label="Guests selector">
                          <div style={{"display":"grid","gap":"10px"}}>
                            <div className="counter">
                              <div className="counter__meta">
                                <div className="counter__title">Adults</div>
                                <div className="counter__hint">Age 18+</div>
                              </div>
                              <div className="counter__controls">
                                <button className="icon-btn" type="button" data-minus="adults" aria-label="Decrease adults">âˆ’</button>
                                <span className="kpi" data-count="adults">2</span>
                                <button className="icon-btn" type="button" data-plus="adults" aria-label="Increase adults">+</button>
                              </div>
                            </div>
      
                            <div className="counter">
                              <div className="counter__meta">
                                <div className="counter__title">Children</div>
                                <div className="counter__hint">Age 0â€“17</div>
                              </div>
                              <div className="counter__controls">
                                <button className="icon-btn" type="button" data-minus="children" aria-label="Decrease children">âˆ’</button>
                                <span className="kpi" data-count="children">0</span>
                                <button className="icon-btn" type="button" data-plus="children" aria-label="Increase children">+</button>
                              </div>
                            </div>
      
                            <div className="counter">
                              <div className="counter__meta">
                                <div className="counter__title">Rooms</div>
                                <div className="counter__hint">How many rooms?</div>
                              </div>
                              <div className="counter__controls">
                                <button className="icon-btn" type="button" data-minus="rooms" aria-label="Decrease rooms">âˆ’</button>
                                <span className="kpi" data-count="rooms">1</span>
                                <button className="icon-btn" type="button" data-plus="rooms" aria-label="Increase rooms">+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
      
                    <div className="field field--submit">
                      <div className="label">&nbsp;</div>
                      <button className="btn btn-primary" type="submit">Search stays</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
      
            <div className="steps stays-steps" aria-label="Stays steps">
              <span className="step" data-active="true"><span className="step__dot">1</span> Search</span>
              <span className="step"><span className="step__dot">2</span> Results</span>
              <span className="step"><span className="step__dot">3</span> Details</span>
              <span className="step"><span className="step__dot">4</span> Checkout</span>
              <span className="step"><span className="step__dot">5</span> Confirm</span>
            </div>
          </div>
        </section>
      
        <section className="layout" aria-label="Stays suggestions" data-stays-suggestions>
          <div className="container">
            <div className="section">
              <div className="section__head">
                <div>
                  <div className="kpi" style={{"fontSize":"18px"}}>Top booked</div>
                  <div className="muted" style={{"marginTop":"6px"}}>Popular picks right now. Tap to open details or start your search.</div>
                </div>
              </div>
              <div className="suggest-grid" data-top-booked></div>
            </div>
      
            <div className="section" style={{"marginTop":"18px"}}>
              <div className="section__head">
                <div>
                  <div className="kpi" style={{"fontSize":"18px"}}>Top locations</div>
                  <div className="muted" style={{"marginTop":"6px"}}>Trending destinations with great availability and flexible policies.</div>
                </div>
              </div>
              <div className="suggest-grid" data-top-locations></div>
            </div>
          </div>
        </section>
      
        
        <FlightFooter />
    </>
  );
}
