// Import configuration and smart backend detection
importScripts('config.js');

// Inline ID generation functions for service worker compatibility
async function generateSHA256Hash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 12); // Take first 12 characters like backend
}

// Inline exact copy of shared-id-generator functions
function extractSsrnIdFromUrlInline(url) {
  if (!url) return null;
  
  // Prefer query string: abstractId or abstract_id
  let match = url.match(/[?&]abstractId=(\d+)/i);
  if (match) {
    console.debug('Found abstractId in URL:', match[1]);
    return match[1];
  }
  
  match = url.match(/[?&]abstract_id=(\d+)/i);
  if (match) {
    console.debug('Found abstract_id in URL:', match[1]);
    return match[1];
  }
  
  // Handle abstract= in URL (common SSRN format)
  match = url.match(/\/abstract=(\d+)/i);
  if (match) {
    console.debug('Found /abstract= in URL:', match[1]);
    return match[1];
  }
      
  match = url.match(/[?&]abstract=(\d+)/i);
  if (match) {
    console.debug('Found abstract= in URL:', match[1]);
    return match[1];
  }
  
  console.debug('No SSRN ID found in URL, returning null');
  return null;
}

async function generatePaperIdInline(paperContent) {
  console.log('[BACKGROUND generatePaperIdInline] Called with:', paperContent);
  
  // Try to extract SSRN numeric ID first
  if (paperContent.paperUrl) {
    const url = paperContent.paperUrl;
    console.debug('[BACKGROUND] Attempting to extract ID from URL:', url);
    const extractedId = extractSsrnIdFromUrlInline(url);
    console.debug('[BACKGROUND] Extracted ID:', extractedId);
    
    // If we got a numeric ID (SSRN paper), use it
    if (extractedId && /^\d+$/.test(extractedId)) {
      console.log('[BACKGROUND] Using SSRN ID:', extractedId);
      return extractedId;
    }
    
    // If no SSRN ID found (non-SSRN paper), create a hash-based ID from URL
    if (!extractedId) {
      const urlHash = await generateSHA256Hash(url);
      console.debug('[BACKGROUND] Generated hash-based ID for non-SSRN URL:', urlHash);
      return urlHash;
    }
  }

  // Fallback: hash the whole content to guarantee a deterministic ID
  const identifier = JSON.stringify(paperContent, Object.keys(paperContent).sort()).substring(0, 1000);
  const contentHash = await generateSHA256Hash(identifier);
  console.debug('[BACKGROUND] Generated content-based ID:', contentHash);
  return contentHash;
}

async function generateIdFromUrl(url) {
  console.log('[BACKGROUND generateIdFromUrl] Called with URL:', url);
  return await generatePaperIdInline({ paperUrl: url });
}

// =============================================================================
// NEW: Network-Layer PDF Detection
// =============================================================================

const pdfTabs = new Set();

/**
 * Tag a tab as "isPDF" the moment we see a navigation that
 * returns Content-Type: application/pdf  *or*  ends with ".pdf".
 * Works for network & local file:// URLs alike.
 */
chrome.webRequest.onHeadersReceived.addListener(
  details => {
    if (details.type !== 'main_frame') return;

    const ct = details.responseHeaders?.find(
      h => h.name.toLowerCase() === 'content-type'
    )?.value ?? '';

    const isPdf = ct.includes('pdf') || details.url.toLowerCase().endsWith('.pdf');
    
    if (isPdf) {
      console.log('[BG] PDF detected via webRequest:', details.url);
      pdfTabs.add(details.tabId);
      
      // Tell the content script to start collecting
      setTimeout(() => {
        chrome.tabs.sendMessage(details.tabId, {action: 'pdfDetected'}).catch(err => {
          console.log('[BG] Could not notify content script (tab may still be loading):', err.message);
        });
      }, 100); // Small delay to ensure content script is loaded
    }
  },
  {urls: ['<all_urls>'], types: ['main_frame']},
  ['responseHeaders']
);

