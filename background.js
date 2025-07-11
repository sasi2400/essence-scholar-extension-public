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
    
    // Set analysis status to in progress
    try {
      const STATUS_KEY = 'analysisStatus';
      const now = new Date().toISOString();
      const storage = await chrome.storage.local.get([STATUS_KEY]);
      const allStatus = storage[STATUS_KEY] || {};
      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url) {
        allStatus[tab.url] = {
          status: 'in_progress',
          updatedAt: now,
          startedAt: now
        };
        await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
      }
    } catch (statusError) {
      console.error('Error setting analysis status:', statusError);
    }
    


    // Show badge indicator that analysis is in progress
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });

    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({ 
        action: 'analysisStarted', 
        tabId: tabId 
      }).catch(() => {
        // Popup might not be open, ignore error
        console.log('Popup not available for analysis started notification');
      });
    } catch (error) {
      // Ignore if popup is not open
    }
    
    // Ensure content script is injected
    console.log('Injecting content script...');
    try {
      // First check if content script is already injected
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        console.log('Content script already injected, skipping injection');
      } catch (error) {
        // Content script not injected, proceed with injection
        console.log('Content script not found, injecting...');
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        console.log('Content script injected successfully');
      }
    } catch (error) {
      console.error('Error injecting content script:', error);
      analysisInProgress.delete(tabId);
      return;
    }
    
    // Wait for content script to initialize
    console.log('Waiting for content script to initialize...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Request content from the content script
    console.log('Requesting content from content script...');
    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { action: 'getPaperContent' });
      console.log('Response from content script:', response);
    } catch (error) {
      console.error('Error sending message to content script:', error);
      analysisInProgress.delete(tabId);
      return;
    }
    
    if (response.error) {
      console.error('Error getting PDF content:', response.error);
      analysisInProgress.delete(tabId);
      return;
    }

    if (!response.content) {
      console.error('No content received from PDF');
      analysisInProgress.delete(tabId);
      return;
    }

    console.log('PDF content extracted:', response.content);
    console.log('Sending to backend for analysis using smart detection...');

    // Use smart backend detection for API request
    let data = null;
    try {
      const requestBody = JSON.stringify({ content: response.content });
      console.log('Request body size:', requestBody.length);
      console.log('Request body preview:', requestBody.substring(0, 200) + '...');
      
      // Use the smart API request function from config.js
      const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
        method: 'POST',
        body: requestBody
      });
      
      console.log('Server response status:', serverResponse.status);
      console.log('Server response headers:', Object.fromEntries(serverResponse.headers.entries()));
      
      if (serverResponse.ok) {
        const currentBackend = await backendManager.getCurrentBackend();
        console.log(`Successfully connected to ${currentBackend.name}`);
        
        const responseText = await serverResponse.text();
        console.log('Response text length:', responseText.length);
        console.log('Response text preview:', responseText.substring(0, 200) + '...');
        
        try {
          data = JSON.parse(responseText);
          console.log('Successfully parsed JSON response');
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError);
          console.log('Raw response:', responseText);
          throw new Error('Invalid JSON response from server');
        }
      } else {
        console.log('Server returned error status:', serverResponse.status);
        const errorText = await serverResponse.text();
        console.log('Error response:', errorText);
        throw new Error(`Server error: ${serverResponse.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Smart backend request failed:', error);
      
      // Clear the analysis state
      analysisInProgress.delete(tabId);
      
      // Update tab state
      activeTabs.set(tabId, {
        ...activeTabs.get(tabId),
        analysisInProgress: false,
        lastError: 'Failed to connect to backend server: ' + error.message
      });
      
      // Clear the badge
      chrome.action.setBadgeText({ text: '' });
      
      return;
    }
    
    if (data.error) {
      console.error('Backend analysis error:', data.error);
      analysisInProgress.delete(tabId);
      return;
    }

    console.log('Analysis completed successfully:', data.summary?.substring(0, 100) + '...');

    // Store the analysis results (per tab URL)
    const analysisResult = {
      timestamp: new Date().toISOString(),
      url: response.content.paperUrl || response.content.paperId,
      title: response.content.title || 'PDF Document',
      content: response.content,
      summary: data.summary,
      autoAnalyzed: true
    };

    // Get existing analysis results and add the new one
    const existingResults = await chrome.storage.local.get(['analysisResults']);
    const allResults = existingResults.analysisResults || {};
    allResults[response.content.paperUrl || response.content.paperId] = analysisResult;

    // Store the updated results
    await chrome.storage.local.set({ analysisResults: allResults });
    
    // Also store as lastAnalysis for backward compatibility
    await chrome.storage.local.set({ lastAnalysis: analysisResult });

    console.log('PDF analysis completed and stored');
    
    // Set analysis status to complete
    try {
      const STATUS_KEY = 'analysisStatus';
      const now = new Date().toISOString();
      const storage = await chrome.storage.local.get([STATUS_KEY]);
      const allStatus = storage[STATUS_KEY] || {};
      allStatus[response.content.paperUrl || response.content.paperId] = {
        status: 'complete',
        updatedAt: now,
        finishedAt: now
      };
      await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
    } catch (statusError) {
      console.error('Error setting analysis status:', statusError);
    }
    
    // Update tab state with analysis results
    activeTabs.set(tabId, {
      ...activeTabs.get(tabId),
      hasAnalysis: true,
      analysisInProgress: false,
      analysisTimestamp: Date.now()
    });

    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'PDF Analysis Complete',
      message: 'Your PDF has been analyzed. Click the extension icon to view the detailed summary.'
    });

    // Update the extension badge to show completion
    chrome.action.setBadgeText({ text: 'OK' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Notify popup if it's open
    try {
      chrome.runtime.sendMessage({ 
        action: 'analysisComplete', 
        tabId: tabId 
      }).catch(() => {
        // Popup might not be open, ignore error
        console.log('Popup not available for analysis completion notification');
      });
    } catch (error) {
      // Ignore if popup is not open
    }
    
    // Clear badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);

      } catch (error) {
      console.error('Error in automatic PDF analysis:', error);
      
      // Set analysis status to error
      try {
        const STATUS_KEY = 'analysisStatus';
        const now = new Date().toISOString();
        const storage = await chrome.storage.local.get([STATUS_KEY]);
        const allStatus = storage[STATUS_KEY] || {};
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url) {
          allStatus[tab.url] = {
            status: 'error',
            errorMessage: error.message,
            updatedAt: now,
            finishedAt: now
          };
          await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
        }
      } catch (statusError) {
        console.error('Error setting analysis status:', statusError);
      }
      
      // Clear badge on error
      chrome.action.setBadgeText({ text: '' });
    } finally {
      // Always remove from in-progress set
      analysisInProgress.delete(tabId);
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

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background: Received message:', request.action, 'from sender:', sender);
  
  try {
    // Handle messages that don't require a tab context
    if (request.action === 'getConfig' || request.action === 'ping') {
      sendResponse({ success: true, config: { version: '1.0' } });
      return true;
    }
    
    // Handle checkAnalysisStatus from popup (which includes tabId in the request)
    if (request.action === 'checkAnalysisStatus' && request.tabId) {
      console.log('Background: Handling checkAnalysisStatus for tabId:', request.tabId);
      const tabId = request.tabId;
      const tabState = activeTabs.get(tabId);
      
      console.log('Background: Current tabState:', tabState);
      console.log('Background: analysisInProgress.has(tabId):', analysisInProgress.has(tabId));
      console.log('Background: activeTabs size:', activeTabs.size);
      console.log('Background: analysisInProgress size:', analysisInProgress.size);
      console.log('Background: All activeTabs keys:', Array.from(activeTabs.keys()));
      console.log('Background: All analysisInProgress values:', Array.from(analysisInProgress));
      
      const response = { 
        inProgress: analysisInProgress.has(tabId),
        hasAnalysis: tabState?.hasAnalysis || false,
        analysisInProgress: tabState?.analysisInProgress || false,
        queued: tabState?.analysisQueued || false,
        queuePosition: analysisQueue.findIndex(item => item.tabId === tabId) + 1
      };
      console.log('Background: Sending response:', response);
      sendResponse(response);
      return true;
    }
    
    // Handle analysis status messages from popup (these don't have sender.tab)
    if (request.action === 'analysisStarted' && request.tabId) {
      // Handle analysis started notification from popup
      console.log('Background: Analysis requested for tabId:', request.tabId, 'URL:', request.url);
      console.log('Background: Current queue size:', analysisQueue.length, 'analysisInProgress size:', analysisInProgress.size);
      
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
      
      console.log('Background: Updated tab state for analysis request:', newTabState);
      console.log('Background: After queue update - queue size:', analysisQueue.length, 'analysisInProgress size:', analysisInProgress.size);
      
      sendResponse({ success: true, queued: true });
      return true;
    } else if (request.action === 'analysisComplete' && request.tabId) {
      // Handle analysis completed notification from popup
      console.log('Background: Analysis completed for tabId:', request.tabId);
      
      // Update tab state to show analysis is complete
      const currentTabState = activeTabs.get(request.tabId) || {};
      const newTabState = {
        ...currentTabState,
        url: request.url,
        hasAnalysis: request.hasResults || true,
        analysisInProgress: false,
        analysisTimestamp: Date.now(),
        lastUpdated: Date.now()
      };
      activeTabs.set(request.tabId, newTabState);
      analysisInProgress.delete(request.tabId);
      
      console.log('Background: Updated tab state for analysis completion:', newTabState);
      console.log('Background: analysisInProgress size after delete:', analysisInProgress.size);
      
      sendResponse({ success: true });
      return true;
    } else if (request.action === 'analysisError' && request.tabId) {
      // Handle analysis error notification from popup
      console.log('Background: Analysis error for tabId:', request.tabId, 'Error:', request.error);
      
      // Update tab state to show analysis failed
      const currentTabState = activeTabs.get(request.tabId) || {};
      const newTabState = {
        ...currentTabState,
        url: request.url,
        analysisInProgress: false,
        lastError: request.error,
        lastUpdated: Date.now()
      };
      activeTabs.set(request.tabId, newTabState);
      analysisInProgress.delete(request.tabId);
      
      console.log('Background: Updated tab state for analysis error:', newTabState);
      console.log('Background: analysisInProgress size after error:', analysisInProgress.size);
      
      sendResponse({ success: true });
      return true;
    }
    
    // Check if sender and sender.tab exist for tab-specific actions
    if (!sender) {
      console.warn('Message received without sender:', request);
      sendResponse({ error: 'No sender information' });
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
        // Show badge indicator for manual analysis
        chrome.action.setBadgeText({ text: '...' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF9800' });
        
        // Start the analysis
        triggerPDFAnalysis(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error starting manual analysis:', error);
        sendResponse({ error: error.message });
      }
    } else {
      console.log('Unknown message action:', request.action);
      sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
  }
  return true;
});

// Keep the service worker alive
chrome.runtime.onConnect.addListener((port) => {
  port.onDisconnect.addListener(() => {
    // Clean up any resources if needed
  });
}); 