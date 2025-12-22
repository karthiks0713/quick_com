export interface Product {
  name: string;
  price: number | null;
  mrp: number | null;
  discount: number | null;
  discountAmount: number | null;
  isOutOfStock: boolean;
  imageUrl: string | null;
  productUrl: string | null;
}

export interface StoreProducts {
  store: StoreName;
  products: Product[];
  status: 'pending' | 'loading' | 'completed' | 'error';
  error?: string;
}

export type StoreName = 'dmart' | 'jiomart' | 'naturesbasket' | 'zepto' | 'swiggy';

export interface StoreInfo {
  name: StoreName;
  displayName: string;
  color: string;
  bgClass: string;
}

export const STORES: Record<StoreName, StoreInfo> = {
  dmart: { name: 'dmart', displayName: 'DMart', color: 'store-dmart', bgClass: 'store-badge-dmart' },
  jiomart: { name: 'jiomart', displayName: 'JioMart', color: 'store-jiomart', bgClass: 'store-badge-jiomart' },
  naturesbasket: { name: 'naturesbasket', displayName: "Nature's Basket", color: 'store-naturesbasket', bgClass: 'store-badge-naturesbasket' },
  zepto: { name: 'zepto', displayName: 'Zepto', color: 'store-zepto', bgClass: 'store-badge-zepto' },
  swiggy: { name: 'swiggy', displayName: 'Swiggy Instamart', color: 'store-swiggy', bgClass: 'store-badge-swiggy' },
};

export interface ShoppingListItem {
  id: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  prices: Record<StoreName, { price: number | null; isOutOfStock: boolean }>;
}

export interface ScrapingJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  results?: Record<StoreName, Product[]>;
  error?: string;
}