/** Cleanup on tab close / reload */
chrome.tabs.onRemoved.addListener(tabId => {
  pdfTabs.delete(tabId);
  console.log('[BG] Cleaned up PDF tab on removal:', tabId);
});

chrome.webNavigation.onCommitted.addListener(e => {
  if (e.transitionType === 'reload') {
    pdfTabs.delete(e.tabId);
    console.log('[BG] Cleaned up PDF tab on reload:', e.tabId);
  }
});

// =============================================================================
// Analysis Management (Simplified)
// =============================================================================

// Keep track of active tabs and their states
let activeTabs = new Map();
let analysisInProgress = new Set();
let analysisQueue = [];
let isProcessingQueue = false;

// Analysis monitoring state
let activeMonitors = new Map();
let monitoringIntervals = new Map();

// Persist monitoring state to chrome.storage
async function persistMonitoringState() {
  const monitoringState = {};
  for (const [paperId, monitorInfo] of activeMonitors.entries()) {
    monitoringState[paperId] = {
      paperId: monitorInfo.paperId,
      tabId: monitorInfo.tabId,
      backend: monitorInfo.backend,
      startTime: monitorInfo.startTime,
      lastLogIndex: monitorInfo.lastLogIndex
    };
  }
  
  try {
    await chrome.storage.local.set({ backgroundMonitoring: monitoringState });
    console.log('[BG] Persisted monitoring state for papers:', Object.keys(monitoringState));
  } catch (error) {
    console.error('[BG] Error persisting monitoring state:', error);
  }
}

// Restore monitoring state from chrome.storage
async function restoreMonitoringState() {
  try {
    const result = await chrome.storage.local.get(['backgroundMonitoring']);
    const monitoringState = result.backgroundMonitoring || {};
    
    console.log('[BG] Restoring monitoring state for papers:', Object.keys(monitoringState));
    
    for (const [paperId, monitorInfo] of Object.entries(monitoringState)) {
      // Check if monitoring should still be active (not older than 15 minutes)
      const ageMinutes = (Date.now() - monitorInfo.startTime) / (1000 * 60);
      if (ageMinutes < 15) {
        console.log('[BG] Restoring monitoring for paper:', paperId, 'age:', ageMinutes, 'minutes');
        
        // Restore monitor info
        activeMonitors.set(paperId, monitorInfo);
        
        // Start interval again
        const intervalId = setInterval(async () => {
          console.log('[BG] Restored interval triggered for paper:', paperId);
          await pollAnalysisStatus(paperId);
        }, 2000);
        
        monitoringIntervals.set(paperId, intervalId);
        console.log('[BG] Restored monitoring for paper:', paperId);
      } else {
        console.log('[BG] Skipping stale monitoring for paper:', paperId, 'age:', ageMinutes, 'minutes');
      }
    }
  } catch (error) {
    console.error('[BG] Error restoring monitoring state:', error);
  }
}

// Call restore on startup
console.log('[BG] Service worker starting up, restoring monitoring state...');
restoreMonitoringState();

// Check if this is first install and show onboarding
checkFirstInstall();

// Log configuration on startup
console.log('Background script: Smart backend detection enabled');
console.log('Background script: Available backends:', Object.keys(CONFIG.BACKENDS));
console.log('Background script: Auto-detect enabled:', CONFIG.AUTO_DETECT_BACKENDS);

