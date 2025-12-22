import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Filter, SortAsc } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { LocationSelector } from '@/components/LocationSelector';
import { ProductCard } from '@/components/ProductCard';
import { ScrapingProgress } from '@/components/ScrapingProgress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useScrapingJob } from '@/hooks/useScrapingJob';
import { Product, StoreName, STORES } from '@/types/product';

type SortOption = 'price-asc' | 'price-desc' | 'discount';

interface AggregatedProduct {
  name: string;
  imageUrl: string | null;
  prices: Record<StoreName, Product | null>;
}

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get('q') || '';
  const locationParam = searchParams.get('loc') || 'RT Nagar';
  
  const [location, setLocation] = useState(locationParam);
  const [sortBy, setSortBy] = useState<SortOption>('price-asc');
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  
  const { startScraping, job, isLoading, error } = useScrapingJob();

  useEffect(() => {
    if (query) {
      startScraping(query, location);
    }
  }, [query, location]);

  const handleSearch = (newQuery: string) => {
    const params = new URLSearchParams({ q: newQuery, loc: location });
    navigate(`/search?${params}`);
  };

  const handleLocationChange = (newLocation: string) => {
    setLocation(newLocation);
    if (query) {
      const params = new URLSearchParams({ q: query, loc: newLocation });
      navigate(`/search?${params}`);
    }
  };

  // Aggregate products from all stores
  const aggregatedProducts = useMemo<AggregatedProduct[]>(() => {
    if (!job?.results) {
      console.log('⚠️ No job results available');
      return [];
    }

    console.log('🔄 Aggregating products from job results:', job.results);
    const productMap = new Map<string, AggregatedProduct>();

    (Object.keys(STORES) as StoreName[]).forEach((store) => {
      const products = job.results![store] || [];
      products.forEach((product) => {
        const normalizedName = product.name.toLowerCase().trim();
        
        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            name: product.name,
            imageUrl: product.imageUrl,
            prices: {
              dmart: null,
              jiomart: null,
              naturesbasket: null,
              zepto: null,
              swiggy: null,
            },
          });
        }
        
        const existing = productMap.get(normalizedName)!;
        existing.prices[store] = product;
        if (!existing.imageUrl && product.imageUrl) {
          existing.imageUrl = product.imageUrl;
        }
      });
    });

    const aggregated = Array.from(productMap.values());
    console.log(`✅ Aggregated ${aggregated.length} unique products`);
    return aggregated;
  }, [job?.results]);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let products = [...aggregatedProducts];

    if (showInStockOnly) {
      products = products.filter((p) =>
        Object.values(p.prices).some((price) => price && !price.isOutOfStock && price.price !== null)
      );
    }

    products.sort((a, b) => {
      const getMinPrice = (p: AggregatedProduct) => {
        const prices = Object.values(p.prices)
          .filter((price) => price && !price.isOutOfStock && price.price !== null)
          .map((price) => price!.price!);
        return prices.length > 0 ? Math.min(...prices) : Infinity;
      };

      const getMaxDiscount = (p: AggregatedProduct) => {
        const discounts = Object.values(p.prices)
          .filter((price) => price && price.discount !== null)
          .map((price) => price!.discount!);
        return discounts.length > 0 ? Math.max(...discounts) : 0;
      };

      switch (sortBy) {
        case 'price-asc':
          return getMinPrice(a) - getMinPrice(b);
        case 'price-desc':
          return getMinPrice(b) - getMinPrice(a);
        case 'discount':
          return getMaxDiscount(b) - getMaxDiscount(a);
        default:
          return 0;
      }
    });

    return products;
  }, [aggregatedProducts, sortBy, showInStockOnly]);

  const isSearching = isLoading || (job && job.status !== 'completed' && job.status !== 'failed');

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30">
      {/* Search Header */}
      <div className="bg-card border-b py-4 sticky top-16 z-40">
        <div className="container px-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <LocationSelector value={location} onChange={handleLocationChange} />
            <div className="flex-1">
              <SearchBar 
                onSearch={handleSearch} 
                isLoading={isSearching}
                defaultValue={query}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4 py-6">
        {/* Loading State */}
        {isSearching && job && (
          <div className="flex items-center justify-center py-12">
            <ScrapingProgress status={job.status} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => startScraping(query, location)}>Try Again</Button>
          </div>
        )}

        {/* Results */}
        {!isSearching && job?.status === 'completed' && (
          <>
            {/* Filters and Sort */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <p className="text-muted-foreground">
                Found <span className="font-semibold text-foreground">{filteredProducts.length}</span> products for "{query}"
              </p>
              
              <div className="flex items-center gap-3">
                <Button
                  variant={showInStockOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowInStockOnly(!showInStockOnly)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  In Stock Only
                </Button>
                
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[160px] bg-card">
                    <SortAsc className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="price-asc">Price: Low to High</SelectItem>
                    <SelectItem value="price-desc">Price: High to Low</SelectItem>
                    <SelectItem value="discount">Best Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Product Grid */}
            {filteredProducts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product, index) => (
                  <ProductCard
                    key={`${product.name}-${index}`}
                    productName={product.name}
                    imageUrl={product.imageUrl}
                    prices={product.prices}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No products found. Try a different search term.</p>
              </div>
            )}
          </>
        )}

        {/* Initial Loading Skeleton */}
        {isSearching && !job && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg p-4">
                <Skeleton className="aspect-square w-full mb-4" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

