import { Button } from '@/components/ui/button';

const CATEGORIES = [
  { label: 'Snacks', query: 'chips' },
  { label: 'Beverages', query: 'cola' },
  { label: 'Dairy', query: 'milk' },
  { label: 'Bread', query: 'bread' },
  { label: 'Rice', query: 'basmati rice' },
  { label: 'Oil', query: 'cooking oil' },
  { label: 'Sugar', query: 'sugar' },
  { label: 'Biscuits', query: 'biscuits' },
];

interface CategoryChipsProps {
  onSelect: (query: string) => void;
}

export function CategoryChips({ onSelect }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {CATEGORIES.map((category) => (
        <Button
          key={category.query}
          variant="outline"
          size="sm"
          onClick={() => onSelect(category.query)}
          className="rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
        >
          {category.label}
        </Button>
      ))}
    </div>
  );
}