// Analysis monitoring functions
async function startAnalysisMonitoring(paperId, tabId, backend) {
  console.log('[BG] Starting analysis monitoring for paper:', paperId, 'tab:', tabId);
  console.log('[BG] Backend for monitoring:', backend.name, backend.url);
  
  // Clear any existing monitor for this paper
  stopAnalysisMonitoring(paperId);
  
  const monitorInfo = {
    paperId,
    tabId,
    backend,
    startTime: Date.now(),
    lastLogIndex: -1
  };
  
  activeMonitors.set(paperId, monitorInfo);
  
  // Start polling every 5 seconds
  const intervalId = setInterval(async () => {
    console.log('[BG] Interval triggered for paper:', paperId);
    
    // Double-check we should still be monitoring
    if (!activeMonitors.has(paperId)) {
      console.log('[BG] Stopping orphaned interval for paper:', paperId);
      clearInterval(intervalId);
      monitoringIntervals.delete(paperId);
      return;
    }
    
    await pollAnalysisStatus(paperId);
  }, 5000);
  
  monitoringIntervals.set(paperId, intervalId);
  
  // Set timeout to stop monitoring after 10 minutes
  setTimeout(() => {
    if (activeMonitors.has(paperId)) {
      console.log('[BG] Analysis monitoring timeout for paper:', paperId);
      stopAnalysisMonitoring(paperId);
    }
  }, 10 * 60 * 1000);
  
  // Persist the new monitoring state
  await persistMonitoringState();
}

async function stopAnalysisMonitoring(paperId) {
  console.log('[BG] Stopping analysis monitoring for paper:', paperId);
  
  const intervalId = monitoringIntervals.get(paperId);
  if (intervalId) {
    clearInterval(intervalId);
    monitoringIntervals.delete(paperId);
  }
  
  activeMonitors.delete(paperId);
  
  // Persist the updated monitoring state
  await persistMonitoringState();
}

async function pollAnalysisStatus(paperId) {
  const monitorInfo = activeMonitors.get(paperId);
  if (!monitorInfo) return;
  
  // Prevent concurrent polling
  if (monitorInfo.polling) return;
  
  monitorInfo.polling = true;
  
  try {
    // Simple check: does paper exist in backend?
    const paperUrl = `${monitorInfo.backend.url}/storage/paper/${encodeURIComponent(paperId)}`;
    const response = await fetch(paperUrl);
    
    if (response.ok) {
      // Paper exists - analysis is complete
      console.log('[BG] Paper exists, analysis completed for paper:', paperId);
      stopAnalysisMonitoring(paperId);
      
      // Notify popup if it's open
      try {
        chrome.runtime.sendMessage({
          action: 'analysisComplete',
          tabId: monitorInfo.tabId,
          paperId: paperId
        });
      } catch (e) {
        console.log('[BG] Could not notify popup (probably closed):', e.message);
      }
      
      return;
    } else if (response.status === 404) {
      console.log('[BG] Paper not found yet, continuing monitoring for paper:', paperId);
      return;
    } else {
      throw new Error(`Paper check failed: ${response.status}`);
    }
    
  } catch (error) {
    console.error('[BG] Error polling analysis status for paper', paperId, ':', error);
  } finally {
    // Clear polling flag
    if (monitorInfo) {
      monitorInfo.polling = false;
    }
  }
}

// Function to get monitoring status for a paper
function getMonitoringStatus(paperId) {
  const monitorInfo = activeMonitors.get(paperId);
  if (!monitorInfo) return null;
  
  return {
    isMonitoring: true,
    startTime: monitorInfo.startTime,
    paperId: monitorInfo.paperId,
    tabId: monitorInfo.tabId
  };
}

// =============================================================================
// Legacy Analysis Functions (Simplified)
// =============================================================================

// Function to add analysis to queue
async function addToAnalysisQueue(tabId, url, priority = 0) {
  console.log(`Background: Adding tab ${tabId} to analysis queue`);
  
  // Check if already in queue
  const existingIndex = analysisQueue.findIndex(item => item.tabId === tabId);
  if (existingIndex !== -1) {
    console.log(`Background: Tab ${tabId} already in queue, updating priority`);
    analysisQueue[existingIndex].priority = priority;
    analysisQueue[existingIndex].timestamp = Date.now();
    return;
  }
  
  // Add to queue
  analysisQueue.push({
    tabId: tabId,
    url: url,
    priority: priority,
    timestamp: Date.now()
  });
  
  // Sort queue by priority
  analysisQueue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.timestamp - b.timestamp;
  });
  
  // Start processing queue if not already processing
  if (!isProcessingQueue) {
    processAnalysisQueue();
  }
}

