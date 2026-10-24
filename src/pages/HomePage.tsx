import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, BedDouble, LampDesk, Search, Sparkles, Sofa, Utensils } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { categories } from '../data/products';
import { searchProducts } from '../lib/catalog';
import type { Product } from '../types';
import { ProductGrid, ProductSkeletons } from '../components/ProductGrid';

const categoryIcons = [Sofa, BedDouble, LampDesk, Utensils, Sparkles];
const examples = ['a soft reading chair in natural linen', 'a compact desk for a small room', 'warm lighting for quiet evenings'];

export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    searchProducts({ page_size: 12 })
      .then((result) => { if (active) setProducts(result.items); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const search = (value = query) => navigate(`/search?q=${encodeURIComponent(value.trim())}`);
  return <main>
    <section className="hero wrap">
      <div className="hero-copy"><p className="eyebrow"><span className="eyebrow-rule" /> A more thoughtful way to shop</p><h1>Find furniture<br />that feels like <em>home.</em></h1><p className="hero-lead">Pieces with a point of view, chosen around the way you actually live.</p>
        <form className="hero-search" role="search" onSubmit={(event) => { event.preventDefault(); search(); }}><label className="sr-only" htmlFor="hero-search">Describe what you are looking for</label><Search size={20} /><input id="hero-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="A reading chair for a small sunny corner…"/><button type="submit" aria-label="Search furniture"><ArrowRight size={19} /></button></form>
        <div className="search-examples"><span>Try</span>{examples.map((example) => <button key={example} onClick={() => search(example)}>{example}</button>)}</div>
        <div className="hero-proof"><span className="proof-dot" /><span>Search by feeling, function, or the little details.</span></div>
      </div>
      <div className="hero-visual"><img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=90" alt="Sunlit living room with considered furniture and natural textures"/><div className="hero-image-note"><span>Room to exhale</span><span>01 / 05</span></div><div className="hero-stamp"><Sparkles size={17} /><span>Thoughtfully<br/>matched to you</span></div></div>
      <a className="hero-scroll" href="#departments" aria-label="Explore furniture categories"><ArrowDownRight size={17}/><span>Start with a room</span></a>
    </section>

    <section className="category-strip" id="departments"><div className="wrap category-strip-inner"><div className="section-kicker"><span>01</span><span>Shop by room</span></div><div className="category-shortcuts">{categories.map((category, index) => { const Icon = categoryIcons[index]; return <Link to={`/search?category=${encodeURIComponent(category)}`} className="category-shortcut" key={category}><span className="category-icon"><Icon size={22} strokeWidth={1.5}/></span><span>{category}</span><ArrowRight size={15}/></Link>; })}</div></div></section>

    <section className="content-section wrap"><div className="section-heading"><div><p className="eyebrow">The pieces worth keeping</p><h2>A few good places to start.</h2></div><Link className="text-link" to="/search">Explore all furniture <ArrowRight size={16}/></Link></div>{loading ? <ProductSkeletons count={4}/> : failed ? <div className="notice notice-error" role="alert">We couldn’t reach the product catalog. Check that the API is running and try again. <button className="button button-outline" onClick={() => setReload((current) => current + 1)}>Retry</button></div> : products.length ? <ProductGrid items={products} /> : <div className="empty-state"><h2>No products are available yet.</h2><p>Please check back soon.</p></div>}</section>

    <section className="editorial-band"><div className="editorial-image"><img src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1300&q=85" alt="Quiet, layered living room in warm natural materials" loading="lazy"/></div><div className="editorial-copy"><p className="eyebrow">A little less scrolling</p><h2>Search like you<br/>talk to a friend.</h2><p>Tell us the room, the mood, or the practical thing you need. FurniFind looks across real product details so the results feel closer to what you meant.</p><button className="button button-dark" onClick={() => document.getElementById('hero-search')?.focus()}>Try a natural search <ArrowRight size={16}/></button><div className="editorial-note"><span className="note-mark">“</span><span>Every match comes from a detail in the catalog. No made-up specs, ever.</span></div></div></section>

    <section className="content-section wrap trending-section"><div className="section-heading"><div><p className="eyebrow">Loved in real homes</p><h2>Trending, for good reason.</h2></div><Link className="text-link" to="/search?popular=true">See what’s popular <ArrowRight size={16}/></Link></div>{!loading && !failed && <ProductGrid items={products.filter((product) => product.popular).slice(0, 4)} />}</section>
    <section className="closing-search"><div className="wrap closing-inner"><p className="eyebrow">Your space, your pace</p><h2>Good things start<br/>with a better question.</h2><button className="button button-outline-light" onClick={() => search('')}>Find your next piece <ArrowRight size={16}/></button></div></section>
  </main>;
}
