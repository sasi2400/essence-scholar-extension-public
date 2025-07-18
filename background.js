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

// Keep track of active tabs and their states
let activeTabs = new Map();
let analysisInProgress = new Set(); // Track which tabs are being analyzed
let analysisQueue = []; // Queue for pending analyses
let isProcessingQueue = false; // Flag to prevent multiple queue processing

// Analysis monitoring state
let activeMonitors = new Map(); // Map of paperId -> monitor info
let monitoringIntervals = new Map(); // Map of paperId -> intervalId

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

// Log configuration on startup
console.log('Background script: Smart backend detection enabled');
console.log('Background script: Available backends:', Object.keys(CONFIG.BACKENDS));
console.log('Background script: Auto-detect enabled:', CONFIG.AUTO_DETECT_BACKENDS);

// Remove global backendManager usage and initialization

// Analysis monitoring functions
async function startAnalysisMonitoring(paperId, tabId, backend) {
  console.log('[BG] Starting analysis monitoring for paper:', paperId, 'tab:', tabId);
  console.log('[BG] Backend for monitoring:', backend.name, backend.url);
  console.log('[BG] Current active monitors before start:', Array.from(activeMonitors.keys()));
  
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
  console.log('[BG] Added monitor info for paper:', paperId);
  console.log('[BG] Current active monitors after add:', Array.from(activeMonitors.keys()));
  
  // Start polling every 5 seconds (reduced frequency to prevent backend overload)
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
  console.log('[BG] Started interval with ID:', intervalId, 'for paper:', paperId);
  console.log('[BG] Current monitoring intervals:', Array.from(monitoringIntervals.keys()));
  
  // Set timeout to stop monitoring after 10 minutes
  setTimeout(() => {
    if (activeMonitors.has(paperId)) {
      console.log('[BG] Analysis monitoring timeout for paper:', paperId);
      stopAnalysisMonitoring(paperId);
    }
  }, 10 * 60 * 1000); // 10 minutes
  
  console.log('[BG] Monitoring setup complete for paper:', paperId);
  
  // Persist the new monitoring state
  await persistMonitoringState();
}

async function stopAnalysisMonitoring(paperId) {
  console.log('[BG] Stopping analysis monitoring for paper:', paperId);
  
  const intervalId = monitoringIntervals.get(paperId);
  if (intervalId) {
    clearInterval(intervalId);
    monitoringIntervals.delete(paperId);
    console.log('[BG] Cleared interval for paper:', paperId);
  }
  
  activeMonitors.delete(paperId);
  console.log('[BG] Removed monitor info for paper:', paperId);
  console.log('[BG] Remaining active monitors:', Array.from(activeMonitors.keys()));
  
  // Persist the updated monitoring state
  await persistMonitoringState();
}

