import axios from 'axios';
import { products } from '../data/products';
import type { Product, SearchResult } from '../types';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '' });

export type SellerProductInput = {
  title: string;
  description: string;
  category: string;
  price: number;
  currency: 'INR';
  material: string;
  color: string;
  dimensions?: string;
  imageUrl: string;
};

export type SellerProductStatus = 'active' | 'draft' | 'archived';
export type SellerListing = Product & { status: SellerProductStatus };
export type CatalogFacets = { categories: string[]; materials: string[]; colors: string[] };

const words = (value: string): string[] => value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const ignored = new Set(['a', 'an', 'and', 'the', 'for', 'with', 'in', 'on', 'of', 'to', 'under', 'that', 'is', 'my', 'me', 'i', 'find', 'show', 'looking', 'like', 'want', 'need', 'please', 'some', 'something', 'furniture']);
const synonyms: Record<string, string[]> = { cozy: ['warm', 'relaxed', 'soft'], apartment: ['small spaces', 'compact'], tiny: ['small spaces', 'compact'], work: ['office', 'desk'], natural: ['oak', 'wood', 'cane'], warm: ['ivory', 'honey', 'linen'] };

export function localSearch(query: string, source: Product[] = products): Product[] {
  const queryWords = words(query).filter((word) => !ignored.has(word));
  if (!queryWords.length) return [...source];
  const expanded = new Set(queryWords.flatMap((word) => [word, ...(synonyms[word] ?? [])].flatMap(words)));
  return source.flatMap((product): { product: Product; score: number }[] => {
    const content = words([product.name, product.category, product.description, product.material, product.color, ...product.tags].join(' '));
    const fields = words([product.name, product.category, product.material, product.color, ...product.tags].join(' '));
    const matches = [...expanded].filter((word) => fields.includes(word));
    const score = matches.reduce((sum, word) => sum + (words(product.name).includes(word) ? 3 : 2), 0) + [...expanded].filter((word) => content.includes(word)).length;
    if (!score) return [];
    const reason = matches.length ? `Matches catalog details: ${matches.slice(0, 3).join(', ')}.` : 'Matches words in the product description.';
    return [{ product: { ...product, match_reason: reason }, score }];
  }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)).map((result) => result.product);
}

export function filterCatalog(items: Product[], options: { category?: string; material?: string; color?: string; minPrice?: number; maxPrice?: number; popularOnly?: boolean; sort?: string }): Product[] {
  const filtered = items.filter((product) => (!options.category || product.category === options.category)
    && (!options.material || product.material.toLowerCase().includes(options.material.toLowerCase()))
    && (!options.color || product.color.toLowerCase().includes(options.color.toLowerCase()))
    && (options.minPrice === undefined || product.price >= options.minPrice)
    && (options.maxPrice === undefined || product.price <= options.maxPrice)
    && (!options.popularOnly || product.popular));
  if (options.sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  if (options.sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  return filtered;
}

export async function searchProducts(params: Record<string, string | number | undefined>): Promise<SearchResult> {
  const response = await api.get<SearchResult>('/api/products', { params });
  return response.data;
}

export async function getCatalogFacets(): Promise<CatalogFacets> {
  return (await api.get<CatalogFacets>('/api/catalog-facets')).data;
}

export async function getProduct(id: string): Promise<Product | undefined> {
  try {
    return (await api.get<Product>(`/api/products/${id}`)).data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return undefined;
    throw error;
  }
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const items = await Promise.all(ids.map(getProduct));
  return items.filter((item): item is Product => item !== undefined);
}

export async function getSimilar(id: string): Promise<Product[]> {
  return (await api.get<Product[]>(`/api/products/${id}/similar`)).data;
}

export async function createSellerProduct(input: SellerProductInput, idToken: string): Promise<Product> {
  const response = await api.post<Product>('/api/seller/products', input, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return response.data;
}

export async function getSellerProducts(idToken: string): Promise<SellerListing[]> {
  return (await api.get<SellerListing[]>('/api/seller/products', {
    headers: { Authorization: `Bearer ${idToken}` },
  })).data;
}

export async function updateSellerProduct(
  id: string,
  input: Partial<SellerProductInput> & { status?: SellerProductStatus },
  idToken: string,
): Promise<SellerListing> {
  return (await api.patch<SellerListing>(`/api/seller/products/${encodeURIComponent(id)}`, input, {
    headers: { Authorization: `Bearer ${idToken}` },
  })).data;
}

export async function deleteSellerProduct(id: string, idToken: string): Promise<void> {
  await api.delete(`/api/seller/products/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
}

export async function askAssistant(question: string, productIds: string[] = []): Promise<{ answer: string; grounded_product_ids: string[]; mode: string }> {
  try { return (await api.post('/api/assistant', { question, product_ids: productIds })).data; }
  catch {
    return { answer: 'The product catalog is temporarily unavailable. Please try again in a moment.', grounded_product_ids: [], mode: 'catalog' };
  }
}

export async function compareProducts(ids: string[]): Promise<{ summary: string; mode: string }> {
  return (await api.post('/api/compare-summary', { product_ids: ids })).data;
}
