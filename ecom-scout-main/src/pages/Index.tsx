import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import SearchInput from '../components/SearchInput';
import ThinkingAnimation from '../components/ThinkingAnimation';
import ResultsView from '../components/ResultsView';

type AppState = 'search' | 'thinking' | 'results';

interface WebsiteStatus {
  name: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  productCount?: number;
}

const WEBSITES = ['Zepto', "Nature's Basket", 'JioMart', 'D-Mart'];

// API Configuration - Connect to real backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003';

const Index = () => {
  const [appState, setAppState] = useState<AppState>('search');
  const [websiteStatuses, setWebsiteStatuses] = useState<WebsiteStatus[]>(
    WEBSITES.map((name) => ({ name, status: 'pending' }))
  );
  const [currentWebsite, setCurrentWebsite] = useState('');
  const [searchParams, setSearchParams] = useState({ location: '', product: '' });
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Real API call to backend
  const searchProducts = useCallback(async (location: string, product: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/scrape?location=${encodeURIComponent(location)}&product=${encodeURIComponent(product)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }, []);

  const handleSearch = useCallback(async (location: string, product: string) => {
    setError(null);
    setSearchParams({ location, product });
    setAppState('thinking');
    
    // Reset statuses
    const initialStatuses = WEBSITES.map((name) => ({ name, status: 'pending' as const }));
    setWebsiteStatuses(initialStatuses);
    setCurrentWebsite('');

    try {
      // Call real API (NO MOCK DATA)
      const apiResponse = await searchProducts(location, product);
      
      // Update website statuses based on API response
      if (apiResponse.websites && Array.isArray(apiResponse.websites)) {
        apiResponse.websites.forEach((websiteResult: any) => {
      setWebsiteStatuses((prev) =>
        prev.map((w) =>
              w.name === websiteResult.website
                ? {
                    ...w,
                    status: websiteResult.success ? ('done' as const) : ('error' as const),
                    productCount: websiteResult.productCount || 0,
                  }
            : w
        )
      );
      });
    }

      // Set results from API response
    setResults({
        location: apiResponse.location || location,
        product: apiResponse.product || product,
        totalDuration: apiResponse.totalDuration || '0s',
        summary: apiResponse.summary || {
        totalWebsites: WEBSITES.length,
          successCount: 0,
          failedCount: 0,
          totalProducts: 0,
      },
        websites: apiResponse.websites || [],
    });

    // Short delay before showing results
    await new Promise((resolve) => setTimeout(resolve, 500));
    setAppState('results');
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search products. Please try again.');
      setAppState('search');
      
      // Reset statuses on error
      setWebsiteStatuses(WEBSITES.map((name) => ({ name, status: 'pending' as const })));
    }
  }, [searchProducts]);

  const handleBack = () => {
    setAppState('search');
    setResults(null);
    setWebsiteStatuses(WEBSITES.map((name) => ({ name, status: 'pending' })));
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/5 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        {appState === 'search' && (
          <motion.div
            key="search"
            className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ duration: 0.3 }}
          >
            {/* Logo/Branding */}
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.div
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent mb-6"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Sparkles className="w-8 h-8 text-primary-foreground" />
              </motion.div>
              
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                <span className="gradient-text">PriceWise</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Compare prices across Zepto, Nature's Basket, JioMart & D-Mart in seconds
              </p>
            </motion.div>

            {/* Search Input */}
            <SearchInput onSearch={handleSearch} isLoading={appState === 'thinking'} />
            
            {/* Error Message */}
            {error && (
              <motion.div
                className="mt-4 max-w-2xl mx-auto"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="glass-card p-4 border-destructive/50 bg-destructive/10">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              </motion.div>
            )}

            {/* Features */}
            <motion.div
              className="flex flex-wrap justify-center gap-4 mt-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {['Real-time prices', 'Smart comparison', '4 major stores'].map((feature, i) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="text-sm text-muted-foreground">{feature}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        )}

        {appState === 'thinking' && (
          <motion.div
            key="thinking"
            className="min-h-screen flex items-center justify-center px-4 py-12"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.3 }}
          >
            <ThinkingAnimation
              websites={websiteStatuses}
              currentWebsite={currentWebsite}
              product={searchParams.product}
              location={searchParams.location}
            />
          </motion.div>
        )}

        {appState === 'results' && results && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ResultsView results={results} onBack={handleBack} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
