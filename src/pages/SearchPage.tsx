import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, SlidersHorizontal, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCatalogFacets, searchProducts, type CatalogFacets } from '../lib/catalog';
import type { SearchResult } from '../types';
import { ProductGrid, ProductSkeletons } from '../components/ProductGrid';

const PAGE_SIZE = 9;

export function SearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = new URLSearchParams(location.search);
  const [query, setQuery] = useState(initial.get('q') ?? '');
  const [category, setCategory] = useState(initial.get('category') ?? '');
  const [material, setMaterial] = useState('');
  const [color, setColor] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult>({ items: [], total: 0, page: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [facets, setFacets] = useState<CatalogFacets>({ categories: [], materials: [], colors: [] });
  const [facetsFailed, setFacetsFailed] = useState(false);
  const popularOnly = new URLSearchParams(location.search).get('popular') === 'true';
  const budgetError = minPrice && maxPrice && Number(minPrice) > Number(maxPrice)
    ? 'Minimum price must be less than or equal to maximum price.'
    : '';

  useEffect(() => {
    let active = true;
    getCatalogFacets()
      .then((result) => { if (active) setFacets(result); })
      .catch(() => { if (active) setFacetsFailed(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery(params.get('q') ?? '');
    setCategory(params.get('category') ?? '');
    setPage(1);
  }, [location.search]);

  useEffect(() => {
    let active = true;
    if (budgetError) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setFailed(false);
    searchProducts({
      q: query,
      category: category || undefined,
      material: material || undefined,
      color: color || undefined,
      min_price: minPrice || undefined,
      max_price: maxPrice || undefined,
      popular_only: popularOnly ? 'true' : 'false',
      sort,
      page,
      page_size: PAGE_SIZE,
    })
      .then((response) => { if (active) setResult(response); })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, category, material, color, minPrice, maxPrice, budgetError, popularOnly, sort, page, reload]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query.trim())}${category ? `&category=${encodeURIComponent(category)}` : ''}`);
    setPage(1);
  };
  const clearFilters = () => {
    setCategory('');
    setMaterial('');
    setColor('');
    setMinPrice('');
    setMaxPrice('');
    setSort('relevance');
    setPage(1);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const categoryOptions = category && !facets.categories.includes(category)
    ? [...facets.categories, category].sort()
    : facets.categories;
  const filters = <>
    <div className="filter-title"><h2>Refine your search</h2><button className="filter-clear" onClick={clearFilters}>Clear all</button></div>
    <label className="filter-label">Room<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All rooms</option>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="filter-label">Material<select value={material} onChange={(event) => { setMaterial(event.target.value); setPage(1); }}><option value="">Any material</option>{facets.materials.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="filter-label">Color<select value={color} onChange={(event) => { setColor(event.target.value); setPage(1); }}><option value="">Any color</option>{facets.colors.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label className="filter-label">Minimum price<span className="price-input-wrap"><span>₹</span><input aria-label="Minimum price" aria-invalid={Boolean(budgetError)} inputMode="numeric" value={minPrice} onChange={(event) => { setMinPrice(event.target.value.replace(/[^0-9]/g, '')); setPage(1); }} placeholder="No minimum" /></span></label>
    <label className="filter-label">Maximum price<span className="price-input-wrap"><span>₹</span><input aria-label="Maximum price" aria-invalid={Boolean(budgetError)} inputMode="numeric" value={maxPrice} onChange={(event) => { setMaxPrice(event.target.value.replace(/[^0-9]/g, '')); setPage(1); }} placeholder="No maximum" /></span></label>
    {budgetError && <p className="filter-error" role="alert">{budgetError}</p>}
    <button className="filter-apply" onClick={() => setPage(1)} disabled={Boolean(budgetError)}>Show {result.total} pieces <ArrowRight size={15} /></button>
  </>;

  return <main className="page-main wrap search-page">
    <div className="breadcrumb"><span>Home</span><span>/</span><span>Search</span></div>
    <section className="search-heading">
      <div><p className="eyebrow">Good finds, just ahead</p><h1>{query ? <>Results for <em>“{query}”</em></> : category || 'Explore the collection'}</h1><p className="search-subtitle">Thoughtfully selected for your next chapter at home.</p></div>
      <form className="search-edit" onSubmit={submit}><label className="sr-only" htmlFor="edit-search">Edit search</label><input id="edit-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Describe what you have in mind" /><button className="button button-dark" type="submit">Search <ArrowRight size={15} /></button></form>
    </section>
    <div className="search-toolbar">
      <details className="filter-drawer"><summary><SlidersHorizontal size={16} /> Filters <span>({Number(Boolean(category)) + Number(Boolean(material)) + Number(Boolean(color)) + Number(Boolean(minPrice)) + Number(Boolean(maxPrice))})</span></summary><div className="filter-drawer-content">{filters}</div></details>
      <p className="result-count">{loading ? 'Finding pieces…' : `${result.total} ${result.total === 1 ? 'piece' : 'pieces'} to explore`}</p>
      <label className="sort-control">Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="relevance">Relevance</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
    </div>
    {facetsFailed && <p className="filter-error" role="status">Some filter options couldn’t be loaded. Try refreshing the catalog.</p>}
    <div className="search-layout">
      <aside className="filter-sidebar">{filters}</aside>
      <section className="search-results" aria-label="Search results">
        {budgetError ? <div className="notice notice-error" role="alert">{budgetError}</div> : loading ? <ProductSkeletons count={6} /> : failed ? (
          <div className="notice notice-error" role="alert">
            We couldn't reach the catalog. Check that the API is running and try again.
            <button className="button button-outline" onClick={() => setReload((current) => current + 1)}>Retry</button>
          </div>
        ) : result.items.length ? (
          <>
            <ProductGrid items={result.items} />
            {pages > 1 && <nav className="pagination" aria-label="Search result pages">
              <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous page"><ArrowLeft size={17} /></button>
              <span>Page <strong>{page}</strong> of {pages}</span>
              <button onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page === pages} aria-label="Next page"><ArrowRight size={17} /></button>
            </nav>}
          </>
        ) : (
          <div className="empty-state">
            <span className="empty-icon"><SlidersHorizontal size={22} /></span>
            <h2>No pieces found this time.</h2>
            <p>Try a different room, material, or a broader search description.</p>
            <button className="button button-outline" onClick={clearFilters}><X size={15} /> Clear your filters</button>
          </div>
        )}
      </section>
    </div>
  </main>;
}