// Function to process the analysis queue
async function processAnalysisQueue() {
  if (isProcessingQueue || analysisQueue.length === 0 || analysisInProgress.size > 0) {
    return;
  }
  
  isProcessingQueue = true;
  
  try {
    while (analysisQueue.length > 0 && analysisInProgress.size === 0) {
      const nextAnalysis = analysisQueue.shift();
      
      try {
        const tab = await chrome.tabs.get(nextAnalysis.tabId);
        if (!tab) continue;
        
        await triggerPDFAnalysis(nextAnalysis.tabId);
        
        // Wait for this analysis to complete
        while (analysisInProgress.has(nextAnalysis.tabId)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`Background: Error processing analysis for tab ${nextAnalysis.tabId}:`, error);
        analysisInProgress.delete(nextAnalysis.tabId);
      }
    }
  } catch (error) {
    console.error('Background: Error in queue processing:', error);
  } finally {
    isProcessingQueue = false;
    
    if (analysisQueue.length > 0 && analysisInProgress.size === 0) {
      setTimeout(() => processAnalysisQueue(), 1000);
    }
  }
}

// Extract SSRN ID from URL (matches backend logic)
async function extractSsrnIdFromUrl(url) {
  if (!url) return null;
  
  console.log('[BACKGROUND extractSsrnIdFromUrl] Called with URL:', url);
  
  try {
    const paperId = await generateIdFromUrl(url);
    console.log('[BACKGROUND extractSsrnIdFromUrl] Generated paper ID:', paperId, 'for URL:', url);
    return paperId;
  } catch (error) {
    console.error('[BACKGROUND extractSsrnIdFromUrl] Error generating paper ID:', error);
    // Fallback to simple SSRN ID extraction
    const match = url.match(/[?&]abstract(?:_?id)?=(\d+)/i);
    const fallbackId = match ? match[1] : url;
    console.log('[BACKGROUND extractSsrnIdFromUrl] Fallback paper ID:', fallbackId);
    return fallbackId;
  }
}

