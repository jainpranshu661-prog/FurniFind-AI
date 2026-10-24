import { useEffect, useState } from 'react';

type ProductImageProps = {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

export function ProductImage({ src, alt, className, loading = 'lazy' }: ProductImageProps) {
  const [failed, setFailed] = useState(!src);
  useEffect(() => setFailed(!src), [src]);

  if (failed) {
    return <span className={`${className ?? ''} product-image-fallback`} role="img" aria-label={`${alt} image unavailable`}>
      Image unavailable
    </span>;
  }

  return <img className={className} src={src} alt={alt} loading={loading} onError={() => setFailed(true)} />;
}
