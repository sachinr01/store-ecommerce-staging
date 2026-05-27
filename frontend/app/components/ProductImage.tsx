'use client';

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  fallback: string;
}

export default function ProductImage({
  src,
  alt,
  className,
  loading = 'lazy',
  fallback,
}: ProductImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={e => {
        (e.target as HTMLImageElement).src = fallback;
      }}
    />
  );
}
