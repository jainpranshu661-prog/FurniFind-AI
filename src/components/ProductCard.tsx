import { ArrowUpRight, Heart, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { formatCurrency } from '../lib/currency';
import { ProductImage } from './ProductImage';
import type { Product } from '../types';

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { wishlist, comparison, toggleWishlist, toggleCompare } = useShop();
  const saved = wishlist.includes(product.id);
  const comparing = comparison.includes(product.id);
  const compareFull = comparison.length >= 3 && !comparing;
  return <article className={`product-card${compact ? ' product-card-compact' : ''}`}>
    <div className="product-image-wrap">
      <Link to={`/product/${product.id}`} className="product-image-link" aria-label={`View ${product.name}`}>
        <ProductImage className="product-image" src={product.image} alt={product.name} loading="lazy" />
      </Link>
      {product.featured && <span className="product-ribbon">FurniFind edit</span>}
      <div className="product-actions">
        <button className={`icon-button${saved ? ' is-active' : ''}`} onClick={() => toggleWishlist(product.id)} aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`} aria-pressed={saved}><Heart size={17} fill={saved ? 'currentColor' : 'none'} /></button>
        <button className={`icon-button${comparing ? ' is-active' : ''}`} onClick={() => toggleCompare(product.id)} aria-label={compareFull ? 'Compare list is full' : comparing ? `Remove ${product.name} from compare` : `Add ${product.name} to compare`} aria-pressed={comparing} disabled={compareFull}><Scale size={17} /></button>
      </div>
    </div>
    <div className="product-copy">
      <div className="product-eyebrow"><span>{product.category}</span><span>{product.color}</span></div>
      <Link to={`/product/${product.id}`} className="product-title"><span>{product.name}</span><ArrowUpRight size={15} /></Link>
      <p className="product-material">{product.material}</p>
      <div className="product-bottom"><span className="product-price">{formatCurrency(product.price)}</span><span className="swatch-dot" title={product.color} /></div>
      {product.match_reason && <p className="match-reason">{product.match_reason}</p>}
    </div>
  </article>;
}
