import React, { useEffect, useState } from 'react';
import { Summary, VideoMetadata, SummaryOptions } from '../../types';
import { LoadingSpinner } from '../Common/LoadingSpinner';
import { ErrorMessage } from '../Common/ErrorMessage';
import { SummaryView } from './SummaryView';
import { OptionsPanel } from './OptionsPanel';
import { ApiKeyInput } from '../ApiKeyInput/ApiKeyInput';
import './Popup.css';

console.log('[YouTube Summarizer] Popup component loaded');

const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;
const INJECTION_TIMEOUT = 2000;

export const Popup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [options, setOptions] = useState<SummaryOptions>({
    style: 'bullet',
    length: 'medium',
    language: 'en',
    includeTags: true,
    includeTimestamps: true
  });

  useEffect(() => {
    console.log('[YouTube Summarizer] Popup mounted, checking current video');
    checkCurrentVideo();
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
      setHasApiKey(!!geminiApiKey);
    } catch (error) {
      console.error('[YouTube Summarizer] Error checking API key:', error);
      setHasApiKey(false);
    }
  };

  const handleApiKeySet = () => {
    setHasApiKey(true);
    setError(null);
  };

  // Helper function to delay execution
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper function to check if a tab is a YouTube video page
  const isYouTubeVideoPage = (url: string | undefined): boolean => {
    return !!url && url.includes('youtube.com/watch');
  };

  // Function to inject content script with timeout
  const injectContentScript = async (tabId: number): Promise<boolean> => {
    try {
      console.log('[YouTube Summarizer] Injecting content script...');
      const injectionPromise = chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });

      // Add timeout to injection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Content script injection timed out')), INJECTION_TIMEOUT);
      });

      await Promise.race([injectionPromise, timeoutPromise]);
      console.log('[YouTube Summarizer] Content script injected successfully');
      return true;
    } catch (error) {
      console.error('[YouTube Summarizer] Content script injection failed:', error);
      return false;
    }
  };

  // Function to verify content script is responsive
  const verifyContentScript = async (tabId: number, maxRetries = 5): Promise<boolean> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[YouTube Summarizer] Verifying content script (attempt ${attempt + 1}/${maxRetries})`);

        // First try direct communication
        try {
          const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
          if (response === 'pong') {
            console.log('[YouTube Summarizer] Content script responded directly');
            return true;
          }
        } catch (error) {
          console.log('[YouTube Summarizer] Direct communication failed, attempting injection');
          
          // Try to inject the content script
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content.js']
            });
            console.log('[YouTube Summarizer] Content script injected, waiting for initialization');
            await delay(500); // Wait for script to initialize
            
            // Try direct communication again after injection
            const retryResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            if (retryResponse === 'pong') {
              console.log('[YouTube Summarizer] Content script responsive after injection');
              return true;
            }
          } catch (injectionError) {
            console.error('[YouTube Summarizer] Injection failed:', injectionError);
          }
        }

        // If both direct communication and injection fail, try through background
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'verifyContentScript',
            tabId
          });

          if (response?.success && response?.data?.isReady) {
            console.log('[YouTube Summarizer] Content script verified through background');
            return true;
          }
        } catch (backgroundError) {
          console.error('[YouTube Summarizer] Background verification failed:', backgroundError);
        }

        if (attempt < maxRetries - 1) {
          console.log(`[YouTube Summarizer] Verification attempt ${attempt + 1} failed, waiting before retry`);
          await delay(RETRY_DELAY);
        }
      } catch (error) {
        console.error(`[YouTube Summarizer] Error during verification attempt ${attempt + 1}:`, error);
        
        if (attempt === maxRetries - 1) {
          throw new Error('Could not establish connection with content script. Please refresh the page and try again.');
        }
        
        await delay(RETRY_DELAY);
      }
    }

    return false;
  };

  // Function to ensure content script is ready with retries
  const ensureContentScript = async (tabId: number): Promise<boolean> => {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      console.log(`[YouTube Summarizer] Attempt ${attempt + 1}/${MAX_RETRIES} to ensure content script`);
      
      // First check if content script is already responsive
      if (await verifyContentScript(tabId)) {
        console.log('[YouTube Summarizer] Content script is responsive');
        return true;
      }

      // If not responsive, try to inject it
      console.log('[YouTube Summarizer] Content script not responsive, attempting injection');
      await injectContentScript(tabId);
      
      // Wait a bit for the script to initialize
      await delay(RETRY_DELAY);
      
      // Verify again after injection
      if (await verifyContentScript(tabId)) {
        console.log('[YouTube Summarizer] Content script is now responsive after injection');
        return true;
      }

      // If still not responsive, wait before next retry
      if (attempt < MAX_RETRIES - 1) {
        console.log(`[YouTube Summarizer] Waiting ${RETRY_DELAY}ms before next attempt`);
        await delay(RETRY_DELAY);
      }
    }

    return false;
  };

  const checkCurrentVideo = async () => {
    try {
      setMetadataLoading(true);
      setError(null);

      console.log('[YouTube Summarizer] Querying active tab');
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      console.log('[YouTube Summarizer] Active tab:', tab);

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      if (!isYouTubeVideoPage(tab.url)) {
        throw new Error('Please navigate to a YouTube video page');
      }

      // Try to verify content script with retries
      console.log('[YouTube Summarizer] Starting content script verification');
      const isReady = await verifyContentScript(tab.id);

      if (!isReady) {
        throw new Error('Failed to initialize content script. Please refresh the page and try again.');
      }

      // Now that we know the content script is ready, get the metadata
      console.log('[YouTube Summarizer] Content script verified, requesting metadata');
      const metadata = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoMetadata' });

      if (!metadata?.success) {
        throw new Error(metadata?.error || 'Failed to load video information');
      }

      setMetadata(metadata.data);
      console.log('[YouTube Summarizer] Set metadata:', metadata.data);

      // Check for cached summary
      console.log('[YouTube Summarizer] Checking for cached summary');
      const cachedResponse = await chrome.runtime.sendMessage({
        action: 'getCachedSummary',
        videoId: metadata.data.videoId
      });

      console.log('[YouTube Summarizer] Cache response:', cachedResponse);

      if (cachedResponse.success && cachedResponse.data) {
        setSummary(cachedResponse.data);
        console.log('[YouTube Summarizer] Set cached summary:', cachedResponse.data);
      }
    } catch (error) {
      console.error('[YouTube Summarizer] Error checking video:', error);
      setError(error instanceof Error ? error.message : 'Failed to load video information');
      setMetadata(null);
    } finally {
      setMetadataLoading(false);
      console.log('[YouTube Summarizer] Finished checking video');
    }
  };

  const handleSummarize = async () => {
    if (!metadata?.videoId) {
      setError('No video selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      // Check API key
      const { geminiApiKey } = await chrome.storage.sync.get('geminiApiKey');
      if (!geminiApiKey) {
        throw new Error('Please set your Gemini API key first');
      }

      // Get transcript
      console.log('[YouTube Summarizer] Requesting transcript');
      const transcriptResponse = await chrome.tabs.sendMessage(
        tab.id,
        { action: 'getTranscript' }
      );

      if (!transcriptResponse?.success) {
        throw new Error(transcriptResponse?.error || 'Failed to get transcript');
      }

      // Request summary generation
      console.log('[YouTube Summarizer] Requesting summary generation');
      const response = await chrome.runtime.sendMessage({
        action: 'summarizeVideo',
        videoId: metadata.videoId,
        transcript: transcriptResponse.data,
        options
      });

      console.log('[YouTube Summarizer] Summary response:', response);

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate summary');
      }

      setSummary(response.data);
      console.log('[YouTube Summarizer] Set summary:', response.data);
    } catch (error) {
      console.error('[YouTube Summarizer] Summarization error:', error);
      setError(error instanceof Error ? error.message : 'Failed to summarize video');
    } finally {
      setLoading(false);
      console.log('[YouTube Summarizer] Finished summarization attempt');
    }
  };

  const handleExport = async (format: string) => {
    if (!summary) {
      setError('No summary to export');
      return;
    }

    console.log('[YouTube Summarizer] Starting export:', format);
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'exportSummary',
        summary,
        format
      });

      console.log('[YouTube Summarizer] Export response:', response);

      if (!response.success) {
        throw new Error(response.error);
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(response.data);
      console.log('[YouTube Summarizer] Copied to clipboard');
      
      // Show success message
      const successMessage = document.createElement('div');
      successMessage.className = 'success-message';
      successMessage.textContent = 'Copied to clipboard!';
      document.body.appendChild(successMessage);
      
      setTimeout(() => {
        document.body.removeChild(successMessage);
      }, 2000);
    } catch (error) {
      console.error('[YouTube Summarizer] Export error:', error);
      setError(error instanceof Error ? error.message : 'Failed to export summary');
    }
  };

  const handleRetry = () => {
    console.log('[YouTube Summarizer] Retrying video check');
    setError(null);
    checkCurrentVideo();
  };

  if (!hasApiKey) {
    return <ApiKeyInput onValidKey={checkApiKey} />;
  }

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>YouTube Summarizer</h1>
        {metadata && (
          <div className="video-info">
            <h2>{metadata.title}</h2>
            <p>{metadata.channelName}</p>
            <p className="duration">{metadata.duration}</p>
          </div>
        )}
      </header>

      <main className="popup-content">
        {error ? (
          <div className="error-container">
            <ErrorMessage message={error} />
            <button className="retry-button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        ) : metadataLoading ? (
          <LoadingSpinner message="Loading video information..." />
        ) : loading ? (
          <LoadingSpinner message="Generating summary..." />
        ) : summary ? (
          <SummaryView
            summary={summary}
            onExport={handleExport}
          />
        ) : (
          <div className="start-panel">
            <OptionsPanel
              options={options}
              onChange={setOptions}
            />
            <button
              className="summarize-button"
              onClick={handleSummarize}
              disabled={!metadata?.videoId || loading}
            >
              Summarize Video
            </button>
          </div>
        )}
      </main>

      <footer className="popup-footer">
        <button
          className="reset-button"
          onClick={() => {
            console.log('[YouTube Summarizer] Resetting for new summary');
            setSummary(null);
            setError(null);
            checkCurrentVideo();
          }}
          disabled={loading || metadataLoading}
        >
          New Summary
        </button>
      </footer>
    </div>
  );
}; 