// Function to automatically trigger PDF analysis
async function triggerPDFAnalysis(tabId) {
  let paperUrl = undefined;
  try {
    // Check if analysis is already in progress for this tab
    if (analysisInProgress.has(tabId)) {
      console.log(`Analysis already in progress for tab ${tabId}`);
      return;
    }
    
    console.log(`Starting analysis for tab ${tabId}`);
    analysisInProgress.add(tabId);
    
    // Update tab state
    const currentTabState = activeTabs.get(tabId) || {};
    const newTabState = {
      ...currentTabState,
      analysisInProgress: true,
      analysisQueued: false,
      analysisStartTime: Date.now(),
      lastUpdated: Date.now()
    };
    activeTabs.set(tabId, newTabState);
    
    try {
      // Get tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error('Could not get tab URL');
      }

      let paperContent;
      paperUrl = tab.url;

      // For PDF files detected by network layer, we may not need content extraction
      let isPDF = pdfTabs.has(tabId);
      
      if (!isPDF) {
        // Try to get content from legacy content script if available
        try {
          const response = await chrome.tabs.sendMessage(tabId, { action: 'getPaperContent' });
          if (!response || response.error) {
            throw new Error(response?.error || 'Failed to get paper content');
          }
          paperContent = response.content;
          paperUrl = response.content.paperUrl;
        } catch (connectionError) {
          console.error(`Background: Connection error for tab ${tabId}:`, connectionError);
          
          // If we can't connect to content script, try to extract basic info from tab
          if (tab.url.includes('ssrn.com')) {
            const paperId = await extractSsrnIdFromUrl(tab.url);
            if (paperId) {
              paperContent = {
                paperUrl: tab.url,
                paperId: paperId,
                title: 'SSRN Paper',
                abstract: 'Content extracted from URL',
                paperContent: 'Paper content not available - analyzed from URL only'
              };
              paperUrl = tab.url;
              console.log(`Background: Using fallback content for SSRN paper ${paperId}`);
            } else {
              throw new Error('Could not extract paper information and content script connection failed');
            }
          } else {
            throw new Error(`Content script connection failed: ${connectionError.message}`);
          }
        }
      }
      
      // Extract paper ID
      const paperId = await extractSsrnIdFromUrl(paperUrl);
      if (!paperId) {
        throw new Error('Could not extract paper ID from URL');
      }
      
      // Set analysis status to in progress
      try {
        const STATUS_KEY = 'analysisStatus';
        const now = new Date().toISOString();
        const storage = await chrome.storage.local.get([STATUS_KEY]);
        const allStatus = storage[STATUS_KEY] || {};
        allStatus[paperId] = {
          status: 'in_progress',
          updatedAt: now,
          startedAt: now,
          paperId: paperId
        };
        await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
      } catch (statusError) {
        console.error('Error setting analysis status:', statusError);
      }

      // Show badge indicator
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

      // Get LLM settings and user settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', geminiKey: '', openaiKey: '', claudeKey: '' };
      const userSettings = (await chrome.storage.local.get(['userSettings'])).userSettings || {};
      const userScholarUrl = userSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const researchInterests = userSettings.researchInterests || '';
      
      // Use global backend
      let backend = await BackendManager.getCurrentBackend();
      
      // Make API request to backend
      let serverResponse;
      try {
        serverResponse = await makeApiRequestWithBackend(CONFIG.ANALYZE_STREAM_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            content: paperContent || { paperUrl },
            model: llmSettings.model,
            user_scholar_url: userScholarUrl,
            research_interests: researchInterests,
            google_api_key: llmSettings.geminiKey || undefined,
            openai_api_key: llmSettings.openaiKey || undefined,
            claude_api_key: llmSettings.claudeKey || undefined
          })
        }, backend);
      } catch (apiError) {
        console.error(`API request failed for tab ${tabId} on backend ${backend?.name}:`, apiError);
        backend = await BackendManager.getCurrentBackend();
        // Retry once with new backend
        serverResponse = await makeApiRequestWithBackend(CONFIG.ANALYZE_STREAM_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            content: paperContent || { paperUrl },
            model: llmSettings.model,
            user_scholar_url: userScholarUrl,
            research_interests: researchInterests,
            google_api_key: llmSettings.geminiKey || undefined,
            openai_api_key: llmSettings.openaiKey || undefined,
            claude_api_key: llmSettings.claudeKey || undefined
          })
        }, backend);
      }

      if (!serverResponse.ok) {
        const errorData = await serverResponse.json();
        throw new Error(errorData.error || `Backend error: ${serverResponse.status}`);
      }

      const data = await serverResponse.json();
      if (data.error) {
        throw new Error(data.error);
      }

      console.log('Background: Analysis completed successfully, storing results for paper:', paperId);

      // Generate consistent analysis_id
      const generatedAnalysisId = await generateAnalysisId(paperId, userScholarUrl);

      // Store the analysis result
      const storageKey = `analysis_${paperId}`;
      const analysisResult = {
        timestamp: new Date().toISOString(),
        paperId: paperId,
        analysisId: data.analysis_id || generatedAnalysisId,
        content: paperContent || { 
          paperUrl: paperUrl,
          paperId: paperId,
          title: 'Paper from Backend Analysis',
          abstract: 'Analyzed via background process',
          paperContent: 'Content processed by backend'
        },
        summary: data.summary || '',
        data: data,
        autoAnalyzed: true
      };

      const analysisStorageData = {};
      analysisStorageData[storageKey] = analysisResult;
      await chrome.storage.local.set(analysisStorageData);

      // Set analysis status to complete
      try {
        const STATUS_KEY = 'analysisStatus';
        const now = new Date().toISOString();
        const storage = await chrome.storage.local.get([STATUS_KEY]);
        const allStatus = storage[STATUS_KEY] || {};
        allStatus[paperId] = {
          status: 'complete',
          updatedAt: now,
          finishedAt: now,
          paperId: paperId
        };
        await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
      } catch (statusError) {
        console.error('Error setting analysis status:', statusError);
      }

      // Update badge
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

      // Notify popup
      try {
        chrome.runtime.sendMessage({
          action: 'analysisComplete',
          paperId: paperId,
          data: data
        }).catch(() => {
          console.log('Popup not available for completion notification');
        });
      } catch (error) {
        // Ignore if popup is not open
      }

    } finally {
      // Always clean up the analysis state
      analysisInProgress.delete(tabId);
      
      // Update tab state
      const finalState = activeTabs.get(tabId) || {};
      finalState.analysisInProgress = false;
      finalState.analysisQueued = false;
      finalState.lastUpdated = Date.now();
      activeTabs.set(tabId, finalState);
      
      // Process next item in queue if any
      if (analysisQueue.length > 0) {
        setTimeout(processAnalysisQueue, 1000);
      }
    }
    
  } catch (error) {
    console.error(`Background: Error in analysis for tab ${tabId}:`, error);
    
    // Set analysis status to error
    try {
      const STATUS_KEY = 'analysisStatus';
      const now = new Date().toISOString();
      const storage = await chrome.storage.local.get([STATUS_KEY]);
      const allStatus = storage[STATUS_KEY] || {};
      if (paperUrl) {
        const paperId = await extractSsrnIdFromUrl(paperUrl);
        if (paperId) {
          allStatus[paperId] = {
            status: 'error',
            updatedAt: now,
            finishedAt: now,
            paperId: paperId,
            errorMessage: error.message
          };
          await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
        }
      }
    } catch (statusError) {
      console.error('Error setting error status:', statusError);
    }
    
    // Show error in badge
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    
    // Clean up analysis state
    analysisInProgress.delete(tabId);
    
    // Update tab state to show error
    const errorState = activeTabs.get(tabId) || {};
    errorState.analysisInProgress = false;
    errorState.analysisQueued = false;
    errorState.analysisError = error.message;
    errorState.lastUpdated = Date.now();
    activeTabs.set(tabId, errorState);
    
    // Process next item in queue if any
    if (analysisQueue.length > 0) {
      setTimeout(processAnalysisQueue, 1000);
    }
  }
}

