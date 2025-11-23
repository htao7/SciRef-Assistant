import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 p-1.5 rounded-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h2 className="text-xl font-bold text-slate-800">How to Use SciRef Assistant</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Hardcoded representation of the Markdown file for consistent rendering */}
        <div className="p-8 overflow-y-auto text-slate-600 leading-relaxed space-y-6">
          
          <section>
            <p className="text-lg text-slate-700">
              <strong className="text-indigo-900">SciRef Assistant</strong> is a smart tool for researchers to find context-aware academic references for scientific papers using Google Gemini.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold">1</span>
              Quick Start
            </h3>
            <ul className="list-disc pl-10 space-y-2 marker:text-indigo-400">
              <li><strong>Paste Manuscript:</strong> Copy your text into the editor.</li>
              <li><strong>Highlight Text:</strong> Select (highlight) a specific sentence or claim you want to cite.</li>
              <li><strong>Get References:</strong> The assistant automatically analyzes the context of your selection and finds relevant papers in the right-hand panel.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold">2</span>
              Features
            </h3>
            
            <div className="grid gap-4 md:grid-cols-2">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        🔍 Search & Filters
                    </h4>
                    <ul className="text-sm space-y-1 list-disc pl-4">
                        <li><strong>Context-Aware:</strong> Uses surrounding text to understand meaning.</li>
                        <li><strong>Filters:</strong> Refine by Year, Publisher, or Document Type.</li>
                        <li><strong>Priority:</strong> Sort by Citation Count, Impact, or Date.</li>
                    </ul>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                         🛠️ Refinement
                    </h4>
                    <ul className="text-sm space-y-1 list-disc pl-4">
                        <li><strong>Disapprove:</strong> Remove irrelevant papers via the card menu.</li>
                        <li><strong>Learning:</strong> The AI learns from your rejections to find better replacements.</li>
                    </ul>
                </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs font-bold">3</span>
              Exporting
            </h3>
            <p className="pl-9">
              Click the <strong>Export</strong> button to download your manuscript. Citations will be inserted as bracketed numbers <code>[1]</code>, and a formatted bibliography will be appended to the file.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};