async function pollAnalysisStatus(paperId) {
  const monitorInfo = activeMonitors.get(paperId);
  if (!monitorInfo) {
    console.log('[BG] No monitor info found for paper:', paperId);
    return;
  }
  
  // Prevent concurrent polling
  if (monitorInfo.polling) {
    console.log('[BG] Already polling for paper:', paperId, 'skipping this round');
    return;
  }
  
  monitorInfo.polling = true;
  console.log('[BG] Polling analysis status for paper:', paperId, 'using backend:', monitorInfo.backend.url);
  
  try {
    const statusUrl = `${monitorInfo.backend.url}/analysis-status/${encodeURIComponent(paperId)}`;
    const response = await fetch(statusUrl);
    
    console.log('[BG] Status response:', response.status, response.statusText);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('[BG] Analysis status not found for paper:', paperId);
        return;
      }
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[BG] Status data received:', data);
    
    // Check if status changed
    if (data.status === 'complete') {
      console.log('[BG] Analysis completed for paper:', paperId);
      stopAnalysisMonitoring(paperId);
      
      // Notify popup if it's open
      try {
        chrome.runtime.sendMessage({
          action: 'analysisComplete',
          paperId: paperId,
          tabId: monitorInfo.tabId
        });
        console.log('[BG] Sent analysisComplete message');
      } catch (e) {
        console.log('[BG] Could not send analysisComplete message (popup may be closed):', e);
      }
      
      // Update badge
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      
    } else if (data.status === 'error') {
      console.log('[BG] Analysis failed for paper:', paperId);
      stopAnalysisMonitoring(paperId);
      
      // Notify popup if it's open
      try {
        chrome.runtime.sendMessage({
          action: 'analysisError',
          paperId: paperId,
          tabId: monitorInfo.tabId,
          error: data.errorMessage
        });
        console.log('[BG] Sent analysisError message');
      } catch (e) {
        console.log('[BG] Could not send analysisError message (popup may be closed):', e);
      }
      
      // Update badge
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
      
    } else if (data.status === 'in_progress') {
      console.log('[BG] Analysis still in progress for paper:', paperId);
      // Send progress update to popup if it's open
      try {
        chrome.runtime.sendMessage({
          action: 'analysisProgress',
          paperId: paperId,
          tabId: monitorInfo.tabId,
          data: data
        });
        console.log('[BG] Sent analysisProgress message');
      } catch (e) {
        console.log('[BG] Could not send analysisProgress message (popup may be closed):', e);
      }
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

// Debug function - accessible via chrome.runtime.sendMessage
function debugBackgroundMonitoring() {
  console.log('=== BACKGROUND MONITORING DEBUG ===');
  console.log('Active monitors:', Array.from(activeMonitors.keys()));
  console.log('Monitoring intervals:', Array.from(monitoringIntervals.keys()));
  console.log('Monitor details:');
  for (const [paperId, info] of activeMonitors.entries()) {
    console.log(`  ${paperId}:`, {
      tabId: info.tabId,
      backend: info.backend.name,
      startTime: new Date(info.startTime).toLocaleTimeString(),
      ageMinutes: (Date.now() - info.startTime) / (1000 * 60)
    });
  }
  console.log('=== END DEBUG ===');
  
  return {
    activeMonitors: Array.from(activeMonitors.keys()),
    monitoringIntervals: Array.from(monitoringIntervals.keys()),
    details: Array.from(activeMonitors.entries()).map(([paperId, info]) => ({
      paperId,
      tabId: info.tabId,
      backend: info.backend.name,
      startTime: info.startTime,
      ageMinutes: (Date.now() - info.startTime) / (1000 * 60)
    }))
  };
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Handle tab refresh/navigation start
  if (changeInfo.status === 'loading') {
    console.log('Background: Tab starting to load/refresh:', tabId, tab.url);
    
    // Clean up analyzing states for this tab when it refreshes
    if (tab.url) {
      const paperId = extractSsrnIdFromUrl(tab.url);
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
    // Check if the tab is a PDF or SSRN page
    if (tab.url && (
      tab.url.toLowerCase().endsWith('.pdf') ||
      tab.url.includes('ssrn.com') ||
      tab.url.startsWith('file:///')
    )) {
      // Mark the tab as active
      const currentState = activeTabs.get(tabId) || {};
      activeTabs.set(tabId, {
        ...currentState,
        url: tab.url,
        lastUpdated: Date.now()
      });
      
      console.log('Background: Tab updated and marked as active:', tabId, tab.url);
      console.log('Background: activeTabs size:', activeTabs.size);
      
      // Remove automatic analysis trigger for PDFs
      // if (tab.url.toLowerCase().endsWith('.pdf') || tab.url.startsWith('file:///')) {
      //   console.log('PDF detected, triggering automatic analysis...');
      //   setTimeout(() => {
      //     triggerPDFAnalysis(tabId);
      //   }, 2000); // Wait 2 seconds for PDF to fully load
      // }
    }
  }
});

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
  
  // Removed tab-level backend assignment - using global backends now
  
  // Add to queue
  analysisQueue.push({
    tabId: tabId,
    url: url,
    priority: priority,
    timestamp: Date.now()
  });
  
  // Sort queue by priority (higher priority first) and then by timestamp
  analysisQueue.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return a.timestamp - b.timestamp; // Earlier timestamp first
  });
  
  console.log(`Background: Queue updated. Current queue:`, analysisQueue.map(item => ({ tabId: item.tabId, priority: item.priority })));
  
  // Start processing queue if not already processing
  if (!isProcessingQueue) {
    processAnalysisQueue();
  }
}

