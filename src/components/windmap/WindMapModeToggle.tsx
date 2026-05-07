import { Calendar } from 'lucide-react';

interface WindMapModeToggleProps {
  mode: 'today' | '7day';
  onChange: (mode: 'today' | '7day') => void;
}

export function WindMapModeToggle({ mode, onChange }: WindMapModeToggleProps) {
  return (
    <div className="flex bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-0.5">
      <button
        onClick={() => onChange('today')}
        className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors ${mode === 'today' ? 'bg-sky-500 text-white' : 'text-white/50 hover:text-white/80'}`}
      >
        TODAY
      </button>
      <button
        onClick={() => onChange('7day')}
        className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors flex items-center gap-1 ${mode === '7day' ? 'bg-sky-500 text-white' : 'text-white/50 hover:text-white/80'}`}
      >
        <Calendar aria-hidden="true" className="w-2.5 h-2.5" />
        7 DAYS
      </button>
    </div>
  );
}
