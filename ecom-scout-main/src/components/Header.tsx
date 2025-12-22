import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Search, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useShoppingList } from '@/context/ShoppingListContext';
import { cn } from '@/lib/utils';

export function Header() {
  const location = useLocation();
  const { items } = useShoppingList();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/search', label: 'Search', icon: Search },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-xl hidden sm:inline">
            PriceCompare
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Button
              key={path}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "gap-2",
                location.pathname === path && "bg-muted"
              )}
            >
              <Link to={path}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            </Button>
          ))}
          
          <Button asChild variant="ghost" size="sm" className="relative">
            <Link to="/list">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">My List</span>
              {itemCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {itemCount}
                </Badge>
              )}
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