// =============================================================================
// Tab Management
// =============================================================================

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Handle tab refresh/navigation start
  if (changeInfo.status === 'loading') {
    console.log('Background: Tab starting to load/refresh:', tabId, tab.url);
    
    // Clean up states for this tab when it refreshes
    if (tab.url) {
      const paperId = extractSsrnIdFromUrlInline(tab.url);
      if (paperId) {
        const analyzingKey = `analyzing_${tabId}_${paperId}`;
        chrome.storage.local.remove(analyzingKey).then(() => {
          console.log('Background: Cleared analyzing state on tab refresh:', analyzingKey);
        }).catch(err => {
          console.error('Background: Error clearing analyzing state:', err);
        });
        
        // Stop any active monitoring for this paper
        stopAnalysisMonitoring(paperId);
      }
    }
    
    // Remove from analysis progress tracking
    analysisInProgress.delete(tabId);
    pdfTabs.delete(tabId); // Clear PDF detection flag
    
    // Update tab state
    const currentState = activeTabs.get(tabId) || {};
    activeTabs.set(tabId, {
      ...currentState,
      analysisInProgress: false,
      analysisQueued: false,
      lastUpdated: Date.now()
    });
  }
  
  if (changeInfo.status === 'complete') {
    // Mark the tab as active if it might be relevant
    const mightBeRelevant = tab.url && (
      tab.url.includes('ssrn.com') ||
      tab.url.startsWith('file:///') ||
      tab.url.toLowerCase().includes('.pdf') ||
      tab.url.includes('pdf.') ||
      tab.url.includes('/pdf/') ||
      tab.url.includes('arxiv.org') ||
      tab.url.includes('researchgate.net') ||
      tab.url.includes('nature.com') ||
      tab.url.includes('springer.com') ||
      tab.url.includes('wiley.com')
    );
    
    if (mightBeRelevant) {
      const currentState = activeTabs.get(tabId) || {};
      activeTabs.set(tabId, {
        ...currentState,
        url: tab.url,
        lastUpdated: Date.now()
      });
    }
  }
});

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (
      tab.url.includes('ssrn.com') ||
      tab.url.startsWith('file:///') ||
      tab.url.toLowerCase().includes('.pdf') ||
      tab.url.includes('pdf.') ||
      tab.url.includes('/pdf/') ||
      tab.url.includes('arxiv.org') ||
      tab.url.includes('researchgate.net') ||
      tab.url.includes('nature.com') ||
      tab.url.includes('springer.com') ||
      tab.url.includes('wiley.com')
    )) {
      // Ensure the tab is in activeTabs
      const currentState = activeTabs.get(activeInfo.tabId) || {};
      activeTabs.set(activeInfo.tabId, {
        ...currentState,
        url: tab.url,
        lastUpdated: Date.now()
      });
    }
  } catch (error) {
    console.error('Error handling tab activation:', error);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabState = activeTabs.get(tabId);
  const tabUrl = tabState?.url;
  
  activeTabs.delete(tabId);
  analysisInProgress.delete(tabId);
  pdfTabs.delete(tabId);
  
  // Remove from analysis queue
  const queueIndex = analysisQueue.findIndex(item => item.tabId === tabId);
  if (queueIndex !== -1) {
    analysisQueue.splice(queueIndex, 1);
  }
  
  // Clean up analysis results for this tab if it was closed
  if (tabUrl) {
    try {
      const existingResults = await chrome.storage.local.get(['analysisResults']);
      const allResults = existingResults.analysisResults || {};
      
      if (allResults[tabUrl]) {
        delete allResults[tabUrl];
        await chrome.storage.local.set({ analysisResults: allResults });
      }
      
      const existingAuthorResults = await chrome.storage.local.get(['authorAnalysisResults']);
      const allAuthorResults = existingAuthorResults.authorAnalysisResults || {};
      
      if (allAuthorResults[tabUrl]) {
        delete allAuthorResults[tabUrl];
        await chrome.storage.local.set({ authorAnalysisResults: allAuthorResults });
      }
    } catch (error) {
      console.error('Background: Error cleaning up analysis results for closed tab:', error);
    }
  }
});

