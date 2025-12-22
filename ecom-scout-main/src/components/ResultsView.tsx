import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Package, Clock, Store, ChevronDown, TrendingDown, Search } from 'lucide-react';
import ProductCard from './ProductCard';

interface Product {
  name: string;
  price: number;
  mrp: number;
  discount: number;
  imageUrl: string;
  productUrl: string;
  isOutOfStock: boolean;
}

interface WebsiteResult {
  website: string;
  success: boolean;
  duration: string;
  productCount: number;
  error?: string;
  data?: {
    products: Product[];
    totalProducts: number;
  };
}

interface ResultsData {
  location: string;
  product: string;
  totalDuration: string;
  summary: {
    totalWebsites: number;
    successCount: number;
    failedCount: number;
    totalProducts: number;
  };
  websites: WebsiteResult[];
}

interface ResultsViewProps {
  results: ResultsData;
  onBack: () => void;
}

const websiteColors: Record<string, string> = {
  Zepto: 'from-purple-500 to-pink-500',
  "Nature's Basket": 'from-green-500 to-emerald-500',
  JioMart: 'from-blue-500 to-cyan-500',
  'D-Mart': 'from-orange-500 to-yellow-500',
};

const ResultsView = ({ results, onBack }: ResultsViewProps) => {
  const [activeWebsite, setActiveWebsite] = useState<string | null>(
    results.websites.find((w) => w.success && w.data?.products?.length)?.website || null
  );
  const [sortBy, setSortBy] = useState<'price' | 'discount'>('price');

  const activeData = results.websites.find((w) => w.website === activeWebsite);
  
  const sortedProducts = activeData?.data?.products
    ? [...activeData.data.products].sort((a, b) => {
        if (sortBy === 'price') return a.price - b.price;
        return b.discount - a.discount;
      })
    : [];

  const lowestPrice = results.websites
    .filter((w) => w.success && w.data?.products?.length)
    .flatMap((w) => w.data?.products || [])
    .reduce((min, p) => (p.price < min ? p.price : min), Infinity);

  return (
    <motion.div
      className="min-h-screen w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Header */}
      <motion.header
        className="sticky top-0 z-50 glass-card border-b border-border/50 backdrop-blur-xl"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.button
                onClick={onBack}
                className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
              
              <div>
                <h1 className="text-xl font-semibold">
                  <span className="gradient-text">{results.product}</span>
                </h1>
                <p className="text-sm text-muted-foreground">{results.location}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-6">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">{results.summary.totalProducts} products</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Store className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">{results.summary.successCount}/{results.summary.totalWebsites} stores</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">{results.totalDuration}</span>
              </div>
              {lowestPrice !== Infinity && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <TrendingDown className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-primary">From ₹{lowestPrice.toFixed(0)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar - Website Tabs */}
          <motion.aside
            className="lg:w-72 flex-shrink-0"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="glass-card p-4 lg:sticky lg:top-24">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">Stores</h2>
              <div className="space-y-2">
                {results.websites.map((website) => (
                  <motion.button
                    key={website.website}
                    onClick={() => website.success && setActiveWebsite(website.website)}
                    disabled={!website.success}
                    className={`w-full p-3 rounded-xl text-left transition-all ${
                      activeWebsite === website.website
                        ? 'bg-primary/10 ring-2 ring-primary/30'
                        : website.success
                        ? 'bg-secondary/50 hover:bg-secondary'
                        : 'bg-secondary/30 opacity-50 cursor-not-allowed'
                    }`}
                    whileHover={website.success ? { scale: 1.02 } : {}}
                    whileTap={website.success ? { scale: 0.98 } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full bg-gradient-to-r ${
                          websiteColors[website.website] || 'from-gray-400 to-gray-500'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{website.website}</p>
                        <p className="text-xs text-muted-foreground">
                          {website.success
                            ? `${website.productCount} products`
                            : 'Failed to load'}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.aside>

          {/* Main Content - Products */}
          <main className="flex-1 min-w-0">
            {/* Sort Controls */}
            {activeData?.success && sortedProducts.length > 0 && (
              <motion.div
                className="flex items-center justify-between mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <p className="text-sm text-muted-foreground">
                  Showing {sortedProducts.length} products from {activeWebsite}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'price' | 'discount')}
                    className="bg-secondary text-foreground text-sm px-3 py-1.5 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="price">Price: Low to High</option>
                    <option value="discount">Discount: High to Low</option>
                  </select>
                </div>
              </motion.div>
            )}

            {/* Products Grid */}
            <AnimatePresence mode="wait">
              {activeData?.success && sortedProducts.length > 0 ? (
                <motion.div
                  key={activeWebsite}
                  className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {sortedProducts.map((product, index) => (
                    <ProductCard key={`${product.name}-${index}`} product={product} index={index} />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  className="flex flex-col items-center justify-center py-20"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Search className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {activeWebsite
                      ? 'No products found from this store'
                      : 'Select a store to view products'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </motion.div>
  );
};

export default ResultsView;
