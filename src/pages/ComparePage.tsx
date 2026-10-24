import { useEffect, useState } from 'react';
import { ArrowRight, Check, Scale, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductImage } from '../components/ProductImage';
import { useShop } from '../context/ShopContext';
import { compareProducts, getProductsByIds } from '../lib/catalog';
import { formatCurrency } from '../lib/currency';
import type { Product } from '../types';

const fields: { label: string; value: (product: Product) => string }[] = [
  { label: 'Price', value: (item) => formatCurrency(item.price) },
  { label: 'Category', value: (item) => item.category },
  { label: 'Material', value: (item) => item.material || 'Not listed' },
  { label: 'Color', value: (item) => item.color || 'Not listed' },
  { label: 'Dimensions', value: (item) => item.dimensions || 'Not listed' },
  { label: 'Description', value: (item) => item.description || 'Not listed' },
];

export function ComparePage() {
  const { comparison, removeCompare } = useShop();
  const [items, setItems] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(comparison.length > 0);
  const [productsFailed, setProductsFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [summary, setSummary] = useState('');
  const [summaryMode, setSummaryMode] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!comparison.length) {
      setItems([]);
      setProductsLoading(false);
      setProductsFailed(false);
      return () => { active = false; };
    }
    setProductsLoading(true);
    setProductsFailed(false);
    getProductsByIds(comparison)
      .then((products) => { if (active) setItems(products); })
      .catch(() => { if (active) setProductsFailed(true); })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, [comparison, reload]);

  useEffect(() => {
    setSummary('');
    setSummaryMode('');
    setSummaryError('');
  }, [comparison.join('|')]);

  const summarize = async () => {
    setLoading(true);
    setSummaryError('');
    try {
      const response = await compareProducts(items.map((item) => item.id));
      setSummary(response.summary);
      setSummaryMode(response.mode);
    } catch {
      setSummaryError('Could not create a comparison summary. Check that the API is running and try again.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="page-main wrap compare-page">
    <div className="breadcrumb"><Link to="/">Home</Link><span>/</span><span>Compare pieces</span></div>
    <header className="collection-heading"><div><p className="eyebrow">Good decisions take a side-by-side</p><h1>Compare your finds<span className="heading-count">{items.length}/3</span></h1><p>Bring together two or three pieces and see what sets them apart.</p></div><Scale size={31} strokeWidth={1.2} /></header>
    {productsLoading && <div className="page-loading">Loading compared products…</div>}
    {productsFailed && <div className="notice notice-error" role="alert">We couldn’t load your compared products. Check that the catalog API is running and try again. <button className="button button-outline" onClick={() => setReload((current) => current + 1)}>Retry</button></div>}
    {!productsLoading && !productsFailed && items.length < 2 && <div className="compare-callout"><span className="empty-icon"><Scale size={22} /></span><div><strong>{items.length === 0 ? 'Start with two pieces.' : 'One more to compare.'}</strong><p>Save items to compare from a product card or product detail page.</p></div><Link className="text-link" to="/search">Find a piece <ArrowRight size={15} /></Link></div>}
    {!productsLoading && !productsFailed && items.length > 0 && <div className="compare-table-wrap"><table className="compare-table"><thead><tr><th scope="col">At a glance</th>{items.map((item) => <th scope="col" key={item.id}><div className="compare-product-head"><Link to={`/product/${item.id}`}><ProductImage className="compare-product-image" src={item.image} alt={item.name} /><span>{item.name}</span></Link><button className="icon-button" onClick={() => removeCompare(item.id)} aria-label={`Remove ${item.name} from comparison`}><X size={16} /></button></div></th>)}{items.length < 3 && <th className="compare-add-col" scope="col"><Link to="/search"><span className="add-circle"><ArrowRight size={18} /></span>Add another piece</Link></th>}</tr></thead><tbody>{fields.map((field) => <tr key={field.label}><th scope="row">{field.label}</th>{items.map((item) => <td key={item.id}>{field.value(item)}</td>)}{items.length < 3 && <td className="empty-compare-cell">—</td>}</tr>)}</tbody></table></div>}
    {!productsLoading && !productsFailed && items.length >= 2 && <div className="compare-summary-action"><div><p className="eyebrow">A clearer picture</p><h2>Want the short version?</h2><p>Ask for a concise summary based only on details listed in the catalog.</p></div><button className="button button-dark" onClick={summarize} disabled={loading}>{loading ? 'Putting it together…' : 'Summarize differences'} <ArrowRight size={16} /></button></div>}
    {summaryError && <div className="notice notice-error" role="alert">{summaryError}</div>}
    {summary && <div className="compare-summary" aria-live="polite"><span className="summary-check"><Check size={17} /></span><div><p>{summary}</p><small>{summaryMode === 'openai' ? 'AI summary grounded in catalog details' : 'Catalog summary · no AI key required'}</small></div></div>}
  </main>;
}