// =============================================================================
// Message Handling
// =============================================================================

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Add monitoring control handlers
  if (request.action === 'startMonitoring') {
    const { paperId, tabId, backend } = request;
    console.log('[BG] Starting monitoring for paper:', paperId, 'tab:', tabId);
    startAnalysisMonitoring(paperId, tabId, backend);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'stopMonitoring') {
    const { paperId } = request;
    console.log('[BG] Stopping monitoring for paper:', paperId);
    stopAnalysisMonitoring(paperId);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'getMonitoringStatus') {
    const { paperId } = request;
    const status = getMonitoringStatus(paperId);
    sendResponse({ status });
    return true;
  }

  if (request.action === 'analysisStarted') {
    // Message sent by popup.js when user clicks the Analyze button
    const tabId = request.tabId;
    const url = request.url;
    console.log('[BG] analysisStarted message received for tab', tabId, 'url', url);
    try {
      if (analysisInProgress.has(tabId)) {
        console.log(`[BG] Analysis already in progress for tab ${tabId}`);
        sendResponse({ success: true, inProgress: true });
        return true;
      }

      // Show badge indicator
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

      // Queue the analysis
      addToAnalysisQueue(tabId, url || null, 1);
      sendResponse({ success: true, queued: true });
    } catch (error) {
      console.error('[BG] Error queuing analysis from analysisStarted:', error);
      sendResponse({ error: error.message || 'Failed to queue analysis' });
    }
    return true;
  }

  // Handle messages from PDF collector
  if (request.status === 'ready' && request.pdf) {
    console.log('[BG] PDF collector reported ready:', request.pdf);
    
    // Store PDF info for popup access
    if (sender.tab) {
      const tabState = activeTabs.get(sender.tab.id) || {};
      tabState.pdfReady = true;
      tabState.pdfInfo = request.pdf;
      tabState.lastUpdated = Date.now();
      activeTabs.set(sender.tab.id, tabState);
      
      // Forward to popup if it's listening
      try {
        chrome.runtime.sendMessage({
          action: 'pdfReady',
          tabId: sender.tab.id,
          pdf: request.pdf
        });
      } catch (e) {
        // Popup might not be open
      }
    }
    return true;
  }

  // Existing sender.tab guard for other messages
  if (!sender.tab && request.action !== 'analysisStarted') {
    console.warn('Message received without tab context:', request);
    sendResponse({ error: 'No tab context available' });
    return true;
  }

  const tabId = sender.tab?.id;
  
  if (request.action === 'updateTabState') {
    activeTabs.set(tabId, {
      ...activeTabs.get(tabId),
      ...request.state,
      lastUpdated: Date.now()
    });
    sendResponse({ success: true });
  } else if (request.action === 'getTabState') {
    sendResponse({ state: activeTabs.get(tabId) });
  } else if (request.action === 'manualAnalyze') {
    // Handle manual analysis request
    try {
      if (analysisInProgress.has(tabId)) {
        console.log(`Analysis already in progress for tab ${tabId}`);
        sendResponse({ success: true, inProgress: true });
        return true;
      }
      
      // Show badge indicator
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
      
      // Start the analysis
      addToAnalysisQueue(tabId, sender.tab.url);
      sendResponse({ success: true, queued: true });
    } catch (error) {
      console.error('Error starting manual analysis:', error);
      sendResponse({ error: error.message });
    }
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ok', timestamp: Date.now() });
  } else if (request.action === 'testPaperId') {
    // Test paper ID generation
    try {
      const paperId = await extractSsrnIdFromUrl(request.url);
      sendResponse({ success: true, paperId: paperId, url: request.url });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  } else if (request.action === 'testBackend') {
    // Test backend detection
    try {
      const backend = await BackendManager.getCurrentBackend();
      sendResponse({ 
        success: true, 
        backendAvailable: !!backend,
        backendUrl: backend?.url || null,
        status: backend ? 'Available' : 'No healthy backend found'
      });
    } catch (error) {
      sendResponse({ 
        success: false, 
        error: error.message,
        backendAvailable: false 
      });
    }
  } else {
    console.log('Unknown message action:', request.action);
    sendResponse({ error: 'Unknown action' });
  }
  return true;
});

