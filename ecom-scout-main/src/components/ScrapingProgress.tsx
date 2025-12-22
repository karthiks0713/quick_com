import { Check, Loader2, Clock } from 'lucide-react';
import { STORES, StoreName } from '@/types/product';
import { cn } from '@/lib/utils';

interface ScrapingProgressProps {
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export function ScrapingProgress({ status }: ScrapingProgressProps) {
  const stores = Object.keys(STORES) as StoreName[];
  const isProcessing = status === 'processing';
  const isCompleted = status === 'completed';

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border animate-fade-in">
      <div className="text-center mb-6">
        {isCompleted ? (
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
            <Check className="h-6 w-6 text-primary" />
          </div>
        ) : (
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        )}
        <h3 className="font-display font-semibold text-lg">
          {isCompleted ? 'Search Complete!' : 'Searching stores...'}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isCompleted 
            ? 'Found the best prices for you'
            : 'Comparing prices across 5 stores'}
        </p>
      </div>

      <div className="space-y-2">
        {stores.map((store, index) => (
          <div
            key={store}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg transition-all duration-300",
              isCompleted ? "bg-primary/5" : "bg-muted/50"
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white",
              STORES[store].bgClass
            )}>
              {STORES[store].displayName.charAt(0)}
            </div>
            <span className="flex-1 font-medium text-sm">
              {STORES[store].displayName}
            </span>
            {isCompleted ? (
              <Check className="h-5 w-5 text-primary" />
            ) : isProcessing ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : (
              <Clock className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

