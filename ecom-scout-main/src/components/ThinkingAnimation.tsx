import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

interface WebsiteStatus {
  name: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  productCount?: number;
}

interface ThinkingAnimationProps {
  websites: WebsiteStatus[];
  currentWebsite: string;
  product: string;
  location: string;
}

const websiteColors: Record<string, string> = {
  Zepto: 'from-purple-500 to-pink-500',
  "Nature's Basket": 'from-green-500 to-emerald-500',
  JioMart: 'from-blue-500 to-cyan-500',
  'D-Mart': 'from-orange-500 to-yellow-500',
};

const ThinkingAnimation = ({ websites, currentWebsite, product, location }: ThinkingAnimationProps) => {
  return (
    <motion.div
      className="w-full max-w-2xl mx-auto"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
    >
      <div className="glass-card p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-primary font-medium">Searching</span>
          </motion.div>
          <h2 className="text-2xl font-semibold text-foreground mb-2">
            Finding <span className="gradient-text">{product}</span>
          </h2>
          <p className="text-muted-foreground">in {location}</p>
        </div>

        {/* Website Progress */}
        <div className="space-y-4">
          {websites.map((website, index) => (
            <motion.div
              key={website.name}
              className="relative"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <div
                className={`flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
                  website.status === 'loading'
                    ? 'bg-secondary/80 ring-2 ring-primary/30'
                    : website.status === 'done'
                    ? 'bg-secondary/50'
                    : 'bg-secondary/30'
                }`}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {website.status === 'pending' && (
                    <Circle className="w-6 h-6 text-muted-foreground" />
                  )}
                  {website.status === 'loading' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 className="w-6 h-6 text-primary" />
                    </motion.div>
                  )}
                  {website.status === 'done' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500 }}
                    >
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    </motion.div>
                  )}
                  {website.status === 'error' && (
                    <Circle className="w-6 h-6 text-destructive" />
                  )}
                </div>

                {/* Website Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full bg-gradient-to-r ${
                        websiteColors[website.name] || 'from-gray-400 to-gray-500'
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        website.status === 'loading' ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {website.name}
                    </span>
                  </div>
                  
                  {/* Loading Text Animation */}
                  <AnimatePresence mode="wait">
                    {website.status === 'loading' && (
                      <motion.p
                        className="text-sm text-muted-foreground mt-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <motion.span
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          Scanning products...
                        </motion.span>
                      </motion.p>
                    )}
                    {website.status === 'done' && website.productCount !== undefined && (
                      <motion.p
                        className="text-sm text-primary mt-1"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        Found {website.productCount} products
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {/* Progress Bar */}
                {website.status === 'loading' && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary rounded-b-xl overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-primary to-accent"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 12, ease: 'linear' }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Thinking dots */}
        <div className="flex justify-center gap-1 mt-8">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default ThinkingAnimation;
