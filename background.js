// Import configuration and smart backend detection
importScripts('config.js');

// Keep track of active tabs and their states
let activeTabs = new Map();
let analysisInProgress = new Set(); // Track which tabs are being analyzed

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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === 'checkAnalysisStatus') {
    handleCheckAnalysisStatus(request, sendResponse);
    return true;
  }
});

// Function to handle analysis status checks
function handleCheckAnalysisStatus(request, sendResponse) {
  const tabId = request.tabId;
  const tabState = activeTabs.get(tabId);
  
  if (tabState) {
    sendResponse({
      inProgress: tabState.analysisInProgress || false,
      hasAnalysis: !!tabState.lastAnalysis,
      analysisInProgress: tabState.analysisInProgress || false
    });
  } else {
    sendResponse({ inProgress: false, hasAnalysis: false, analysisInProgress: false });
  }
}

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
      activeTabs.set(tabId, {
        url: tab.url,
        lastUpdated: Date.now()
      });
      
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

// Function to automatically trigger PDF analysis
async function triggerPDFAnalysis(tabId) {
  try {
    // Check if analysis is already in progress for this tab
    if (analysisInProgress.has(tabId)) {
      console.log(`Analysis already in progress for tab ${tabId}`);
      return;
    }
    
    console.log(`Triggering automatic analysis for tab ${tabId}`);
    analysisInProgress.add(tabId);
    
    // Update tab state to show analysis is in progress
    activeTabs.set(tabId, {
      ...activeTabs.get(tabId),
      analysisInProgress: true,
      analysisStartTime: Date.now()
    });

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

    // Store the analysis results
    await chrome.storage.local.set({
      lastAnalysis: {
        timestamp: new Date().toISOString(),
        url: response.content.paperUrl || response.content.paperId,
        title: response.content.title || 'PDF Document',
        content: response.content,
        summary: data.summary,
        autoAnalyzed: true
      }
    });

    console.log('PDF analysis completed and stored');
    
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
    // Clear badge on error
    chrome.action.setBadgeText({ text: '' });
  } finally {
    // Always remove from in-progress set
    analysisInProgress.delete(tabId);
  }
}

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  analysisInProgress.delete(tabId);
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    // Handle messages that don't require a tab context
    if (request.action === 'getConfig' || request.action === 'ping') {
      sendResponse({ success: true, config: { version: '1.0' } });
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
    } else if (request.action === 'checkAnalysisStatus') {
      // Check if analysis is in progress for a tab
      const tabState = activeTabs.get(tabId);
      sendResponse({ 
        inProgress: analysisInProgress.has(tabId),
        hasAnalysis: tabState?.hasAnalysis || false,
        analysisInProgress: tabState?.analysisInProgress || false
      });
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