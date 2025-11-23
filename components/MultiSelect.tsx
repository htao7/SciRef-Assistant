import React, { useState, useRef, useEffect } from 'react';

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ 
  label, 
  options, 
  selected, 
  onChange, 
  placeholder = "Select options..." 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-medium text-slate-500 uppercase mb-1">{label}</label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white flex justify-between items-center"
      >
        <span className="truncate text-slate-700">
          {selected.length === 0 
            ? <span className="text-slate-400">{placeholder}</span> 
            : `${selected.length} selected`}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.map(option => (
            <div 
              key={option} 
              onClick={() => toggleOption(option)}
              className="px-3 py-2 cursor-pointer hover:bg-slate-50 flex items-center gap-2 text-sm text-slate-700"
            >
              <input 
                type="checkbox" 
                checked={selected.includes(option)} 
                readOnly
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>{option}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
