import { MapPin } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LOCATIONS = [
  'RT Nagar',
  'Koramangala',
  'Indiranagar',
  'HSR Layout',
  'Whitefield',
  'Electronic City',
  'Jayanagar',
  'Marathahalli',
  'Bannerghatta Road',
  'Malleshwaram',
  'BTM Layout',
  'JP Nagar',
];

interface LocationSelectorProps {
  value: string;
  onChange: (location: string) => void;
}

export function LocationSelector({ value, onChange }: LocationSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[200px] h-12 bg-card">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <SelectValue placeholder="Select location" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover">
        {LOCATIONS.map((location) => (
          <SelectItem key={location} value={location}>
            {location}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

