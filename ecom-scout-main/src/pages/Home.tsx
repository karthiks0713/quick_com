import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, TrendingDown, Clock, Store } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { LocationSelector } from '@/components/LocationSelector';
import { CategoryChips } from '@/components/CategoryChips';

export default function Home() {
  const navigate = useNavigate();
  const [location, setLocation] = useState('RT Nagar');

  const handleSearch = (query: string) => {
    const params = new URLSearchParams({ q: query, loc: location });
    navigate(`/search?${params}`);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 py-16 sm:py-24">
        <div className="container px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl md:text-6xl mb-6 tracking-tight">
              Compare Grocery Prices
              <span className="text-primary block">Across 5 Stores</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
              Find the best deals on groceries from DMart, JioMart, Nature's Basket, Zepto, and Swiggy Instamart — all in one place.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl mx-auto mb-6">
              <LocationSelector value={location} onChange={setLocation} />
              <div className="flex-1">
                <SearchBar onSearch={handleSearch} placeholder="Search for any grocery item..." />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-3">Popular searches:</p>
              <CategoryChips onSelect={handleSearch} />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-muted/30">
        <div className="container px-4">
          <h2 className="font-display font-bold text-2xl sm:text-3xl text-center mb-12">
            How It Works
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Store,
                title: '5 Stores',
                description: 'Compare prices from DMart, JioMart, Nature\'s Basket, Zepto & Swiggy',
              },
              {
                icon: TrendingDown,
                title: 'Best Prices',
                description: 'Instantly see which store offers the lowest price',
              },
              {
                icon: ShoppingBag,
                title: 'Shopping List',
                description: 'Build your list and optimize by store',
              },
              {
                icon: Clock,
                title: 'Real-time',
                description: 'Live prices fetched directly from each store',
              },
            ].map((feature, index) => (
              <div 
                key={feature.title}
                className="text-center p-6 rounded-xl bg-card border animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Store Logos */}
      <section className="py-12">
        <div className="container px-4">
          <p className="text-center text-sm text-muted-foreground mb-6">
            Comparing prices from
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            {[
              { name: 'DMart', class: 'bg-orange-500' },
              { name: 'JioMart', class: 'bg-blue-500' },
              { name: "Nature's Basket", class: 'bg-green-600' },
              { name: 'Zepto', class: 'bg-purple-500' },
              { name: 'Swiggy', class: 'bg-orange-600' },
            ].map((store) => (
              <div
                key={store.name}
                className={`${store.class} text-white px-4 py-2 rounded-lg font-semibold text-sm`}
              >
                {store.name}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

