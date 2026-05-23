import { useEffect } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';
import { HeaderAuthCluster } from '../components/HeaderAuthCluster.jsx';
import { FlightFooter } from '../components/FlightFooter.jsx';

const SCRIPTS = ['/js/loading-ui.js','/js/auth.js','/js/events.js?v=2'];

export default function EventsPage() {
  useEffect(() => { document.title = 'BookingCart — Events'; }, []);
  useLegacyScripts(SCRIPTS, 'events');
  return (
    <>
        <section className="hero" aria-label="Events search">
          <div className="hero__bg" aria-hidden="true"></div>
          <div className="container hero__content" data-events-search>
            <div className="badge">Discover events worldwide</div>
            <h1 className="h1">Find amazing events.</h1>
            <p className="lead">Search concerts, conferences, workshops, and local experiences â€” then book tickets instantly.</p>
      
            <div className="panel" role="region" aria-label="Search events panel">
              <div className="panel__inner">
                <form data-events-form>
                  <div className="form-grid form-grid--events">
                    <div className="field suggest" data-span="2">
                      <div className="label">Location</div>
                      <input className="control" name="location" placeholder="City or country" autoComplete="off" required />
                    </div>
      
                    <div className="field field--submit">
                      <div className="label">&nbsp;</div>
                      <button className="btn btn-primary" type="submit">Search events</button>
                    </div>
                  </div>
                </form>
      
                <div data-events-status style={{"display":"none","marginTop":"12px"}}></div>
              </div>
            </div>
          </div>
        </section>
      
        <section className="layout" aria-label="Events results" data-events-results-section style={{"display":"none"}}>
          <div className="container">
            <div className="section">
              <div className="section__head">
                <div>
                  <div className="kpi" style={{"fontSize":"18px"}}>Events</div>
                  <div className="muted" style={{"marginTop":"6px"}}>Live events from Eventbrite and Ticketmaster.</div>
                </div>
              </div>
              <div className="events-grid" data-events-results></div>
            </div>
          </div>
        </section>
      
        <FlightFooter />
    </>
  );
}
