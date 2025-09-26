// Video related types
export interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  duration: string;
  tabId: number;
}

// Summary related types
export interface Summary {
  id: string;
  videoId: string;
  content: string;
  language: string;
  timestamp: number;
  keyPoints: string[];
  topics: string[];
}

export type SummaryStyle = 'bullet' | 'paragraph';
export type SummaryLength = 'short' | 'medium' | 'long';

export interface SummaryOptions {
  style: SummaryStyle;
  length: SummaryLength;
  language: string;
  includeTags: boolean;
  includeTimestamps: boolean;
}

// API related types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranscriptSegment {
  text: string;
  timestamp: string;
  duration: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string;
}

// User related types
export interface User {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  defaultLanguage: string;
  defaultSummaryStyle: SummaryStyle;
  defaultSummaryLength: SummaryLength;
  autoTranslate: boolean;
  theme: 'light' | 'dark';
}

// Export related types
export type ExportFormat = 'text' | 'markdown' | 'notion' | 'gdocs';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  includeTimestamps: boolean;
}

// Cache related types
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Error types
export interface ExtensionError extends Error {
  code: string;
  context?: any;
} 