import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Heart, Scale, ShieldCheck, Truck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ProductGrid } from '../components/ProductGrid';
import { ProductImage } from '../components/ProductImage';
import { useShop } from '../context/ShopContext';
import { formatCurrency } from '../lib/currency';
import { getProduct, getSimilar } from '../lib/catalog';
import type { Product } from '../types';

export function ProductPage() {
  const { id = '' } = useParams();
  const [product, setProduct] = useState<Product>();
  const [similar, setSimilar] = useState<Product[]>([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [similarFailed, setSimilarFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const { wishlist, comparison, toggleWishlist, toggleCompare } = useShop();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    setSimilarFailed(false);
    Promise.allSettled([getProduct(id), getSimilar(id)]).then(([itemResult, similarResult]) => {
      if (!active) return;
      if (itemResult.status === 'rejected') {
        setFailed(true);
        return;
      }
      const item = itemResult.value;
      setProduct(item);
      setSimilar(similarResult.status === 'fulfilled' ? similarResult.value : []);
      setSimilarFailed(similarResult.status === 'rejected');
      setSelectedImage(item?.images[0] ?? item?.image ?? '');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reload]);
  if (loading) return <main className="wrap page-main"><div className="page-loading">Finding the details…</div></main>;
  if (failed) return <main className="wrap page-main"><div className="empty-state"><h1>We couldn’t load that piece.</h1><p>Check that the catalog API is running and try again.</p><button className="button button-dark" onClick={() => setReload((current) => current + 1)}>Retry <ArrowRight size={16}/></button></div></main>;
  if (!product) return <main className="wrap page-main"><div className="empty-state"><h1>We couldn’t find that piece.</h1><Link className="button button-dark" to="/search">Back to the collection <ArrowRight size={16}/></Link></div></main>;
  const saved = wishlist.includes(product.id);
  const comparing = comparison.includes(product.id);
  const galleryImages = product.images.length ? product.images : [product.image];
  const selectedIndex = Math.max(0, galleryImages.indexOf(selectedImage));
  return <main className="page-main wrap product-page">
    <div className="breadcrumb"><Link to="/search"><ArrowLeft size={14}/> Back to finding</Link><span>/</span><span>{product.category}</span><span>/</span><span>{product.name}</span></div>
    <section className="product-detail-layout"><div className="gallery"><div className="gallery-main"><ProductImage className="gallery-image" src={selectedImage || product.image} alt={product.name} loading="eager"/><span className="gallery-index" aria-live="polite">{String(selectedIndex + 1).padStart(2, '0')} / {String(galleryImages.length).padStart(2, '0')}</span></div><div className="gallery-thumbs">{galleryImages.map((image, index) => <button key={`${image}-${index}`} className={selectedImage === image ? 'selected' : ''} onClick={() => setSelectedImage(image)} aria-label={`View image ${index + 1} of ${product.name}`} aria-pressed={selectedImage === image}><ProductImage className="gallery-thumb-image" src={image} alt=""/></button>)}</div></div>
      <div className="product-detail-copy"><p className="eyebrow">{product.category} <span className="detail-dot">·</span> The FurniFind edit</p><h1>{product.name}</h1><p className="detail-price">{formatCurrency(product.price)}</p><p className="detail-description">{product.description}</p><div className="detail-divider"/><dl className="spec-list"><div><dt>Material</dt><dd>{product.material}</dd></div><div><dt>Color</dt><dd><span className="swatch-dot"/>{product.color}</dd></div><div><dt>Dimensions</dt><dd>{product.dimensions || 'Not listed'}</dd></div><div><dt>Category</dt><dd>{product.category}</dd></div></dl><div className="detail-actions"><button className={`button ${saved ? 'button-saved' : 'button-dark'}`} onClick={() => toggleWishlist(product.id)}><Heart size={17} fill={saved ? 'currentColor' : 'none'}/>{saved ? 'Saved to wishlist' : 'Save this piece'}</button><button className={`button button-outline ${comparing ? 'button-selected' : ''}`} onClick={() => toggleCompare(product.id)} disabled={comparison.length >= 3 && !comparing}><Scale size={17}/>{comparing ? 'Added to compare' : 'Add to compare'}</button></div><div className="delivery-notes"><div><Truck size={18}/><span>Delivery details provided at checkout</span></div><div><ShieldCheck size={18}/><span>Thoughtfully selected for the collection</span></div></div><div className="catalog-note"><Check size={16}/><span>Materials, dimensions, and color shown here come directly from the product catalog.</span></div></div></section>
    {similarFailed && <div className="notice notice-error" role="alert">Related products are temporarily unavailable.</div>}
    {similar.length > 0 && <section className="content-section related-section"><div className="section-heading"><div><p className="eyebrow">In a similar spirit</p><h2>More pieces to consider.</h2></div><Link className="text-link" to={`/search?q=${encodeURIComponent(product.category)}`}>Shop {product.category} <ArrowRight size={16}/></Link></div><ProductGrid items={similar.slice(0, 4)}/></section>}
  </main>;
}
