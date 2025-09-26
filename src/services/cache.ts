import { CacheEntry, Summary, UserPreferences } from '../types';

export class CacheService {
  private static instance: CacheService;
  private static readonly SUMMARY_PREFIX = 'summary_';
  private static readonly PREFERENCES_KEY = 'user_preferences';
  private static readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly CACHE_PREFIX = 'yt_summary_';
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private async initialize() {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Verify storage access
        await chrome.storage.local.get('test');
        this.isInitialized = true;
        console.log('[YouTube Summarizer] Cache service initialized');
      } catch (error) {
        console.error('[YouTube Summarizer] Cache service initialization error:', error);
        // Don't set isInitialized to true if initialization failed
      }
    })();

    return this.initPromise;
  }

  private async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const data = await chrome.storage.local.get(key);
      const entry = data[key] as CacheEntry<T>;

      if (!entry) return null;

      // Check if entry has expired
      if (entry.expiresAt < Date.now()) {
        await this.remove(key);
        return null;
      }

      return entry;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  private async set<T>(
    key: string,
    data: T,
    ttl: number = CacheService.DEFAULT_TTL
  ): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttl
      };

      await chrome.storage.local.set({ [key]: entry });
    } catch (error) {
      console.error('Cache write error:', error);
    }
  }

  private async remove(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
      console.log(`[YouTube Summarizer] Removed cache entry: ${key}`);
    } catch (error) {
      console.error('[YouTube Summarizer] Cache remove error:', error);
      // Don't throw, just log the error
    }
  }

  // Summary-specific methods
  public async getSummary(videoId: string): Promise<Summary | null> {
    try {
      await this.initialize();

      const key = this.CACHE_PREFIX + videoId;
      const data = await chrome.storage.local.get(key);
      const entry = data[key];

      if (!entry) {
        console.log(`[YouTube Summarizer] No cache entry found for video ${videoId}`);
        return null;
      }

      // Check if entry has expired
      if (entry.expiresAt < Date.now()) {
        console.log(`[YouTube Summarizer] Cache entry expired for video ${videoId}`);
        await this.remove(key);
        return null;
      }

      console.log(`[YouTube Summarizer] Cache hit for video ${videoId}`);
      return entry.data;
    } catch (error) {
      console.error('[YouTube Summarizer] Cache read error:', error);
      return null;
    }
  }

  public async setSummary(videoId: string, summary: Summary): Promise<void> {
    try {
      await this.initialize();

      const key = this.CACHE_PREFIX + videoId;
      const entry = {
        data: summary,
        expiresAt: Date.now() + this.CACHE_DURATION
      };

      await chrome.storage.local.set({ [key]: entry });
      console.log(`[YouTube Summarizer] Cached summary for video ${videoId}`);
    } catch (error) {
      console.error('[YouTube Summarizer] Cache write error:', error);
      // Don't throw, just log the error
    }
  }

  public async removeSummary(videoId: string): Promise<void> {
    await this.remove(`${CacheService.SUMMARY_PREFIX}${videoId}`);
  }

  // Get all cached summaries
  public async getAllSummaries(): Promise<Summary[]> {
    try {
      const data = await chrome.storage.local.get(null);
      const summaries: Summary[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(CacheService.SUMMARY_PREFIX)) {
          const entry = value as CacheEntry<Summary>;
          if (entry.expiresAt > Date.now()) {
            summaries.push(entry.data);
          } else {
            // Clean up expired entries
            await this.remove(key);
          }
        }
      }

      return summaries.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error('Error fetching all summaries:', error);
      return [];
    }
  }

  // User preferences methods
  public async getUserPreferences(): Promise<UserPreferences> {
    const entry = await this.get<UserPreferences>(CacheService.PREFERENCES_KEY);
    if (!entry?.data) {
      // Return default preferences
      return {
        defaultLanguage: 'en',
        defaultSummaryStyle: 'bullet',
        defaultSummaryLength: 'medium',
        autoTranslate: true,
        theme: 'light'
      };
    }
    return entry.data;
  }

  public async setUserPreferences(
    preferences: UserPreferences,
    ttl: number = 365 * 24 * 60 * 60 * 1000 // 1 year
  ): Promise<void> {
    await this.set(CacheService.PREFERENCES_KEY, preferences, ttl);
  }

  // Cache cleanup
  public async cleanup(): Promise<void> {
    try {
      await this.initialize();

      const data = await chrome.storage.local.get(null);
      const now = Date.now();
      const keysToRemove: string[] = [];

      // Find expired entries
      Object.entries(data).forEach(([key, value]) => {
        if (key.startsWith(this.CACHE_PREFIX) && value.expiresAt < now) {
          keysToRemove.push(key);
        }
      });

      // Remove expired entries
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`[YouTube Summarizer] Cleaned up ${keysToRemove.length} expired cache entries`);
      }
    } catch (error) {
      console.error('[YouTube Summarizer] Cache cleanup error:', error);
      // Don't throw, just log the error
    }
  }

  // Storage usage information
  public async getStorageUsage(): Promise<{
    used: number;
    total: number;
    percentage: number;
  }> {
    try {
      const info = await chrome.storage.local.getBytesInUse(null);
      const quota = chrome.storage.local.QUOTA_BYTES;
      return {
        used: info,
        total: quota,
        percentage: (info / quota) * 100
      };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return { used: 0, total: 0, percentage: 0 };
    }
  }
} 