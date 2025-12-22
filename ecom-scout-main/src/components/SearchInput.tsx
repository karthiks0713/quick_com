import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, MapPin, Package } from 'lucide-react';

interface SearchInputProps {
  onSearch: (location: string, product: string) => void;
  isLoading: boolean;
}

const locations = ['Mumbai', 'Bangalore', 'Delhi', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata'];

const SearchInput = ({ onSearch, isLoading }: SearchInputProps) => {
  const [location, setLocation] = useState('');
  const [product, setProduct] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (location.trim() && product.trim()) {
      onSearch(location.trim(), product.trim());
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="glass-card p-2 glow-border">
        <div className="flex flex-col md:flex-row gap-2">
          {/* Location Input */}
          <div className="relative flex-1">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Enter city..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              list="locations"
              className="w-full bg-secondary/50 rounded-lg pl-12 pr-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isLoading}
            />
            <datalist id="locations">
              {locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>

          {/* Product Input */}
          <div className="relative flex-1">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search product..."
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full bg-secondary/50 rounded-lg pl-12 pr-4 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              disabled={isLoading}
            />
          </div>

          {/* Search Button */}
          <motion.button
            type="submit"
            disabled={isLoading || !location.trim() || !product.trim()}
            className="bg-primary text-primary-foreground px-8 py-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Search className="w-5 h-5" />
            <span className="hidden md:inline">Compare</span>
          </motion.button>
        </div>
      </div>
    </motion.form>
  );
};

export default SearchInput;
