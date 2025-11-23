
export interface Reference {
  title: string;
  authors: string[];
  year: string;
  publication: string;
  url: string;
  summary: string;
  relevance: string;
  citationCount?: number;
}

export enum SortPriority {
  NEWEST = 'Newest First',
  MOST_CITED = 'Highly Cited',
  HIGH_IMPACT = 'High Impact Journal',
}

export enum DisapprovalReason {
  NOT_NEW = 'not new',
  NOT_RELEVANT = 'not relevant',
  LOW_IMPACT = 'not highly cited',
  UNWANTED_SOURCE = 'unwanted source',
}

export enum ModelId {
  BEST = 'gemini-3-pro-preview',
  BALANCED = 'gemini-2.5-flash',
  FAST = 'gemini-flash-lite-latest',
}

export interface SearchPreferences {
  numReferences: number;
  priority: SortPriority;
  publisherFilter: string[];
  sourceTypes: string[];
  yearStart: string;
  excludeTitles?: string[]; // To prevent duplicates when fetching more
  model: string;
}

export interface SelectionContext {
  fullText: string;
  highlightedText: string;
  precedingContext: string;
}

export type SearchStatus = 'loading' | 'success' | 'error';

export interface SearchResultData {
  id: string;
  status: SearchStatus;
  visible: Reference[];
  pool: Reference[];
  queryPrefs: SearchPreferences;
  context: SelectionContext;
  errorMessage?: string;
  isRefilling?: boolean; // specific loading state for fetching more
}

export interface DisapprovalHistoryItem {
  reference: Reference;
  reason: DisapprovalReason;
  timestamp: number;
}
