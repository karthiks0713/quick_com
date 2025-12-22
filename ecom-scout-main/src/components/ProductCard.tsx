import { Plus, Check, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Product, StoreName, STORES } from '@/types/product';
import { useShoppingList } from '@/context/ShoppingListContext';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  productName: string;
  imageUrl: string | null;
  prices: Record<StoreName, Product | null>;
}

export function ProductCard({ productName, imageUrl, prices }: ProductCardProps) {
  const { addItem, isInList } = useShoppingList();
  const inList = isInList(productName);

  // Find the cheapest available price
  const availablePrices = Object.entries(prices)
    .filter(([, product]) => product?.price !== null && !product?.isOutOfStock)
    .map(([store, product]) => ({ store: store as StoreName, price: product!.price! }));
  
  const cheapestPrice = availablePrices.length > 0
    ? availablePrices.reduce((min, curr) => curr.price < min.price ? curr : min)
    : null;

  const handleAddToList = () => {
    const pricesMap: Record<StoreName, { price: number | null; isOutOfStock: boolean }> = {
      dmart: { price: prices.dmart?.price ?? null, isOutOfStock: prices.dmart?.isOutOfStock ?? true },
      jiomart: { price: prices.jiomart?.price ?? null, isOutOfStock: prices.jiomart?.isOutOfStock ?? true },
      naturesbasket: { price: prices.naturesbasket?.price ?? null, isOutOfStock: prices.naturesbasket?.isOutOfStock ?? true },
      zepto: { price: prices.zepto?.price ?? null, isOutOfStock: prices.zepto?.isOutOfStock ?? true },
      swiggy: { price: prices.swiggy?.price ?? null, isOutOfStock: prices.swiggy?.isOutOfStock ?? true },
    };
    
    addItem({
      productName,
      imageUrl,
      prices: pricesMap,
    });
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 animate-fade-in">
      <div className="aspect-square relative bg-muted p-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={productName}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder.svg';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingCart className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {cheapestPrice && (
          <Badge className={cn("absolute top-2 right-2", STORES[cheapestPrice.store].bgClass)}>
            Best: ₹{cheapestPrice.price}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-semibold text-sm line-clamp-2 mb-3 min-h-[2.5rem]">
          {productName}
        </h3>
        
        {/* Price comparison grid */}
        <div className="space-y-1.5 mb-4">
          {(Object.keys(STORES) as StoreName[]).map((store) => {
            const product = prices[store];
            const isCheapest = cheapestPrice?.store === store;
            
            return (
              <div 
                key={store}
                className={cn(
                  "flex items-center justify-between text-xs py-1 px-2 rounded",
                  isCheapest ? "bg-primary/10" : "bg-muted/50"
                )}
              >
                <span className="font-medium text-muted-foreground">
                  {STORES[store].displayName}
                </span>
                <span className={cn(
                  "font-semibold",
                  product?.isOutOfStock ? "text-destructive" : 
                  isCheapest ? "text-primary" : "text-foreground"
                )}>
                  {product?.isOutOfStock ? 'Out of Stock' :
                   product?.price !== null ? `₹${product.price}` : '—'}
                </span>
              </div>
            );
          })}
        </div>

        <Button
          onClick={handleAddToList}
          variant={inList ? "secondary" : "default"}
          className="w-full"
          disabled={inList}
        >
          {inList ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              In List
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add to List
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
