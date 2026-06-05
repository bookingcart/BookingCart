import { useEffect } from 'react';
import { StaysUnavailable } from '../components/StaysUnavailable.jsx';

export default function StaysPage() {
  useEffect(() => { document.title = 'Stays | BookingCart'; }, []);
  return <StaysUnavailable title="Stays are not connected yet" />;
}