// =============================================================================
// Service Worker Lifecycle
// =============================================================================

// Keep the service worker alive
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    // Clean up any resources if needed
  });
});

// Listen for extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[BG] Extension installed, checking for onboarding...');
    
    // Wait a moment for storage to be ready
    setTimeout(async () => {
      await checkFirstInstall();
    }, 1000);
  }
}); 

// Function to generate analysis_id consistently with backend
async function generateAnalysisId(paperId, userScholarUrl) {
  const combined = `${paperId}_${userScholarUrl}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}

// Check if this is first install and show onboarding
async function checkFirstInstall() {
  try {
    const result = await chrome.storage.local.get(['onboardingCompleted', 'onboardingShown']);
    
    if (!result.onboardingCompleted && !result.onboardingShown) {
      console.log('[BG] First install detected, showing onboarding...');
      
      // Mark onboarding as shown immediately to prevent duplicate tabs
      await chrome.storage.local.set({ onboardingShown: true });
      
      // Open onboarding page in a new tab
      const onboardingUrl = chrome.runtime.getURL('onboarding.html');
      await chrome.tabs.create({ url: onboardingUrl });
    } else {
      console.log('[BG] Onboarding already completed or shown');
    }
  } catch (error) {
    console.error('[BG] Error checking first install:', error);
  }
}

console.log('[BG] New PDF detection system loaded - using webRequest API for network-layer detection');