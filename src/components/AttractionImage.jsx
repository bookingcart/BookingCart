import { useState } from 'react';

export default function AttractionImage({ image, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!image?.url || failed) return <div className={`flex items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-100 text-emerald-700 ${className}`} role="img" aria-label={`${name} image unavailable`}><i className="ph ph-binoculars text-4xl" aria-hidden="true" /></div>;
  return <img src={image.url} alt={image.alt || name} className={className} loading="lazy" onError={() => setFailed(true)} />;
}
