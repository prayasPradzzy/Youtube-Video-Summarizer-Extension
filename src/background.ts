import { CacheService } from './services/cache';
import { GeminiService } from './services/gemini';
import { config } from './config';
import type { 
  APIResponse, 
  Summary, 
  SummaryOptions,
  VideoMetadata 
} from './types';

class BackgroundService {
  private gemini: GeminiService;
  private cache: CacheService;
  private processingVideos: Set<string>;
  private contentScriptStatus: Map<number, boolean>;
  private initializationRetries: Map<number, number>;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY = 1000;
  private injectedTabs = new Set<number>();
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    this.gemini = GeminiService.getInstance();
    this.cache = CacheService.getInstance();
    this.processingVideos = new Set();
    this.contentScriptStatus = new Map();
    this.initializationRetries = new Map();
    
    // Initialize services immediately
    this.initialize().catch(error => {
      console.error('[YouTube Summarizer] Failed to initialize background service:', error);
    });

    // Set up message listener immediately
    this.setupMessageListener();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('[YouTube Summarizer] Background received message:', request);

      // Handle ping immediately without initialization check
      if (request.action === 'ping') {
        console.log('[YouTube Summarizer] Background responding to ping');
        sendResponse('pong');
        return true;
      }

      // For cache-related requests, handle them with special care
      if (request.action === 'getCachedSummary') {
        this.handleCacheRequest(request, sendResponse);
        return true;
      }

