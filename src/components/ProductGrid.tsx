import type { Product } from '../types';
import { ProductCard } from './ProductCard';

export function ProductGrid({ items, compact = false }: { items: Product[]; compact?: boolean }) {
  return <div className={`product-grid${compact ? ' product-grid-compact' : ''}`}>
    {items.map((product) => <ProductCard key={product.id} product={product} compact={compact} />)}
  </div>;
}

export function ProductSkeletons({ count = 4 }: { count?: number }) {
  return <div className="product-grid" aria-label="Loading products" aria-busy="true">
    {Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index}><div className="skeleton skeleton-image" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /><div className="skeleton skeleton-line tiny" /></div>)}
  </div>;
}
