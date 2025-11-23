import React, { useState, useRef, useEffect } from 'react';
import { SortPriority, Reference, SearchPreferences, SelectionContext, SearchResultData, DisapprovalReason, ModelId } from './types';
import { fetchReferences } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { ReferenceCard } from './components/ReferenceCard';
import { MultiSelect } from './components/MultiSelect';
import { HelpModal } from './components/HelpModal';

const DEFAULT_TEXT = `The use of self-driving labs (SDLs) that operate in a “closed-loop” manner with minimal human intervention emerged as a promising strategy for addressing this challenge. These labs operate via iterative nanoparticle (NP) syntheses by integrating automation, e.g., robotics or microfluidics (MFs), NP characterization, and machine learning (ML). Automation enables control over reagent injection, mixing, heating, and separation. In particular, MFs offers flow-controlled reagent supply, enhanced mass and heat transfer, and real-time online NP characterization which provides rapid data acquisition. Despite the advantages of automation, the decision on the next-step syntheses for identification of the most effective NP reaction conditions remains in the hands of the operator. Here, ML algorithms play a pivotal role in inferring relationships between reaction conditions and corresponding NP properties, thereby recommending experimental conditions for subsequent optimization steps without examining the entire chemical space. Application of ML algorithms in SDLs include the stable noisy optimization by branch and fit algorithm (SNOBFIT), covariance matrix adaptation evolution strategy (CMA-ES), genetic algorithm, and Bayesian optimization (BO).`;

// Options for dropdowns
const PUBLISHER_OPTIONS = [
  "Nature Portfolio", "Science (AAAS)", "Elsevier", "Springer Nature", 
  "Wiley", "ACS", "IEEE", "RSC", "APS", "Taylor & Francis"
];

const TYPE_OPTIONS = [
  "Research Article", "Review Article", "Patent", 
  "Conference Proceedings", "Book Chapter"
];

