import React, { useState, useRef, useEffect } from 'react';
import { Reference, DisapprovalReason } from '../types';

interface ReferenceCardProps {
  reference: Reference;
  onDisapprove: (reason: DisapprovalReason) => void;
}

export const ReferenceCard: React.FC<ReferenceCardProps> = ({ reference, onDisapprove }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleReasonSelect = (reason: DisapprovalReason) => {
    onDisapprove(reason);
    setShowMenu(false);
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow mb-4 relative group">
      <div className="flex justify-between items-start gap-2 mb-1">
        <h3 className="text-md font-bold text-indigo-900 leading-tight pr-6">
          <a href={reference.url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-indigo-700">
            {reference.title}
          </a>
        </h3>
        
        {/* Absolute positioned Action Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-slate-100 transition-colors"
            title="Remove/Replace"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
               <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-6 z-20 w-40 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-100">
                Reason for removal:
              </div>
              <button onClick={() => handleReasonSelect(DisapprovalReason.NOT_NEW)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                 <span>Not new</span>
              </button>
              <button onClick={() => handleReasonSelect(DisapprovalReason.LOW_IMPACT)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                 <span>Not highly cited</span>
              </button>
              <button onClick={() => handleReasonSelect(DisapprovalReason.NOT_RELEVANT)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                 <span>Not relevant</span>
              </button>
              <button onClick={() => handleReasonSelect(DisapprovalReason.UNWANTED_SOURCE)} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-red-50 hover:text-red-700 flex items-center gap-2">
                 <span>Unwanted source</span>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-2 items-center">
        {reference.citationCount !== undefined && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200" title="Approximate Citation Count">
                Cited by {reference.citationCount}
            </span>
        )}
        <div className="text-xs text-slate-500 font-medium">
            {reference.authors.slice(0, 3).join(', ')}{reference.authors.length > 3 ? ' et al.' : ''} &bull; {reference.year} &bull; {reference.publication}
        </div>
      </div>
      
      <div className="mb-2">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Summary: </span>
        <span className="text-sm text-slate-600">{reference.summary}</span>
      </div>
      
      <div className="bg-indigo-50 p-2 rounded text-xs border border-indigo-100">
        <span className="font-bold text-indigo-800">Relevance: </span>
        <span className="text-indigo-700">{reference.relevance}</span>
      </div>
    </div>
  );
};