// Function to process the analysis queue
async function processAnalysisQueue() {
  if (isProcessingQueue) {
    console.log('Background: Queue processing already in progress, skipping');
    return;
  }
  
  if (analysisQueue.length === 0) {
    console.log('Background: Queue is empty, nothing to process');
    return;
  }
  
  // Check if any analysis is currently in progress
  if (analysisInProgress.size > 0) {
    console.log(`Background: Analysis already in progress (${analysisInProgress.size} active), waiting...`);
    return;
  }
  
  isProcessingQueue = true;
  console.log('Background: Starting queue processing');
  
  try {
    while (analysisQueue.length > 0 && analysisInProgress.size === 0) {
      const nextAnalysis = analysisQueue.shift();
      console.log(`Background: Processing next analysis from queue: tab ${nextAnalysis.tabId}`);
      
      // Check if tab still exists
      try {
        const tab = await chrome.tabs.get(nextAnalysis.tabId);
        if (!tab) {
          console.log(`Background: Tab ${nextAnalysis.tabId} no longer exists, skipping`);
          continue;
        }
        
        // Start the analysis
        await triggerPDFAnalysis(nextAnalysis.tabId);
        
        // Wait for this analysis to complete before processing next
        while (analysisInProgress.has(nextAnalysis.tabId)) {
          console.log(`Background: Waiting for analysis ${nextAnalysis.tabId} to complete...`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
        
      } catch (error) {
        console.error(`Background: Error processing analysis for tab ${nextAnalysis.tabId}:`, error);
        // Remove from in-progress set if it was added
        analysisInProgress.delete(nextAnalysis.tabId);
      }
    }
  } catch (error) {
    console.error('Background: Error in queue processing:', error);
  } finally {
    isProcessingQueue = false;
    console.log('Background: Queue processing completed');
    
    // If there are still items in queue and no analysis in progress, process again
    if (analysisQueue.length > 0 && analysisInProgress.size === 0) {
      console.log('Background: Items still in queue, processing again...');
      setTimeout(() => processAnalysisQueue(), 1000);
    }
  }
}

// Generate SHA-256 hash using Web Crypto API for service worker
async function generateSHA256Hash(text) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 12); // Take first 12 characters like backend
  } catch (error) {
    console.error('Error generating hash:', error);
    return null;
  }
}

