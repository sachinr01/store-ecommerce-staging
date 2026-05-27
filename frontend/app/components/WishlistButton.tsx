'use client';

import { useWishlist } from '../lib/wishlistContext';

interface WishlistButtonProps {
  productId: number;
  title: string;
  price: number;
  image: string;
  inStock: boolean;
  className?: string;
}

export default function WishlistButton({
  productId,
  title,
  price,
  image,
  inStock,
  className = 'na-wishlist',
}: WishlistButtonProps) {
  const { hasItem, addItem, removeItem } = useWishlist();
  const inWishlist = hasItem(productId);

  return (
    <button
      className={`${className}${inWishlist ? ' active' : ''}`}
      aria-label={inWishlist ? `Remove ${title} from wishlist` : `Add ${title} to wishlist`}
      onClick={async e => {
        e.preventDefault();
        try {
          if (inWishlist) {
            await removeItem(productId);
          } else {
            await addItem({ id: productId, title, price, image, inStock });
          }
        } catch {
          // optimistic update already rolled back by context
        }
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill={inWishlist ? '#e74c3c' : 'none'}
        stroke={inWishlist ? '#e74c3c' : 'currentColor'}
        strokeWidth="1.8"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