      // For all other requests, ensure initialization
      this.initialize().then(() => {
        this.handleMessage(request, sender)
          .then(response => {
            console.log('[YouTube Summarizer] Background sending response:', response);
            try {
              sendResponse(response);
            } catch (error) {
              console.error('[YouTube Summarizer] Error sending response:', error);
            }
          })
          .catch(error => {
            console.error('[YouTube Summarizer] Background error handling message:', error);
            try {
              sendResponse({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            } catch (sendError) {
              console.error('[YouTube Summarizer] Error sending error response:', sendError);
            }
          });
      });

      return true; // Will respond asynchronously
    });
  }

  private async handleCacheRequest(request: any, sendResponse: (response: any) => void) {
    try {
      console.log('[YouTube Summarizer] Handling cache request for video:', request.videoId);
      
      // Ensure cache service is available
      if (!this.cache) {
        throw new Error('Cache service not initialized');
      }

      const summary = await this.cache.getSummary(request.videoId);
      console.log('[YouTube Summarizer] Cache response:', summary ? 'Hit' : 'Miss');
      
      sendResponse({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('[YouTube Summarizer] Cache request error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cached summary'
      });
    }
  }

  private async initialize() {
    if (this.isInitialized) return;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        // Initialize Gemini service
        await this.initializeGemini();

        // Initialize tab listeners
        this.initializeTabListeners();

        // Schedule cleanup
        this.scheduleCleanup();

        // Set up navigation listeners
        this.setupNavigationListeners();

        this.isInitialized = true;
        console.log('[YouTube Summarizer] Background service initialized');
      } catch (error) {
        console.error('[YouTube Summarizer] Background service initialization error:', error);
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  private setupNavigationListeners() {
    // Listen for navigation events
    chrome.webNavigation?.onCommitted.addListener((details) => {
      if (details.frameId === 0 && details.url.includes('youtube.com')) {
        this.injectedTabs.delete(details.tabId);
        this.ensureContentScript(details.tabId);
      }
    });

    // Listen for tab activation
    chrome.tabs.onActivated.addListener(async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url?.includes('youtube.com')) {
          await this.ensureContentScript(activeInfo.tabId);
        }
      } catch (error) {
        console.error('[YouTube Summarizer] Error handling tab activation:', error);
      }
    });
  }

  private initializeTabListeners() {
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (tab.url?.includes('youtube.com')) {
        // Try to inject on any status change
        this.ensureContentScript(tabId);
        
        // Also inject when the page is fully loaded
        if (changeInfo.status === 'complete') {
          setTimeout(() => this.ensureContentScript(tabId), 1000);
        }
      }
    });

    // Listen for tab removal
    chrome.tabs.onRemoved.addListener((tabId: number) => {
      this.contentScriptStatus.delete(tabId);
      this.initializationRetries.delete(tabId);
      this.injectedTabs.delete(tabId);
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async ensureContentScript(tabId: number): Promise<boolean> {
    try {
      // Check if content script is already injected and responsive
      try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (response?.pong) {
          console.log(`[YouTube Summarizer] Content script already active in tab ${tabId}`);
          return true;
        }
      } catch (error) {
        console.log(`[YouTube Summarizer] Content script not responsive in tab ${tabId}, will inject`);
      }

      // Get tab info to verify it's still a YouTube tab
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url?.includes('youtube.com')) {
        console.log(`[YouTube Summarizer] Tab ${tabId} is no longer a YouTube tab`);
        return false;
      }

      // Remove any existing content script status
      this.injectedTabs.delete(tabId);
      this.contentScriptStatus.delete(tabId);

      // Inject the content script
      console.log(`[YouTube Summarizer] Injecting content script into tab ${tabId}`);
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });

      // Wait for script to initialize
      await this.delay(1000);

      // Verify injection with retries
      for (let i = 0; i < 5; i++) {
        try {
          console.log(`[YouTube Summarizer] Verifying content script (attempt ${i + 1}/5)`);
          const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
          if (response?.pong) {
            console.log(`[YouTube Summarizer] Content script verified in tab ${tabId}`);
            this.injectedTabs.add(tabId);
            this.contentScriptStatus.set(tabId, true);
            return true;
          }
          await this.delay(1000);
        } catch (error) {
          console.log(`[YouTube Summarizer] Verification attempt ${i + 1} failed:`, error);
          await this.delay(1000);
        }
      }

      throw new Error('Content script verification failed after multiple attempts');
    } catch (error) {
      console.error(`[YouTube Summarizer] Error ensuring content script for tab ${tabId}:`, error);
      return false;
    }
  }

  private async verifyContentScript(tabId: number): Promise<boolean> {
    try {
      // Try to ping existing content script
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response?.pong) {
        console.log(`[YouTube Summarizer] Content script verified in tab ${tabId}`);
        return true;
      }
    } catch (error) {
      console.log(`[YouTube Summarizer] Content script verification failed:`, error);
    }

    // If verification fails, try to inject
    return this.ensureContentScript(tabId);
  }

  private async injectContentScript(tabId: number): Promise<boolean> {
    try {
      if (this.injectedTabs.has(tabId)) {
        return true;
      }

      console.log(`[YouTube Summarizer] Injecting content script into tab ${tabId}`);
      
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });

      this.injectedTabs.add(tabId);
      return true;
    } catch (error) {
      console.error(`[YouTube Summarizer] Failed to inject content script into tab ${tabId}:`, error);
      return false;
    }
  }

  private async initializeGemini() {
    try {
      // Clear any stored model to force re-selection
      await chrome.storage.sync.remove('geminiModel');
      
      const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
      if (geminiApiKey) {
        await this.gemini.initialize(geminiApiKey);
        console.log('[YouTube Summarizer] Gemini service initialized with stored API key');
      } else {
        console.log('[YouTube Summarizer] No stored Gemini API key found');
      }
    } catch (error) {
      console.error('[YouTube Summarizer] Failed to initialize Gemini service:', error);
    }
  }

  private async handleMessage(
    request: any,
    sender: chrome.runtime.MessageSender
  ): Promise<APIResponse<any>> {
    console.log('[YouTube Summarizer] Background handling message:', request);
    
    try {
      switch (request.action) {
        case 'verifyContentScript':
          if (!request.tabId) throw new Error('No tab ID provided');
          const isReady = await this.ensureContentScript(request.tabId);
          return {
            success: true,
            data: { isReady }
          };

        case 'setApiKey':
          return await this.handleSetApiKey(request.apiKey);

        case 'summarizeVideo':
          return await this.handleSummarizeVideo(
            request.videoId,
            request.transcript,
            request.options
          );

        case 'getCachedSummary':
          return await this.handleGetCachedSummary(request.videoId);

        case 'getVideoMetadata':
          return await this.handleGetVideoMetadata(request.videoId);

        case 'exportSummary':
          return await this.handleExportSummary(
            request.summary,
            request.format
          );

        default:
          throw new Error(`Unknown action: ${request.action}`);
      }
    } catch (error) {
      console.error('[YouTube Summarizer] Error in background handler:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async handleSetApiKey(apiKey: string): Promise<APIResponse<void>> {
    try {
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      await this.gemini.initialize(apiKey);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set API key'
      };
    }
  }

  private async handleSummarizeVideo(
    videoId: string,
    transcript: string,
    options: SummaryOptions
  ): Promise<APIResponse<Summary>> {
    try {
      const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
      if (!geminiApiKey) {
        throw new Error('Please set your Gemini API key in the extension settings');
      }

      // Check if video is already being processed
      if (this.processingVideos.has(videoId)) {
        return {
          success: false,
          error: 'Video is already being processed'
        };
      }

      // Check cache first
      const cachedSummary = await this.cache.getSummary(videoId);
      if (cachedSummary) {
        return {
          success: true,
          data: cachedSummary
        };
      }

      // Mark video as being processed
      this.processingVideos.add(videoId);

      try {
        // Generate summary using Gemini
        const result = await this.gemini.summarize(videoId, transcript, options);

        // If successful, cache the result
        if (result.success && result.data) {
          await this.cache.setSummary(videoId, result.data);
        }

        return result;
      } finally {
        // Always remove from processing set
        this.processingVideos.delete(videoId);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to summarize video'
      };
    }
  }

  private async handleGetCachedSummary(
    videoId: string
  ): Promise<APIResponse<Summary | null>> {
    try {
      const summary = await this.cache.getSummary(videoId);
      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get cached summary'
      };
    }
  }

  private async handleGetVideoMetadata(
    videoId: string
  ): Promise<APIResponse<VideoMetadata>> {
    try {
      // Query active tab for video information
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Get metadata from content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getVideoMetadata',
        videoId
      });

      // Add tabId to metadata
      const metadata = {
        ...response.data,
        tabId: tab.id
      };

      return {
        success: true,
        data: metadata
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get video metadata'
      };
    }
  }

  private async handleExportSummary(
    summary: Summary,
    format: string
  ): Promise<APIResponse<string>> {
    try {
      const exportedContent = format === 'markdown' 
        ? this.exportAsMarkdown(summary)
        : this.exportAsText(summary);

      return {
        success: true,
        data: exportedContent
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export summary'
      };
    }
  }

  private scheduleCleanup() {
    // Clean up old cache entries periodically
    setInterval(() => {
      this.cache.cleanup().catch(console.error);
    }, 24 * 60 * 60 * 1000); // Once per day
  }

  private exportAsText(summary: Summary): string {
    return `
Video Summary
Title: ${summary.videoId}
Generated: ${new Date(summary.timestamp).toLocaleString()}

Key Points:
${summary.keyPoints.map(point => `• ${point}`).join('\n')}

Topics: ${summary.topics.join(', ')}

Full Summary:
${summary.content}
    `.trim();
  }

  private exportAsMarkdown(summary: Summary): string {
    return `
# Video Summary

## Metadata
- **Video ID**: ${summary.videoId}
- **Generated**: ${new Date(summary.timestamp).toLocaleString()}

## Key Points
${summary.keyPoints.map(point => `* ${point}`).join('\n')}

## Topics
${summary.topics.map(topic => `\`${topic}\``).join(' ')}

## Full Summary
${summary.content}
    `.trim();
  }
}

// Create and export a single instance
const backgroundService = new BackgroundService();
export default backgroundService; 