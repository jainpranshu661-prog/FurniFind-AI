export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  material: string;
  color: string;
  dimensions?: string | null;
  image: string;
  images: string[];
  tags: string[];
  featured: boolean;
  popular: boolean;
  match_reason?: string | null;
};

export type SearchResult = {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
};
