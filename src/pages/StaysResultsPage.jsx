import { useEffect } from 'react';
import { StaysUnavailable } from '../components/StaysUnavailable.jsx';

export default function StaysResultsPage() {
  useEffect(() => { document.title = 'Stays Results | BookingCart'; }, []);
  return <StaysUnavailable title="Stays results are unavailable" />;
}
