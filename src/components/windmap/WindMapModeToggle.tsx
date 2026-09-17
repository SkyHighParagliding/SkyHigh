import { Calendar, CalendarClock } from 'lucide-react';
import { ModeSwitchPill } from './ModeSwitchPill';

interface WindMapModeToggleProps {
  mode: 'today' | '7day';
  onChange: (mode: 'today' | '7day') => void;
}

export function WindMapModeToggle({ mode, onChange }: WindMapModeToggleProps) {
  return (
    <ModeSwitchPill
      value={mode}
      onChange={onChange}
      options={[
        { value: 'today', label: 'Today', icon: CalendarClock },
        { value: '7day', label: '7 Days', icon: Calendar },
      ]}
    />
  );
}
