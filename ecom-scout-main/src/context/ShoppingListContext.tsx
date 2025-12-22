import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ShoppingListItem, StoreName } from '@/types/product';

interface ShoppingListContextType {
  items: ShoppingListItem[];
  addItem: (item: Omit<ShoppingListItem, 'id' | 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearList: () => void;
  isInList: (productName: string) => boolean;
  getTotalByStore: () => Record<StoreName, { total: number; outOfStockCount: number }>;
}

const ShoppingListContext = createContext<ShoppingListContextType | undefined>(undefined);

const STORAGE_KEY = 'grocery-shopping-list';

export function ShoppingListProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShoppingListItem[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<ShoppingListItem, 'id' | 'quantity'>) => {
    const existing = items.find(i => i.productName.toLowerCase() === item.productName.toLowerCase());
    if (existing) {
      updateQuantity(existing.id, existing.quantity + 1);
      return;
    }
    
    const newItem: ShoppingListItem = {
      ...item,
      id: Date.now().toString(),
      quantity: 1,
    };
    setItems(prev => [...prev, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, quantity } : item
    ));
  };

  const clearList = () => {
    setItems([]);
  };

  const isInList = (productName: string) => {
    return items.some(item => item.productName.toLowerCase() === productName.toLowerCase());
  };

  const getTotalByStore = (): Record<StoreName, { total: number; outOfStockCount: number }> => {
    const stores: StoreName[] = ['dmart', 'jiomart', 'naturesbasket', 'zepto', 'swiggy'];
    const totals = {} as Record<StoreName, { total: number; outOfStockCount: number }>;
    
    stores.forEach(store => {
      let total = 0;
      let outOfStockCount = 0;
      
      items.forEach(item => {
        const storePrice = item.prices[store];
        if (storePrice?.isOutOfStock) {
          outOfStockCount++;
        } else if (storePrice?.price !== null && storePrice?.price !== undefined) {
          total += storePrice.price * item.quantity;
        } else {
          outOfStockCount++;
        }
      });
      
      totals[store] = { total, outOfStockCount };
    });
    
    return totals;
  };

  return (
    <ShoppingListContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearList,
      isInList,
      getTotalByStore,
    }}>
      {children}
    </ShoppingListContext.Provider>
  );
}

export function useShoppingList() {
  const context = useContext(ShoppingListContext);
  if (context === undefined) {
    throw new Error('useShoppingList must be used within a ShoppingListProvider');
  }
  return context;
}

