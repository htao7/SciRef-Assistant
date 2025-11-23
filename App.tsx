
import React, { useState, useRef, useEffect } from 'react';
import { SortPriority, Reference, SearchPreferences, SelectionContext, SearchResultData, DisapprovalReason } from './types';
import { fetchReferences } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { ReferenceCard } from './components/ReferenceCard';
import { MultiSelect } from './components/MultiSelect';

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

  // State for Preferences (Global controls for the *next* search)
  const [prefs, setPrefs] = useState<SearchPreferences>({
    numReferences: 1,
    priority: SortPriority.MOST_CITED,
    publisherFilter: [],
    sourceTypes: [],
    yearStart: '2018'
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
    return await fetchReferences(context, searchPrefs, disapprovalHistory);
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

                const visible = allResults.slice(0, prefs.numReferences);
                const pool = allResults.slice(prefs.numReferences);

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
                const visible = allResults.slice(0, prefs.numReferences);
                const pool = allResults.slice(prefs.numReferences);
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

    // Re-rank
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

  return (
    <div className="flex h-screen w-full flex-col md:flex-row bg-slate-100">
      
      {/* LEFT PANEL: EDITOR */}
      <div className="flex-1 flex flex-col p-6 border-r border-slate-200 bg-white h-full overflow-hidden">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <span className="bg-indigo-600 text-white p-1 rounded-md text-sm">SciRef</span>
            Assistant
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Paste your manuscript, highlight a claim, and find citations instantly.
          </p>
        </div>

        <div className="flex-1 relative border border-slate-300 rounded-lg shadow-inner bg-slate-50 overflow-hidden flex flex-col">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Manuscript Editor</span>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleExport}
                    className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                    title="Download text with citations"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    Export
                  </button>
                  <span className="text-xs text-slate-400">Rich Text Mode</span>
                </div>
            </div>
            
            <div 
                ref={editorRef}
                className="flex-1 w-full h-full p-6 outline-none font-serif text-lg leading-relaxed text-slate-800 bg-white overflow-y-auto"
                contentEditable
                suppressContentEditableWarning={true}
                onClick={handleEditorClick}
                onPaste={handlePaste}
                spellCheck={false}
                style={{ whiteSpace: 'pre-wrap' }}
            >
            </div>
        </div>
        
        <div className="mt-2 text-xs text-slate-400 text-center flex justify-center gap-4">
           <span>Tip: Highlight text to search. Multiple searches can run in background.</span>
        </div>
      </div>

      {/* RIGHT PANEL: CONTROLS & RESULTS */}
      <div className="w-full md:w-96 lg:w-[28rem] bg-slate-50 flex flex-col h-full border-l border-slate-200 shadow-xl z-10">
        
        {/* CONTROL HEADER */}
        <div className="p-6 bg-white border-b border-slate-200 shadow-sm overflow-y-auto max-h-[50vh]">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Search Preferences</h2>
          
          <div className="space-y-4">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase mb-1">Priority</label>
              <select 
                name="priority" 
                value={prefs.priority} 
                onChange={handleInputChange}
                className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
              >
                {Object.values(SortPriority).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Row: Count & Year */}
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">No. of REFS (1-5)</label>
                <input 
                  type="number" 
                  name="numReferences"
                  min={1} max={5}
                  value={prefs.numReferences}
                  onChange={handleInputChange}
                  className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 uppercase mb-1">After Year</label>
                <input 
                  type="text" 
                  name="yearStart"
                  placeholder="e.g. 2015"
                  value={prefs.yearStart}
                  onChange={handleInputChange}
                  className="w-full p-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Publisher MultiSelect */}
            <MultiSelect 
              label="Publisher Filter"
              options={PUBLISHER_OPTIONS}
              selected={prefs.publisherFilter}
              onChange={handleMultiSelectChange('publisherFilter')}
              placeholder="All Publishers"
            />

            {/* Type MultiSelect */}
            <MultiSelect 
              label="Document Type"
              options={TYPE_OPTIONS}
              selected={prefs.sourceTypes}
              onChange={handleMultiSelectChange('sourceTypes')}
              placeholder="All Types"
            />

            {/* Search Button */}
            <button 
              onClick={handleSearch}
              className="w-full mt-4 py-3 px-4 rounded-md shadow-sm text-sm font-medium text-white transition-all flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 hover:shadow-md active:transform active:scale-95"
            >
              Find References for Selection
            </button>
          </div>
        </div>

        {/* RESULTS LIST */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 relative">
          <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none"></div>
          
          {uiError && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm mb-4">
               <strong>Validation Error:</strong> {uiError}
             </div>
          )}

          {currentError && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm mb-4 animate-pulse">
               <strong>Error:</strong> {currentError}
             </div>
          )}

          {activeData && (
             <div className="mb-6 bg-white border border-slate-200 rounded-md shadow-sm p-4 text-xs text-slate-600">
                <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                    <h3 className="font-bold text-slate-800 uppercase tracking-wide">Search Options Used</h3>
                    <div className="flex gap-3">
                        <button 
                            onClick={handleRetry}
                            disabled={isCurrentLoading}
                            className={`text-indigo-600 hover:text-indigo-800 font-semibold hover:underline flex items-center gap-1 ${isCurrentLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {isCurrentLoading ? (
                                <>
                                  <Spinner />
                                  Processing...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Retry
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleClear}
                            className="text-red-500 hover:text-red-700 font-semibold hover:underline flex items-center gap-1"
                            title="Clear highlight and results"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Clear
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1">
                    <div><span className="font-medium text-slate-500">Priority:</span> {activeData.queryPrefs.priority}</div>
                    <div><span className="font-medium text-slate-500">No. of Refs:</span> {activeData.queryPrefs.numReferences}</div>
                    <div><span className="font-medium text-slate-500">Year:</span> &gt; {activeData.queryPrefs.yearStart}</div>
                    <div className="col-span-2">
                        <span className="font-medium text-slate-500">Types:</span> {activeData.queryPrefs.sourceTypes.length > 0 ? activeData.queryPrefs.sourceTypes.join(', ') : 'All'}
                    </div>
                    <div className="col-span-2">
                        <span className="font-medium text-slate-500">Publishers:</span> {activeData.queryPrefs.publisherFilter.length > 0 ? activeData.queryPrefs.publisherFilter.join(', ') : 'All'}
                    </div>
                </div>
             </div>
          )}

          {/* Empty State / Loading State Logic */}
          {!activeData && !uiError && (
             <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <svg className="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                </svg>
                <p className="text-center text-sm">Highlight text and click Search<br/>or click an existing highlight.</p>
             </div>
          )}

          {isCurrentLoading && (
             <div className="flex flex-col items-center justify-center h-64 text-indigo-600">
                <div className="scale-150 mb-4"><Spinner /></div>
                <p className="text-sm font-medium animate-pulse">Finding citations for highlighted text...</p>
                <p className="text-xs text-indigo-400 mt-2">You can continue working while this runs.</p>
             </div>
          )}

          {!isCurrentLoading && activeData && currentReferences.length === 0 && !currentError && (
             <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                 <p className="text-center text-sm">No references found for this highlight.</p>
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
            <div className="flex items-center justify-center py-4 text-indigo-600 text-sm gap-2">
                <Spinner /> Fetching additional references...
            </div>
          )}
          
          <div className="h-6"></div> {/* Spacer */}
        </div>
      </div>
    </div>
  );
};

export default App;