// Extract SSRN ID from URL (matches backend logic)
function extractSsrnIdFromUrlSync(url) {
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

// Use inlined ID generator for service worker compatibility
async function extractSsrnIdFromUrl(url) {
  if (!url) return null;
  
  console.log('[BACKGROUND extractSsrnIdFromUrl] Called with URL:', url);
  
  // Use the inlined generateIdFromUrl function for consistency with popup.js
  try {
    const paperId = await generateIdFromUrl(url);
    console.log('[BACKGROUND extractSsrnIdFromUrl] Generated paper ID:', paperId, 'for URL:', url);
    console.log('🔍 BACKGROUND ID GENERATION - URL:', url, 'RESULT:', paperId);
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

// Function to ensure content script is injected
async function ensureContentScriptInjected(tabId) {
  try {
    // First check if content script is already active by sending a ping
    const pingResponse = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (pingResponse && pingResponse.status === 'ok') {
      console.log(`Background: Content script already active in tab ${tabId}`);
      return true;
    }
  } catch (error) {
    // Content script not active, need to inject
    console.log(`Background: Content script not active in tab ${tabId}, injecting...`);
  }
  
  try {
    // Get tab info to check URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      throw new Error('Could not get tab information');
    }
    
    // Only inject on supported URLs
    if (tab.url.includes('ssrn.com') || 
        tab.url.toLowerCase().endsWith('.pdf') || 
        tab.url.startsWith('file:///')) {
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      
      console.log(`Background: Content script injected into tab ${tabId}`);
      return true;
    } else {
      console.log(`Background: Tab ${tabId} URL not supported for content script injection: ${tab.url}`);
      return false;
    }
  } catch (error) {
    console.error(`Background: Failed to inject content script into tab ${tabId}:`, error);
    return false;
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
    
    console.log(`Starting analysis for tab ${tabId} (from queue)`);
    analysisInProgress.add(tabId);
    
    // Update tab state to show analysis is now in progress
    const currentTabState = activeTabs.get(tabId) || {};
    const newTabState = {
      ...currentTabState,
      analysisInProgress: true,
      analysisQueued: false,
      analysisStartTime: Date.now(),
      lastUpdated: Date.now()
    };
    activeTabs.set(tabId, newTabState);
    console.log(`Background: Updated tab state for analysis start:`, newTabState);
    
    try {
      // Get tab info
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        throw new Error('Could not get tab URL');
      }

      // For PDF files, use the tab URL directly
      const isPDF = tab.url.toLowerCase().endsWith('.pdf');
      let paperContent;
      paperUrl = tab.url;

      if (!isPDF) {
        // For non-PDF files, get content from content script
        try {
          // First, try to ensure content script is injected
          await ensureContentScriptInjected(tabId);
          
          // Wait a bit for content script to initialize
          await new Promise(resolve => setTimeout(resolve, 500));
          
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
            const paperId = extractSsrnIdFromUrl(tab.url);
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
      const paperId = extractSsrnIdFromUrl(paperUrl);
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

      // Show badge indicator that analysis is in progress
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

      // Get LLM settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', openaiKey: '', claudeKey: '' };
      
      // Use global backend instead of per-tab
      let backend = await BackendManager.getCurrentBackend();
      
      // Make API request to backend
      let serverResponse;
      try {
        serverResponse = await makeApiRequestWithBackend(CONFIG.ANALYZE_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            content: paperContent || { paperUrl },
            model: llmSettings.model,
            openai_api_key: llmSettings.openaiKey || undefined,
            claude_api_key: llmSettings.claudeKey || undefined
          })
        }, backend);
      } catch (apiError) {
        // If backend fails, try to detect a new global backend  
        console.error(`API request failed for tab ${tabId} on backend ${backend?.name}:`, apiError);
        backend = await BackendManager.detectBestBackend();
        // Retry once with new backend
        serverResponse = await makeApiRequestWithBackend(CONFIG.ANALYZE_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            content: paperContent || { paperUrl },
            model: llmSettings.model,
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

      // Store the full analysis result in the same format that fullpage expects
      const storageKey = `analysis_${paperId}`;
      const analysisResult = {
        timestamp: new Date().toISOString(),
        paperId: paperId,
        content: paperContent || { 
          paperUrl: paperUrl,
          paperId: paperId,
          title: 'Paper from Backend Analysis',
          abstract: 'Analyzed via background process',
          paperContent: 'Content processed by backend'
        },
        summary: data.summary || '',
        data: data, // Store the entire response data
        autoAnalyzed: true // Mark as auto-analyzed
      };

      // Store the analysis result
      const analysisStorageData = {};
      analysisStorageData[storageKey] = analysisResult;
      await chrome.storage.local.set(analysisStorageData);
      console.log('Background: Stored analysis result with key:', storageKey);

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

      // Update badge to show completion
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

      // Notify popup if it's open
      try {
        chrome.runtime.sendMessage({
          action: 'analysisComplete',
          paperId: paperId,
          data: data
        }).catch(() => {
          // Popup might not be open, ignore error
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
        const paperId = extractSsrnIdFromUrl(paperUrl);
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

async function checkBackendForAnalysisByTabUrl(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return false;
    const paperId = await extractSsrnIdFromUrl(tab.url);
    if (!paperId) return false;
    // Use smart backend detection
    const endpoint = '/analysis/' + encodeURIComponent(paperId);
    const backendUrl = await getApiUrl(endpoint);
    const resp = await fetch(backendUrl);
    if (resp.ok) {
      const data = await resp.json();
      return !!data && !!data.summary;
    }
    return false;
  } catch (e) {
    console.error('Error checking backend for analysis:', e);
    return false;
  }
}

// Listen for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && (
      tab.url.toLowerCase().endsWith('.pdf') ||
      tab.url.includes('ssrn.com') ||
      tab.url.startsWith('file:///')
    )) {
      // Ensure the tab is in activeTabs
      const currentState = activeTabs.get(activeInfo.tabId) || {};
      activeTabs.set(activeInfo.tabId, {
        ...currentState,
        url: tab.url,
        lastUpdated: Date.now()
      });
      
      console.log('Background: Tab activated and marked as active:', activeInfo.tabId, tab.url);
      console.log('Background: activeTabs size:', activeTabs.size);
    }
  } catch (error) {
    console.error('Error handling tab activation:', error);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Get the tab URL before removing it from activeTabs
  const tabState = activeTabs.get(tabId);
  const tabUrl = tabState?.url;
  
  activeTabs.delete(tabId);
  analysisInProgress.delete(tabId);
  
  // Remove from analysis queue
  const queueIndex = analysisQueue.findIndex(item => item.tabId === tabId);
  if (queueIndex !== -1) {
    analysisQueue.splice(queueIndex, 1);
    console.log(`Background: Removed tab ${tabId} from analysis queue`);
  }
  
  // Removed tab backend cleanup - using global backends now
  
  console.log('Background: Tab removed:', tabId, 'URL:', tabUrl);
  console.log('Background: activeTabs size after removal:', activeTabs.size);
  console.log('Background: analysisInProgress size after removal:', analysisInProgress.size);
  console.log('Background: analysisQueue size after removal:', analysisQueue.length);
  
  // Clean up analysis results for this tab if it was closed
  if (tabUrl) {
    try {
      // Remove analysis results for this URL
      const existingResults = await chrome.storage.local.get(['analysisResults']);
      const allResults = existingResults.analysisResults || {};
      
      if (allResults[tabUrl]) {
        delete allResults[tabUrl];
        await chrome.storage.local.set({ analysisResults: allResults });
        console.log('Background: Removed analysis results for closed tab URL:', tabUrl);
      }
      
      // Also clean up author analysis results
      const existingAuthorResults = await chrome.storage.local.get(['authorAnalysisResults']);
      const allAuthorResults = existingAuthorResults.authorAnalysisResults || {};
      
      if (allAuthorResults[tabUrl]) {
        delete allAuthorResults[tabUrl];
        await chrome.storage.local.set({ authorAnalysisResults: allAuthorResults });
        console.log('Background: Removed author analysis results for closed tab URL:', tabUrl);
      }
    } catch (error) {
      console.error('Background: Error cleaning up analysis results for closed tab:', error);
    }
  }
});

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // Removed getTabBackend - now using global BackendManager

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

  if (request.action === 'debugMonitoring') {
    const debugInfo = debugBackgroundMonitoring();
    sendResponse({ debugInfo });
    return true;
  }

  if (request.action === 'analysisStarted') {
    // Message sent by popup.js when user clicks the Analyze button on an SSRN HTML page.
    // The popup context has no sender.tab, so handle this action before the sender.tab guard.
    const tabId = request.tabId;
    const url = request.url;
    console.log('[BG] analysisStarted message received for tab', tabId, 'url', url);
    try {
      // If analysis already running for the tab, acknowledge and exit.
      if (analysisInProgress.has(tabId)) {
        console.log(`[BG] Analysis already in progress for tab ${tabId}`);
        sendResponse({ success: true, inProgress: true });
        return true;
      }

      // Show badge indicator that analysis is starting
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

      // Queue the analysis (priority 1 to match manualAnalyze behaviour)
      addToAnalysisQueue(tabId, url || null, 1);
      sendResponse({ success: true, queued: true });
    } catch (error) {
      console.error('[BG] Error queuing analysis from analysisStarted:', error);
      sendResponse({ error: error.message || 'Failed to queue analysis' });
    }
    return true;
  }

  // Existing sender.tab guard remains below
  if (!sender.tab) {
    console.warn('Message received without tab context:', request);
    sendResponse({ error: 'No tab context available' });
    return true;
  }

  const tabId = sender.tab.id;
  
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
      // Check if analysis is already in progress
      if (analysisInProgress.has(tabId)) {
        console.log(`Analysis already in progress for tab ${tabId}`);
        sendResponse({ success: true, inProgress: true });
        return true;
      }
      
      // Show badge indicator for manual analysis
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
      const backend = await backendManager.getCurrentBackend();
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

// Keep the service worker alive
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    // Clean up any resources if needed
  });
}); 