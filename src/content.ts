export {};

// Declare our custom window property
declare global {
  interface Window {
    youTubeSummarizerLoaded?: boolean;
  }
}

// Add initialization state tracking
let initializationPromise: Promise<void> | null = null;
let isInitialized = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;
const INIT_RETRY_DELAY = 1000;

// Add message listener for ping immediately, before anything else
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[YouTube Summarizer] Content script received message:', request);

  if (request.action === 'ping') {
    console.log('[YouTube Summarizer] Responding to ping with initialization status');
    sendResponse({ pong: true, initialized: isInitialized });
    return true;
  }

  // For non-ping messages, ensure initialization
  if (!isInitialized) {
    console.log('[YouTube Summarizer] Content script not initialized yet, initializing...');
    initializeContentScript()
      .then(() => {
        // Handle the message after initialization
        handleMessage(request, sender, sendResponse);
      })
      .catch(error => {
        console.error('[YouTube Summarizer] Initialization error:', error);
        sendResponse({ success: false, error: 'Content script initialization failed: ' + error.message });
      });
    return true;
  }

  // Handle other messages
  handleMessage(request, sender, sendResponse);
  return true;
});

console.log('[YouTube Summarizer] Content script loaded and message listener registered');

// Function to initialize content script with retries
async function initializeContentScript(): Promise<void> {
  if (isInitialized) {
    return Promise.resolve();
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise<void>((resolve, reject) => {
    const attemptInit = async () => {
      try {
        if (initializationAttempts >= MAX_INIT_ATTEMPTS) {
          throw new Error(`Failed to initialize after ${MAX_INIT_ATTEMPTS} attempts`);
        }

        initializationAttempts++;
        console.log(`[YouTube Summarizer] Initialization attempt ${initializationAttempts}/${MAX_INIT_ATTEMPTS}`);

        // Check if we're on a YouTube video page
        if (!window.location.href.includes('youtube.com/watch')) {
          console.log('[YouTube Summarizer] Not on a YouTube video page, deferring initialization');
          await new Promise(r => setTimeout(r, INIT_RETRY_DELAY));
          attemptInit();
          return;
        }

        // Wait for essential elements
        const videoPlayer = document.querySelector('.html5-video-player');
        const videoElement = document.querySelector('video');

        if (!videoPlayer || !videoElement) {
          console.log('[YouTube Summarizer] Video elements not found, retrying...');
          await new Promise(r => setTimeout(r, INIT_RETRY_DELAY));
          attemptInit();
          return;
        }

        // Set initialization flags
        window.youTubeSummarizerLoaded = true;
        isInitialized = true;
        
        console.log('[YouTube Summarizer] Content script successfully initialized');
        resolve();
      } catch (error) {
        console.error('[YouTube Summarizer] Initialization error:', error);
        reject(error);
      }
    };

    attemptInit();
  });

  return initializationPromise;
}

// Initialize immediately
initializeContentScript().catch(error => {
  console.error('[YouTube Summarizer] Initialization error:', error);
});

// Function to extract video metadata with retries
function extractVideoMetadata(maxRetries = 10, retryDelay = 500): Promise<any> {
  return new Promise((resolve, reject) => {
    let retryCount = 0;

    const tryExtract = () => {
      console.log(`[YouTube Summarizer] Attempting to extract metadata (attempt ${retryCount + 1}/${maxRetries})`);

      // Extract video ID from URL
      const videoId = new URLSearchParams(window.location.search).get('v');
      if (!videoId) {
        console.error('[YouTube Summarizer] No video ID found in URL');
        reject(new Error('No video ID found'));
        return;
      }

      console.log(`[YouTube Summarizer] Found video ID: ${videoId}`);

      // Try to get elements
      const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim();
      const channelName = document.querySelector('ytd-channel-name yt-formatted-string')?.textContent?.trim();
      const duration = document.querySelector('.ytp-time-duration')?.textContent?.trim();

      console.log('[YouTube Summarizer] Element search results:', {
        title: title || 'Not found',
        channelName: channelName || 'Not found',
        duration: duration || 'Not found'
      });

      // If we have all elements, resolve
      if (title && channelName && duration) {
        const metadata = {
          success: true,
          data: { videoId, title, channelName, duration }
        };
        console.log('[YouTube Summarizer] Successfully extracted metadata:', metadata);
        resolve(metadata);
        return;
      }

      // If we've hit max retries, reject
      if (retryCount >= maxRetries) {
        const error = 'Failed to find video elements after maximum retries';
        console.error('[YouTube Summarizer]', error);
        reject(new Error(error));
        return;
      }

      // Otherwise retry after delay
      retryCount++;
      console.log(`[YouTube Summarizer] Retrying in ${retryDelay}ms...`);
      setTimeout(tryExtract, retryDelay);
    };

    // Start the extraction process
    tryExtract();
  });
}

// Function to extract video transcript
async function extractTranscript(): Promise<string> {
  console.log('[YouTube Summarizer] Starting transcript extraction');

  try {
    // First check if we're actually on a video page
    if (!window.location.pathname.includes('/watch')) {
      throw new Error('Not on a YouTube video page');
    }

    // Wait for video player to be ready
    const waitForVideoPlayer = async (maxAttempts = 10): Promise<void> => {
      for (let i = 0; i < maxAttempts; i++) {
        const player = document.querySelector('.html5-video-player');
        const videoElement = document.querySelector('video');
        const videoLoaded = videoElement && videoElement.readyState >= 2;
        const playerControls = document.querySelector('.ytp-chrome-bottom');
        
        if (player && videoLoaded && playerControls) {
          console.log('[YouTube Summarizer] Video player is ready');
          return;
        }
        
        console.log(`[YouTube Summarizer] Waiting for video player (attempt ${i + 1}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw new Error('Video player not ready after maximum attempts');
    };

    await waitForVideoPlayer();

    // Try multiple methods to find and open the transcript
    let transcriptContainer = null;
    
    // Method 1: Check if transcript is already open
    console.log('[YouTube Summarizer] Checking if transcript is already open');
    transcriptContainer = document.querySelector([
      'ytd-transcript-body-renderer',
      'ytd-transcript-search-panel-renderer',
      '#segments-container',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
      '[target-id="engagement-panel-searchable-transcript"]',
      // New UI selectors
      'ytd-engagement-panel-section-list-renderer[data-panel-identifier="transcript"]',
      '[data-panel-identifier="transcript"]',
      // Additional panel selectors
      'ytd-transcript-renderer',
      '#secondary-inner #panels'
    ].join(','));

    if (!transcriptContainer) {
      // Method 2: Look for the transcript button in various locations
      console.log('[YouTube Summarizer] Looking for transcript button');
      
      // First check if video has captions available
      const captionsButton = document.querySelector('.ytp-subtitles-button[aria-pressed]');
      const hasCaptions = !!captionsButton;
      const isAutoGenerated = document.querySelector('.ytp-subtitles-button[aria-pressed="true"]')?.getAttribute('data-title')?.toLowerCase().includes('auto-generated');
      
      if (!hasCaptions) {
        console.log('[YouTube Summarizer] No captions button found - video might not have transcripts');
      } else if (isAutoGenerated) {
        console.log('[YouTube Summarizer] Video has auto-generated captions');
      }

      // Function to ensure menu panels are expanded
      const expandMenuPanels = async () => {
        const expandButtons = Array.from(document.querySelectorAll([
          'button.yt-formatted-string',
          'tp-yt-paper-button',
          'button.yt-spec-button-shape-next',
          '#expand',
          '#expand-button',
          '#show-more-button',
          '[aria-label="Show more"]',
          '[aria-label="More"]'
        ].join(',')))
        .filter(button => {
          const text = button.textContent?.toLowerCase() || '';
          const label = button.getAttribute('aria-label')?.toLowerCase() || '';
          return text.includes('show more') || 
                 text.includes('expand') || 
                 label.includes('show more') || 
                 label.includes('expand');
        });

        for (const button of expandButtons) {
          console.log('[YouTube Summarizer] Expanding menu panel');
          (button as HTMLElement).click();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      };

      await expandMenuPanels();

      // Try to find transcript in engagement panels first
      console.log('[YouTube Summarizer] Checking engagement panels');
      const engagementPanels = document.querySelectorAll([
        'ytd-engagement-panel-section-list-renderer',
        '#panels ytd-engagement-panel-section-list-renderer',
        '#secondary-inner #panels'
      ].join(','));

      for (const panel of Array.from(engagementPanels)) {
        const panelTitle = panel.querySelector('#title')?.textContent?.toLowerCase() || '';
        if (panelTitle.includes('transcript')) {
          console.log('[YouTube Summarizer] Found transcript panel');
          transcriptContainer = panel;
          break;
        }
      }

      if (!transcriptContainer) {
        // Collect all possible buttons and menu items
        const possibleElements = [
          // Direct transcript buttons
          ...Array.from(document.querySelectorAll([
            'button.yt-spec-button-shape-next',
            'button.ytp-button',
            'ytd-button-renderer button',
            'tp-yt-paper-item',
            'ytd-menu-service-item-renderer',
            '[role="menuitem"]',
            'button[aria-label*="transcript" i]',
            'ytd-menu-service-item-renderer[has-separator]',
            '.ytd-menu-popup-renderer button',
            'ytd-menu-service-item-renderer #button',
            // New UI selectors
            '#button-shape button',
            '#button-container button',
            '#top-level-buttons-computed button'
          ].join(','))),
          
          // More actions buttons
          ...Array.from(document.querySelectorAll([
            'button[aria-label="More actions"]',
            'button[aria-label="More"]',
            'ytd-menu-renderer button',
            'yt-icon-button.dropdown-trigger',
            '.ytp-more-button',
            'button.yt-spec-button-shape-next[aria-label="More"]',
            '[aria-label*="More"] button',
            'button.yt-spec-button-shape-next[aria-label*="menu"]',
            'ytd-menu-renderer #button',
            'ytd-button-renderer[has-no-text]',
            'button[aria-label*="actions" i]',
            'button[aria-label*="menu" i]',
            // New UI selectors
            '#actions-inner button',
            '#actions button',
            '#top-level-buttons-computed button'
          ].join(',')))
        ];

        // Function to check if an element is related to transcript
        const isTranscriptElement = (element: Element): boolean => {
          const text = element.textContent?.toLowerCase() || '';
          const label = element.getAttribute('aria-label')?.toLowerCase() || '';
          const title = element.getAttribute('title')?.toLowerCase() || '';
          const hasTranscript = text.includes('transcript') || 
                               label.includes('transcript') || 
                               title.includes('transcript');
          const hasShow = text.includes('show') || label.includes('show');
          const isVisible = (element as HTMLElement).offsetParent !== null;
          return isVisible && (hasTranscript || (hasShow && hasCaptions));
        };

        // Try to find and click transcript button directly
        console.log('[YouTube Summarizer] Searching through', possibleElements.length, 'possible elements');
        const transcriptButton = possibleElements.find(isTranscriptElement);

        if (transcriptButton) {
          console.log('[YouTube Summarizer] Found direct transcript button');
          (transcriptButton as HTMLElement).click();
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // If no direct transcript button, try each "more" button
          console.log('[YouTube Summarizer] No direct transcript button found, trying menu buttons');
          const menuButtons = possibleElements.filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const label = el.getAttribute('aria-label')?.toLowerCase() || '';
            const isVisible = (el as HTMLElement).offsetParent !== null;
            return isVisible && (
              text.includes('...') || 
              text.includes('more') || 
              label.includes('more') ||
              label.includes('menu') ||
              label.includes('additional') ||
              label.includes('action')
            );
          });

          if (menuButtons.length === 0) {
            throw new Error(`Could not find any menu buttons to access transcript. ${!hasCaptions ? 'This video appears to have no captions available.' : 'Try refreshing the page if you know the video has captions.'}`);
          }

          // Try each menu button
          let foundTranscript = false;
          for (const button of menuButtons) {
            if (foundTranscript) break;
            
            const buttonText = button.textContent || button.getAttribute('aria-label') || 'unknown';
            console.log('[YouTube Summarizer] Trying menu button:', buttonText);
            
            try {
              (button as HTMLElement).click();
              await new Promise(resolve => setTimeout(resolve, 1000));

              // Look for transcript option in newly opened menus
              const menuItems = document.querySelectorAll([
                'tp-yt-paper-item',
                '.ytp-menuitem',
                '.yt-spec-button-shape-next',
                'ytd-menu-service-item-renderer',
                '[role="menuitem"]',
                'ytd-menu-service-item-renderer #button',
                '.ytd-menu-popup-renderer button',
                // New UI selectors
                '#items ytd-menu-service-item-renderer',
                '#contentWrapper ytd-menu-service-item-renderer'
              ].join(','));

              const transcriptMenuItem = Array.from(menuItems).find(isTranscriptElement);

              if (transcriptMenuItem) {
                console.log('[YouTube Summarizer] Found transcript in menu');
                (transcriptMenuItem as HTMLElement).click();
                foundTranscript = true;
                await new Promise(resolve => setTimeout(resolve, 1500));
              } else {
                // Close menu if we didn't find transcript option
                document.body.click();
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (err) {
              console.log(`[YouTube Summarizer] Error trying menu button ${buttonText}:`, err);
              // Continue to next button
            }
          }

          if (!foundTranscript) {
            const errorMsg = !hasCaptions 
              ? 'Could not find transcript option in any menu. This video appears to have no captions available.'
              : 'Could not find transcript option in any menu. Try refreshing the page if you know the video has captions.';
            throw new Error(errorMsg);
          }
        }
      }
    }

    // Wait for transcript panel to load with retries
    let retryCount = 0;
    const maxRetries = 12;
    
    while (!transcriptContainer && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      transcriptContainer = document.querySelector([
        'ytd-transcript-body-renderer',
        'ytd-transcript-search-panel-renderer',
        '#segments-container',
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
        '[target-id="engagement-panel-searchable-transcript"]'
      ].join(','));

      if (!transcriptContainer) {
        console.log(`[YouTube Summarizer] Retry ${retryCount + 1}/${maxRetries} finding transcript container`);
        retryCount++;
      }
    }

    if (!transcriptContainer) {
      throw new Error('Could not find transcript container after multiple attempts. This video might not have a transcript available.');
    }

    // Log the structure of the transcript container to help debug
    console.log('[YouTube Summarizer] Transcript container found:', {
      id: transcriptContainer.id,
      className: transcriptContainer.className,
      childCount: transcriptContainer.children.length
    });

    // Sometimes the transcript is in an iframe or needs to be expanded
    const expandTranscript = async () => {
      // Try to expand any collapsed sections
      const expandButtons = transcriptContainer.querySelectorAll([
        'button[aria-label*="expand" i]',
        'button[aria-label*="show" i]',
        'button.yt-formatted-string',
        '#expand-button',
        '[aria-label="Show transcript"]'
      ].join(','));

      for (const button of Array.from(expandButtons)) {
        console.log('[YouTube Summarizer] Found expand button in transcript:', button.textContent);
        (button as HTMLElement).click();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };

    await expandTranscript();

    // Get all transcript segments with expanded selectors
    const segmentSelectors = [
      // Standard segment selectors
      'ytd-transcript-segment-renderer',
      'ytd-transcript-segment',
      '.segment-container',
      '.ytd-transcript-segment-list-renderer',
      '.cue-group',
      '.cue',
      // New UI selectors
      'ytd-transcript-segment-list-renderer > div',
      '.ytd-transcript-segment-list-renderer > div',
      // Generic transcript text containers
      '[class*="transcript-segment"]',
      '[class*="transcript-text"]',
      '[class*="transcript-cue"]',
      // Specific YouTube selectors
      'ytd-transcript-body-renderer ytd-transcript-segment-list-renderer > div',
      '.ytd-transcript-body-renderer div[class*="segment"]',
      // Panel specific selectors
      'ytd-engagement-panel-section-list-renderer [class*="segment"]',
      'ytd-engagement-panel-section-list-renderer [class*="cue"]'
    ].join(',');

    // Wait a bit more for segments to load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to find segments in the main container and any nested containers
    const findSegments = (container: Element): Element[] => {
      const directSegments = Array.from(container.querySelectorAll(segmentSelectors));
      console.log(`[YouTube Summarizer] Found ${directSegments.length} direct segments`);
      
      // If no direct segments, try to find nested transcript containers
      if (directSegments.length === 0) {
        const nestedContainers = container.querySelectorAll([
          'ytd-transcript-search-panel-renderer',
          'ytd-transcript-body-renderer',
          'ytd-transcript-segment-list-renderer',
          '[class*="transcript-container"]'
        ].join(','));
        
        console.log(`[YouTube Summarizer] Looking in ${nestedContainers.length} nested containers`);
        
        for (const nestedContainer of Array.from(nestedContainers)) {
          const nestedSegments = Array.from(nestedContainer.querySelectorAll(segmentSelectors));
          if (nestedSegments.length > 0) {
            console.log(`[YouTube Summarizer] Found ${nestedSegments.length} segments in nested container`);
            return nestedSegments;
          }
        }
      }
      
      return directSegments;
    };

    const segments = findSegments(transcriptContainer);
    console.log(`[YouTube Summarizer] Found ${segments.length} total transcript segments`);

    if (segments.length === 0) {
      // Try one more time with a longer wait
      console.log('[YouTube Summarizer] No segments found, waiting longer and trying again...');
      await new Promise(resolve => setTimeout(resolve, 2500));
      const retrySegments = findSegments(transcriptContainer);
      
      if (retrySegments.length === 0) {
        // Log the HTML structure to help debug
        console.log('[YouTube Summarizer] Transcript container HTML:', transcriptContainer.innerHTML);
        throw new Error('No transcript segments found. The transcript might not be available for this video.');
      }
    }

    // Extract text and timestamps with improved selectors
    const transcriptSegments = segments.map(segment => {
      // Try multiple possible selectors for timestamp and text
      const timestampSelectors = [
        '.segment-timestamp',
        '.ytd-transcript-segment-timestamp-renderer',
        '.timestamp',
        'div[class*="timestamp"]',
        '.cue-group-timestamp',
        // New selectors
        '[class*="time"]',
        '[class*="timestamp"]',
        'span[class*="segment"] > span:first-child',
        '[class*="timetext"]'
      ].join(',');

      const textSelectors = [
        '.segment-text',
        '.ytd-transcript-segment-text-renderer',
        '.text',
        'div[class*="text"]',
        '.cue-group-text',
        // New selectors
        '[class*="content"]',
        '[class*="caption"]',
        'span[class*="segment"] > span:last-child',
        '[class*="transcripttext"]'
      ].join(',');

      const timestampEl = segment.querySelector(timestampSelectors);
      const textEl = segment.querySelector(textSelectors);

      // If we can't find elements with selectors, try direct text content
      const timestamp = timestampEl?.textContent?.trim() || '';
      let text = textEl?.textContent?.trim() || '';

      // If no text found in nested element, try the segment itself
      if (!text && segment.childNodes.length === 1) {
        text = segment.textContent?.trim() || '';
      }

      if (!text) {
        console.log('[YouTube Summarizer] Failed to extract text from segment:', {
          segmentHTML: segment.innerHTML,
          timestamp,
          foundTimestamp: !!timestampEl,
          foundText: !!textEl
        });
        return null;
      }

      return `[${timestamp}] ${text}`;
    }).filter(Boolean);

    if (transcriptSegments.length === 0) {
      console.log('[YouTube Summarizer] Failed to extract any text from segments. Container HTML:', transcriptContainer.innerHTML);
      throw new Error('Failed to extract transcript text. The transcript might be in an unsupported format.');
    }

    const transcript = transcriptSegments.join('\n');
    console.log('[YouTube Summarizer] Successfully extracted transcript with', transcriptSegments.length, 'segments');
    return transcript;
  } catch (error) {
    console.error('[YouTube Summarizer] Transcript extraction error:', error);
    throw error;
  }
}

// Function to handle messages
function handleMessage(request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) {
  console.log('[YouTube Summarizer] Handling message:', request);

  switch (request.action) {
    case 'getVideoMetadata':
      extractVideoMetadata()
        .then(sendResponse)
        .catch(error => {
          console.error('[YouTube Summarizer] Error extracting metadata:', error);
          sendResponse({ success: false, error: error.message });
        });
      break;

    case 'getTranscript':
      extractTranscript()
        .then(transcript => sendResponse({ success: true, data: transcript }))
        .catch(error => {
          console.error('[YouTube Summarizer] Error extracting transcript:', error);
          sendResponse({ success: false, error: error.message });
        });
      break;

    default:
      console.warn('[YouTube Summarizer] Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
} 