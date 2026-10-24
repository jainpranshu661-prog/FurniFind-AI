import { ArrowRight, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductGrid, ProductSkeletons } from '../components/ProductGrid';
import { useShop } from '../context/ShopContext';
import { getProductsByIds } from '../lib/catalog';
import type { Product } from '../types';

export function WishlistPage() {
  const { wishlist } = useShop();
  const [saved, setSaved] = useState<Product[]>([]);
  const [loading, setLoading] = useState(wishlist.length > 0);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    if (!wishlist.length) {
      setSaved([]);
      setLoading(false);
      setFailed(false);
      return () => { active = false; };
    }
    setLoading(true);
    setFailed(false);
    getProductsByIds(wishlist)
      .then((items) => { if (active) setSaved(items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [wishlist, reload]);
  return <main className="page-main wrap collection-page"><div className="breadcrumb"><Link to="/">Home</Link><span>/</span><span>Your saved pieces</span></div><header className="collection-heading"><div><p className="eyebrow">A collection of your own</p><h1>Saved for later<span className="heading-count">{saved.length.toString().padStart(2, '0')}</span></h1><p>Keep the pieces you love close while you make room for them.</p></div><Heart size={30} strokeWidth={1.2}/></header>{loading ? <ProductSkeletons count={3}/> : failed ? <div className="notice notice-error" role="alert">We couldn’t load your saved products. Check that the catalog API is running and try again. <button className="button button-outline" onClick={() => setReload((current) => current + 1)}>Retry</button></div> : saved.length ? <ProductGrid items={saved}/> : <div className="empty-state wishlist-empty"><span className="empty-icon"><Heart size={23}/></span><h2>Your wishlist is a fresh start.</h2><p>When a piece catches your eye, tap the heart to save it here.</p><Link className="button button-dark" to="/search">Explore the collection <ArrowRight size={16}/></Link></div>}</main>;
}
