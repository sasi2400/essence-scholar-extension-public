// Import configuration and smart backend detection
importScripts('config.js');

// Keep track of active tabs and their states
let activeTabs = new Map();
let analysisInProgress = new Set(); // Track which tabs are being analyzed
let analysisQueue = []; // Queue for pending analyses
let isProcessingQueue = false; // Flag to prevent multiple queue processing

// Log configuration on startup
console.log('Background script: Smart backend detection enabled');
console.log('Background script: Available backends:', Object.keys(CONFIG.BACKENDS));
console.log('Background script: Auto-detect enabled:', CONFIG.AUTO_DETECT_BACKENDS);

// Initialize backend detection
backendManager.detectBestBackend().then(backend => {
  if (backend) {
    console.log(`Background script: Initial backend selected: ${backend.name} (${backend.url})`);
  } else {
    console.log('Background script: No healthy backends found during initialization');
  }
}).catch(error => {
  console.error('Background script: Error during initial backend detection:', error);
});



// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
function addToAnalysisQueue(tabId, url, priority = 0) {
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

// Function to extract SSRN ID from URL
function extractSsrnIdFromUrl(url) {
  if (!url) return null;
  
  // Extract from abstractId parameter
  const abstractIdMatch = url.match(/abstractId=(\d+)/);
  if (abstractIdMatch) return abstractIdMatch[1];
  
  // Extract from ssrn_id pattern in URL
  const ssrnIdMatch = url.match(/ssrn_id(\d+)/);
  if (ssrnIdMatch) return ssrnIdMatch[1];
  
  // Extract from papers.ssrn.com/sol3/papers.cfm?abstract_id=
  const paperUrlMatch = url.match(/abstract_id=(\d+)/);
  if (paperUrlMatch) return paperUrlMatch[1];
  
  return null;
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
      let paperUrl = tab.url;

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
      
      // Make API request to backend
      const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          content: paperContent || { paperUrl },
          model: llmSettings.model,
          openai_api_key: llmSettings.openaiKey || undefined,
          claude_api_key: llmSettings.claudeKey || undefined
        })
      });

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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background: Received message:', request);

  // Handle analysis status messages from popup (these don't have sender.tab)
  if (request.action === 'analysisStarted' && request.tabId) {
    // Handle analysis started notification from popup
    console.log('Background: Analysis requested for tabId:', request.tabId, 'URL:', request.url);
    console.log('Background: Current queue size:', analysisQueue.length, 'analysisInProgress size:', analysisInProgress.size);
    
    // Check if analysis is already in progress for this tab
    if (analysisInProgress.has(request.tabId)) {
      console.log(`Analysis already in progress for tab ${request.tabId}`);
      sendResponse({ success: true, queued: false, inProgress: true });
      return true;
    }
    
    // Update tab state to show analysis is queued
    const currentTabState = activeTabs.get(request.tabId) || {};
    const newTabState = {
      ...currentTabState,
      url: request.url,
      analysisQueued: true,
      analysisRequestTime: Date.now(),
      lastUpdated: Date.now()
    };
    activeTabs.set(request.tabId, newTabState);
    
    // Add to analysis queue instead of starting immediately
    addToAnalysisQueue(request.tabId, request.url);
    
    // Start queue processing if not already running
    if (!isProcessingQueue) {
      processAnalysisQueue();
    }
    
    console.log('Background: Updated tab state for analysis request:', newTabState);
    console.log('Background: After queue update - queue size:', analysisQueue.length, 'analysisInProgress size:', analysisInProgress.size);
    
    sendResponse({ success: true, queued: true });
    return true;
  }

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