import { Link } from 'react-router-dom';
import { Trash2, Plus, Minus, ShoppingCart, ArrowRight, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useShoppingList } from '@/context/ShoppingListContext';
import { STORES, StoreName } from '@/types/product';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function ShoppingList() {
  const { items, removeItem, updateQuantity, clearList, getTotalByStore } = useShoppingList();
  const storeTotals = getTotalByStore();

  // Find the cheapest store
  const cheapestStore = Object.entries(storeTotals)
    .filter(([, data]) => data.total > 0 && data.outOfStockCount < items.length)
    .sort((a, b) => {
      // Prioritize stores with all items in stock
      if (a[1].outOfStockCount !== b[1].outOfStockCount) {
        return a[1].outOfStockCount - b[1].outOfStockCount;
      }
      return a[1].total - b[1].total;
    })[0];

  const handleShare = async () => {
    const listText = items
      .map((item) => `${item.quantity}x ${item.productName}`)
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(listText);
      toast({
        title: "List copied!",
        description: "Shopping list copied to clipboard",
      });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-muted/30">
        <div className="text-center p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="font-display font-bold text-2xl mb-2">Your list is empty</h2>
          <p className="text-muted-foreground mb-6">
            Search for products and add them to your shopping list
          </p>
          <Button asChild>
            <Link to="/">
              Start Shopping
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 py-6">
      <div className="container px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl">Shopping List</h1>
            <p className="text-muted-foreground">
              {items.length} item{items.length !== 1 ? 's' : ''} in your list
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={clearList}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Items List */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="animate-fade-in">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm line-clamp-2 mb-2">
                        {item.productName}
                      </h3>
                      
                      {/* Price comparison inline */}
                      <div className="flex flex-wrap gap-1">
                        {(Object.keys(STORES) as StoreName[]).map((store) => {
                          const price = item.prices[store];
                          return (
                            <Badge
                              key={store}
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                price?.isOutOfStock && "opacity-50"
                              )}
                            >
                              {STORES[store].displayName.split(' ')[0]}: {
                                price?.isOutOfStock ? 'N/A' :
                                price?.price !== null ? `₹${price.price}` : '—'
                              }
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-semibold text-sm">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Store Comparison */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Store Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(Object.keys(STORES) as StoreName[]).map((store) => {
                  const data = storeTotals[store];
                  const isCheapest = cheapestStore?.[0] === store;
                  
                  return (
                    <div
                      key={store}
                      className={cn(
                        "p-3 rounded-lg border transition-all",
                        isCheapest ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white",
                            STORES[store].bgClass
                          )}>
                            {STORES[store].displayName.charAt(0)}
                          </div>
                          <span className="font-medium text-sm">
                            {STORES[store].displayName}
                          </span>
                        </div>
                        {isCheapest && (
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            Best Deal
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-xl font-bold",
                          isCheapest ? "text-primary" : "text-foreground"
                        )}>
                          ₹{data.total.toFixed(0)}
                        </span>
                        {data.outOfStockCount > 0 && (
                          <span className="text-xs text-destructive">
                            {data.outOfStockCount} unavailable
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {cheapestStore && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    You save the most at
                  </p>
                  <p className="font-display font-bold text-xl text-primary">
                    {STORES[cheapestStore[0] as StoreName].displayName}
                  </p>
                  <p className="text-2xl font-bold mt-2">
                    ₹{cheapestStore[1].total.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