const App: React.FC = () => {
  // State for Editor
  const editorRef = useRef<HTMLDivElement>(null);
  
  // Store results mapped by a unique ID.
  const [searchHistory, setSearchHistory] = useState<Record<string, SearchResultData>>({});
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  
  // UI State
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');

  // State for Preferences (Global controls for the *next* search)
  const [prefs, setPrefs] = useState<SearchPreferences>({
    numReferences: 1,
    priority: SortPriority.MOST_CITED,
    publisherFilter: [],
    sourceTypes: [],
    yearStart: '2018',
    model: ModelId.BALANCED
  });
  
  // Track disapproval history for learning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [disapprovalHistory, setDisapprovalHistory] = useState<import('./types').DisapprovalHistoryItem[]>([]);
  
  // Local UI error (validation errors before search starts)
  const [uiError, setUiError] = useState<string | null>(null);

  // Initialize editor text
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerText = DEFAULT_TEXT;
    }
  }, []);

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    // Cap numReferences at 5
    if (name === 'numReferences') {
      const val = parseInt(value);
      if (val > 5) setPrefs(prev => ({ ...prev, [name]: 5 }));
      else setPrefs(prev => ({ ...prev, [name]: val }));
    } else {
      setPrefs(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMultiSelectChange = (field: keyof SearchPreferences) => (selected: string[]) => {
    setPrefs(prev => ({ ...prev, [field]: selected }));
  };

  // Logic to highlight text
  const highlightSelection = (searchId: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.className = "bg-yellow-200 border-b-2 border-yellow-400 cursor-pointer hover:bg-yellow-300 transition-colors rounded-sm px-0.5";
    span.dataset.searchId = searchId;
    span.title = "Click to view references";
    
    try {
        const content = range.extractContents();
        span.appendChild(content);
        range.insertNode(span);
        selection.removeAllRanges();
    } catch (e) {
        console.error("Could not highlight text:", e);
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Handle click on highlight
    const highlightSpan = target.closest('span[data-search-id]') as HTMLElement;
    if (highlightSpan && highlightSpan.dataset.searchId) {
      setActiveSearchId(highlightSpan.dataset.searchId);
      setUiError(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  // Re-usable fetch helper to support "Fetch More"
  const performFetch = async (
    context: SelectionContext, 
    currentPrefs: SearchPreferences, 
    existingTitles: string[] = []
  ): Promise<Reference[]> => {
    // Add existing titles to excluded list to avoid duplicates
    const searchPrefs = {
      ...currentPrefs,
      excludeTitles: existingTitles
    };
    return await fetchReferences(context, searchPrefs, disapprovalHistory, customApiKey);
  };

  const sortReferencesByPriority = (refs: Reference[], priority: SortPriority): Reference[] => {
    const sorted = [...refs];
    if (priority === SortPriority.NEWEST) {
       return sorted.sort((a, b) => {
          const valA = parseInt(a.year.replace(/\D/g, '')) || 0;
          const valB = parseInt(b.year.replace(/\D/g, '')) || 0;
          return valB - valA;
       });
    }
    if (priority === SortPriority.MOST_CITED) {
       return sorted.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    }
    // For HIGH_IMPACT, we rely on the order returned by the AI as we don't have Impact Factor data
    return sorted;
  };

  const handleSearch = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !editorRef.current) {
      setUiError("Please highlight specific text in the paragraph to find relevant references for it.");
      return;
    }

    if (!editorRef.current.contains(selection.anchorNode)) {
        setUiError("Selection must be inside the editor.");
        return;
    }

    const highlightedText = selection.toString().trim();
    if (!highlightedText) return;

    const fullText = editorRef.current.innerText;
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(editorRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const precedingContext = preRange.toString().slice(-300);

    const context: SelectionContext = {
      fullText,
      highlightedText,
      precedingContext
    };

    const searchId = `search-${Date.now()}`;

    // 1. Initialize Search Entry in 'loading' state
    setSearchHistory(prev => ({
        ...prev,
        [searchId]: {
            id: searchId,
            status: 'loading',
            visible: [],
            pool: [],
            queryPrefs: { ...prefs },
            context
        }
    }));

    // 2. Highlight Text in DOM
    highlightSelection(searchId);
    
    // 3. Set as active immediately
    setActiveSearchId(searchId);
    setUiError(null);

    // 4. Execute Background Fetch
    performFetch(context, prefs)
        .then(allResults => {
            setSearchHistory(prev => {
                // Safety check if entry still exists (user might have deleted it while loading)
                if (!prev[searchId]) return prev;

                const sortedResults = sortReferencesByPriority(allResults, prefs.priority);

                const visible = sortedResults.slice(0, prefs.numReferences);
                const pool = sortedResults.slice(prefs.numReferences);

                return {
                    ...prev,
                    [searchId]: {
                        ...prev[searchId],
                        status: 'success',
                        visible,
                        pool
                    }
                };
            });
        })
        .catch(err => {
            setSearchHistory(prev => {
                if (!prev[searchId]) return prev;
                return {
                    ...prev,
                    [searchId]: {
                        ...prev[searchId],
                        status: 'error',
                        errorMessage: err instanceof Error ? err.message : "An unexpected error occurred."
                    }
                };
            });
        });
  };

  const handleRetry = () => {
    if (!activeSearchId || !searchHistory[activeSearchId]) return;

    const { context } = searchHistory[activeSearchId];
    const searchId = activeSearchId;

    // Update status to loading
    setSearchHistory(prev => ({
        ...prev,
        [searchId]: {
            ...prev[searchId],
            status: 'loading',
            errorMessage: undefined,
            queryPrefs: { ...prefs } // Update prefs to current selection
        }
    }));

    // Execute Fetch
    performFetch(context, prefs)
        .then(allResults => {
            setSearchHistory(prev => {
                if (!prev[searchId]) return prev;

                const sortedResults = sortReferencesByPriority(allResults, prefs.priority);

                const visible = sortedResults.slice(0, prefs.numReferences);
                const pool = sortedResults.slice(prefs.numReferences);

                return {
                    ...prev,
                    [searchId]: {
                        ...prev[searchId],
                        status: 'success',
                        visible,
                        pool
                    }
                };
            });
        })
        .catch(err => {
            setSearchHistory(prev => {
                if (!prev[searchId]) return prev;
                return {
                    ...prev,
                    [searchId]: {
                        ...prev[searchId],
                        status: 'error',
                        errorMessage: err instanceof Error ? err.message : "Retry failed"
                    }
                };
            });
        });
  };

  const handleClear = () => {
    if (!activeSearchId) return;

    // 1. Remove highlight from DOM
    if (editorRef.current) {
        const highlightSpan = editorRef.current.querySelector(`span[data-search-id="${activeSearchId}"]`);
        if (highlightSpan) {
            const parent = highlightSpan.parentNode;
            if (parent) {
                while (highlightSpan.firstChild) {
                    parent.insertBefore(highlightSpan.firstChild, highlightSpan);
                }
                parent.removeChild(highlightSpan);
                parent.normalize();
            }
        }
    }

    // 2. Remove from state
    setSearchHistory(prev => {
        const nextState = { ...prev };
        delete nextState[activeSearchId];
        return nextState;
    });

    setActiveSearchId(null);
    setUiError(null);
  };

  const handleDisapprove = async (indexToRemove: number, reason: DisapprovalReason) => {
    if (!activeSearchId) return;

    const currentData = searchHistory[activeSearchId];
    if (!currentData) return;

    const { visible, pool, queryPrefs, context } = currentData;
    
    // 1. Remove item from visible
    const newVisible = [...visible];
    const removedRef = newVisible[indexToRemove];
    newVisible.splice(indexToRemove, 1);

    // LOG DISAPPROVAL
    if (removedRef) {
        setDisapprovalHistory(prev => [...prev, {
            reference: removedRef,
            reason: reason,
            timestamp: Date.now()
        }]);
    }

    let newPool = [...pool];
    if (reason === DisapprovalReason.UNWANTED_SOURCE && removedRef) {
        const unwantedSource = removedRef.publication.toLowerCase().trim();
        newPool = newPool.filter(ref => ref.publication.toLowerCase().trim() !== unwantedSource);
    }

    // Re-rank for replacement ONLY (Does not re-sort the entire list)
    if (newPool.length > 0) {
      if (reason === DisapprovalReason.NOT_NEW) {
         newPool.sort((a, b) => parseInt(b.year) - parseInt(a.year));
      } else if (reason === DisapprovalReason.LOW_IMPACT) {
         newPool.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
      }
      
      const replacement = newPool.shift();
      if (replacement) {
        newVisible.splice(indexToRemove, 0, replacement);
      }
    }

    // Update state immediately
    setSearchHistory(prev => ({
      ...prev,
      [activeSearchId]: {
        ...prev[activeSearchId],
        visible: newVisible,
        pool: newPool
      }
    }));

    // 2. Refill if empty (Background Process)
    if (newPool.length === 0) {
       // Set Refilling status
       setSearchHistory(prev => ({
          ...prev,
          [activeSearchId]: { ...prev[activeSearchId], isRefilling: true }
       }));

       try {
           const existingTitles = [...newVisible, ...pool].map(r => r.title);
           const moreResults = await performFetch(context, queryPrefs, existingTitles);
           
           setSearchHistory(prev => {
               if (!prev[activeSearchId]) return prev;
               
               const current = prev[activeSearchId];
               let updatedVisible = [...current.visible];
               
               // If we still need to fill a visible slot
               if (updatedVisible.length < queryPrefs.numReferences && moreResults.length > 0) {
                  const needed = queryPrefs.numReferences - updatedVisible.length;
                  const toAdd = moreResults.slice(0, needed);
                  const toPool = moreResults.slice(needed);
                  updatedVisible = [...updatedVisible, ...toAdd];
                  
                  return {
                    ...prev,
                    [activeSearchId]: {
                        ...current,
                        visible: updatedVisible,
                        pool: toPool,
                        isRefilling: false
                    }
                  };
               } else {
                  return {
                    ...prev,
                    [activeSearchId]: {
                        ...current,
                        pool: moreResults,
                        isRefilling: false
                    }
                  };
               }
           });

      } catch (e) {
        console.error("Failed to refill references", e);
        setSearchHistory(prev => {
             if (!prev[activeSearchId]) return prev;
             return {
                 ...prev,
                 [activeSearchId]: { ...prev[activeSearchId], isRefilling: false }
             };
        });
      }
    }
  };

  const handleExport = () => {
    if (!editorRef.current) return;

    let exportContent = "";
    const seenRefs = new Map<string, number>();
    const formattedRefs: string[] = [];

    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        exportContent += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;

        if (el.tagName === 'BR') {
          exportContent += '\n';
        } else if (el.tagName === 'SPAN' && el.dataset.searchId) {
          exportContent += el.textContent;
          
          const searchId = el.dataset.searchId;
          const data = searchHistory[searchId];
          
          if (data && data.status === 'success' && data.visible.length > 0) {
            const indices: number[] = [];
            data.visible.forEach(ref => {
              const key = `${ref.title.trim().toLowerCase()}-${ref.year}`;
              let id;
              if (seenRefs.has(key)) {
                id = seenRefs.get(key)!;
              } else {
                id = formattedRefs.length + 1;
                seenRefs.set(key, id);
                formattedRefs.push(`[${id}] ${ref.title}. ${ref.publication}. ${ref.year}. Available at: ${ref.url}`);
              }
              indices.push(id);
            });
            if (indices.length > 0) {
                exportContent += ` [${indices.join(', ')}]`;
            }
          }
        } else {
          el.childNodes.forEach(child => processNode(child));
          const isBlock = ['DIV', 'P', 'H1', 'H2', 'H3', 'LI'].includes(el.tagName);
          if (isBlock) {
             exportContent += '\n';
          }
        }
      }
    };

    editorRef.current.childNodes.forEach(child => processNode(child));

    const finalOutput = `${exportContent.trim()}\n\nReferences:\n${formattedRefs.join('\n')}`;

    const blob = new Blob([finalOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'manuscript_with_references.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeData = activeSearchId ? searchHistory[activeSearchId] : null;
  // Derived state for the control panel
  const isCurrentLoading = activeData?.status === 'loading';
  const currentReferences = activeData?.visible || [];
  const currentError = activeData?.errorMessage;

  const isCustomKeyUsed = !!customApiKey && customApiKey.trim().length > 0;

  return (
    <div className="flex h-screen w-full flex-col lg:flex-row bg-slate-100 overflow-hidden">
      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
      
      {/* --- PANEL 1: CONFIGURATION (Left) --- */}
      <div className="w-full lg:w-80 bg-white border-r border-slate-200 flex flex-col z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)] h-[40vh] lg:h-full flex-shrink-0">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-white z-10">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4">
            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded text-sm">SciRef</span>
            <span className="tracking-tight">Assistant</span>
          </h1>
          
          {/* Primary Action Button - Moved to Top */}
          <button 
              onClick={handleSearch}
              className="w-full py-2.5 px-4 rounded-md shadow-sm text-sm font-semibold text-white transition-all flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:transform active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Find References for Selected Text
          </button>
        </div>

        {/* Scrollable Settings */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
           
           {/* API Key & Model */}
           <section className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">System</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCustomKeyUsed ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isCustomKeyUsed ? 'Using: Custom Key' : 'Using: Default Quota'}
                </span>
             </div>
             
             <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key (Optional)</label>
                <input 
                  type="password" 
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key"
                  className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                />
             </div>

             <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">AI Model</label>
                <div className="relative">
                    <select
                      name="model"
                      value={prefs.model}
                      onChange={handleInputChange}
                      className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white appearance-none"
                    >
                      <option value={ModelId.BEST}>Best (Gemini 3.0 Pro)</option>
                      <option value={ModelId.BALANCED}>Balanced (Gemini 2.5 Flash)</option>
                      <option value={ModelId.FAST}>Fast (Gemini 2.5 Flash Lite)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
             </div>
           </section>

           <hr className="border-slate-100" />

           {/* Search Parameters */}
           <section className="space-y-4 pb-20"> {/* Padding bottom for dropdowns */}
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Parameters</h3>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Priority</label>
                <div className="relative">
                  <select 
                    name="priority" 
                    value={prefs.priority} 
                    onChange={handleInputChange}
                    className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white appearance-none"
                  >
                    {Object.values(SortPriority).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                   <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Count (1-5)</label>
                  <input 
                    type="number" 
                    name="numReferences"
                    min={1} max={5}
                    value={prefs.numReferences}
                    onChange={handleInputChange}
                    className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">From Year</label>
                  <input 
                    type="text" 
                    name="yearStart"
                    placeholder="e.g. 2018"
                    value={prefs.yearStart}
                    onChange={handleInputChange}
                    className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <MultiSelect 
                label="Publisher Filter"
                options={PUBLISHER_OPTIONS}
                selected={prefs.publisherFilter}
                onChange={handleMultiSelectChange('publisherFilter')}
                placeholder="All Publishers"
              />

              <MultiSelect 
                label="Document Type"
                options={TYPE_OPTIONS}
                selected={prefs.sourceTypes}
                onChange={handleMultiSelectChange('sourceTypes')}
                placeholder="All Types"
              />
           </section>
        </div>
      </div>

      {/* --- PANEL 2: EDITOR (Center) --- */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-slate-50/50 h-[60vh] lg:h-full">
        <div className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shadow-sm z-10 flex-shrink-0">
           <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Manuscript Editor</span>
              <span className="text-xs text-slate-400 border border-slate-200 rounded px-1.5 bg-slate-50">Rich Text</span>
           </div>
           
           <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsHelpOpen(true)}
                className="text-xs flex items-center gap-1 text-slate-500 hover:text-indigo-600 font-medium transition-colors px-2 py-1 hover:bg-slate-50 rounded"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
                 Guide
              </button>
              <div className="h-4 w-px bg-slate-200"></div>
              <button 
                onClick={handleExport}
                className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-semibold transition-colors bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                Export
              </button>
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-slate-100/50">
           <div 
               ref={editorRef}
               className="max-w-3xl w-full bg-white shadow-sm border border-slate-200 min-h-[800px] p-8 md:p-12 outline-none font-serif text-lg leading-relaxed text-slate-800"
               contentEditable
               suppressContentEditableWarning={true}
               onClick={handleEditorClick}
               onPaste={handlePaste}
               spellCheck={false}
               style={{ whiteSpace: 'pre-wrap' }}
           />
        </div>
      </div>

      {/* --- PANEL 3: RESULTS (Right) --- */}
      <div className="w-full lg:w-96 bg-white border-l border-slate-200 flex flex-col z-10 h-full flex-shrink-0">
        
        {/* Results Header */}
        <div className="h-14 border-b border-slate-200 flex items-center px-5 bg-white z-10 flex-shrink-0">
            <span className="font-semibold text-slate-800">Results</span>
        </div>

        {/* Results Content */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50 relative">
          
          {uiError && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-xs mb-4">
               <strong>Note:</strong> {uiError}
             </div>
          )}

          {currentError && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm mb-4 animate-pulse">
               <strong>Error:</strong> {currentError}
             </div>
          )}

          {activeData && (
             <div className="mb-6 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 uppercase tracking-wide text-[10px] flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Search Parameters
                    </h3>
                    <div className="flex gap-2">
                         <button 
                            onClick={handleRetry}
                            disabled={isCurrentLoading}
                            className={`text-xs px-2 py-1 rounded bg-white border border-slate-200 shadow-sm hover:bg-slate-50 text-indigo-600 font-medium flex items-center gap-1 transition-all ${isCurrentLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Retry this search"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Retry
                        </button>
                        <button
                            onClick={handleClear}
                            className="text-xs px-2 py-1 rounded bg-white border border-slate-200 shadow-sm hover:bg-red-50 hover:border-red-100 hover:text-red-500 text-slate-500 font-medium flex items-center gap-1 transition-all"
                            title="Clear this search"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Clear
                        </button>
                    </div>
                </div>
                
                <div className="p-4 bg-white text-xs text-slate-600 space-y-3">
                     <div className="flex items-start justify-between">
                        <span className="font-semibold text-slate-500 w-16 shrink-0">Model</span>
                        <span className="text-right text-slate-800 font-medium">{activeData.queryPrefs.model}</span>
                     </div>
                     
                     <div className="flex items-start justify-between">
                        <span className="font-semibold text-slate-500 w-16 shrink-0">Priority</span>
                        <span className="text-right text-slate-800">{activeData.queryPrefs.priority}</span>
                     </div>
                     
                     <div className="flex items-start justify-between">
                        <span className="font-semibold text-slate-500 w-16 shrink-0">Year</span>
                        <span className="text-right text-slate-800">{activeData.queryPrefs.yearStart || 'Any'}</span>
                     </div>
                     
                     <div className="flex items-start justify-between">
                        <span className="font-semibold text-slate-500 w-16 shrink-0">Count</span>
                        <span className="text-right text-slate-800">{activeData.queryPrefs.numReferences}</span>
                     </div>
                     
                     <div>
                        <span className="font-semibold text-slate-500 block mb-1">Publishers</span>
                        <div className="text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100">
                           {activeData.queryPrefs.publisherFilter.length > 0 
                             ? activeData.queryPrefs.publisherFilter.join(', ') 
                             : <span className="italic text-slate-400">All publishers included</span>}
                        </div>
                     </div>
                     
                     <div>
                        <span className="font-semibold text-slate-500 block mb-1">Types</span>
                        <div className="text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100">
                           {activeData.queryPrefs.sourceTypes.length > 0 
                             ? activeData.queryPrefs.sourceTypes.join(', ') 
                             : <span className="italic text-slate-400">All document types included</span>}
                        </div>
                     </div>
                </div>
             </div>
          )}

          {/* Empty State / Loading State */}
          {!activeData && !uiError && (
             <div className="flex flex-col items-center justify-center h-64 text-slate-400 mt-10">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <p className="text-center text-sm font-medium text-slate-500">Ready to search</p>
                <p className="text-center text-xs mt-1 max-w-[200px]">Highlight text in the editor and click "Find References"</p>
             </div>
          )}

          {isCurrentLoading && (
             <div className="flex flex-col items-center justify-center pt-20 text-indigo-600">
                <div className="scale-125 mb-4"><Spinner /></div>
                <p className="text-sm font-medium animate-pulse">Finding citations...</p>
             </div>
          )}

          {!isCurrentLoading && activeData && currentReferences.length === 0 && !currentError && (
             <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                 <p className="text-center text-sm">No references found.</p>
             </div>
          )}

          {!isCurrentLoading && currentReferences.map((ref, index) => (
            <ReferenceCard 
              key={`${activeSearchId}-${index}-${ref.url}`} 
              reference={ref} 
              onDisapprove={(reason) => handleDisapprove(index, reason)}
            />
          ))}

          {activeData?.isRefilling && (
            <div className="flex items-center justify-center py-4 text-indigo-600 text-xs gap-2">
                <Spinner /> Fetching additional references...
            </div>
          )}
          
          <div className="h-10"></div>
        </div>
      </div>
    </div>
  );
};

export default App;