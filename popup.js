document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
  // Helper function to build fullpage URL with scholar parameters
  async function buildFullpageUrl(paperId, additionalParams = {}) {
    const baseUrl = chrome.runtime.getURL('fullpage.html');
    const params = new URLSearchParams();
    
    if (paperId) {
      params.set('paperID', paperId);
    }
    
    // Get current scholar URL from settings
    const settings = await chrome.storage.local.get(['userSettings']);
    const currentScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
    
    // Add scholar parameter
    params.set('scholar', currentScholarUrl);
    
    // Add any additional parameters
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, value);
      }
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
  
  async function setAnalysisStatus(paperId, status, errorMessage = null) {
    console.log('Setting analysis status:', { paperId, status, errorMessage });
    const now = new Date().toISOString();
    const update = {
      status,
      updatedAt: now,
      paperId: paperId
    };
    if (status === 'in_progress') {
      update.startedAt = now;
    } else if (status === 'complete' || status === 'error') {
      update.finishedAt = now;
    }
    if (errorMessage) {
      update.errorMessage = errorMessage;
    }
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    allStatus[paperId] = update;
    await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
    console.log('Analysis status set successfully:', update);
  }
  
  async function getAnalysisStatus(paperId) {
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    return allStatus[paperId] || null;
  }
  
  // Function to check and monitor analysis status using local storage
  async function checkAndMonitorAnalysisStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        console.log('No tab or URL found for status monitoring');
        return;
      }
      
      const paperId = await extractSsrnIdOrUrl(tab.url);
      if (!paperId) {
        console.log('No paper ID found for status monitoring');
        return;
      }
      
      console.log('Checking analysis status for paper ID:', paperId);
      const status = await getAnalysisStatus(paperId);
      console.log('Current analysis status:', status);
      
      // Always hide/disable View Analysis button unless status is complete
      setButtonState('Deep Read!', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      analyzeBtn.onclick = analyzePaper;

      if (!status) {
        // No local status, check backend
        const backendHasAnalysis = await checkAnalysisOnBackend(paperId);
        if (backendHasAnalysis) {
          showStatus('Analysis exists for this paper! Click "View Analysis" to see results.', 'success');
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
          return;
        } else {
          showStatus('Analysis has not been done for this paper.', 'info');
          setButtonState('Deep Read!', false, false);
          analyzeBtn.style.backgroundColor = '#2196F3';
          analyzeBtn.onclick = analyzePaper;
          return;
        }
      }
      
      // Check if the status is stale (older than 5 minutes)
      const now = new Date().getTime();
      const startedAt = new Date(status.startedAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (status.status === 'in_progress' && now - startedAt > fiveMinutes) {
        console.log('Found stale in_progress status, clearing...');
        await clearStaleAnalysisStatus();
        // Check backend before showing timeout error
        const backendHasAnalysis = await checkAnalysisOnBackend(paperId);
        if (backendHasAnalysis) {
          showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
          return;
        }
        // If backend does not have analysis, show not done message
        showStatus('Analysis has not been done for this paper.', 'info');
        setButtonState('Deep Read!', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.onclick = analyzePaper;
        return;
      }
      
      if (status.status === 'complete') {
        console.log('Analysis is complete, checking for results...');
        const hasResult = await checkForExistingAnalysis();
        if (hasResult) {
          showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
        } else {
          setButtonState('Deep Read!', false, false);
          analyzeBtn.style.backgroundColor = '#2196F3';
          analyzeBtn.onclick = analyzePaper;
          showStatus('Analysis complete, but no results found. Please try again.', 'error');
        }
        return;
      }
      
      if (status.status === 'in_progress') {
        console.log('Analysis in progress, starting monitoring...');
        if (status && status.status === 'in_progress') {
          // Only show in progress if there is a previous status or backend analysis
          const backendHasAnalysis = await checkAnalysisOnBackend(paperId);
          if (backendHasAnalysis) {
            showStatus('Analysis exists for this paper! Click "View Analysis" to see results.', 'success');
            setButtonState('View Analysis', false, false);
            analyzeBtn.style.backgroundColor = '#4CAF50';
            analyzeBtn.onclick = async () => {
              const fullpageUrl = await buildFullpageUrl(paperId);
              chrome.tabs.create({ url: fullpageUrl });
            };
            return;
          }
          // Only show in progress if there is a previous status (i.e., not a new paper)
          if (!status.startedAt) {
            // No previous analysis, do not show in progress
            setButtonState('Deep Read!', true, false);
            analyzeBtn.style.backgroundColor = '#ccc';
            analyzeBtn.onclick = null;
            return;
          }
          showStatus('Analysis in progress for this paper. Monitoring for completion... Please do not close this popup.', 'progress');
          setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
          analyzeBtn.style.backgroundColor = '#FF9800';
        }
        
        let monitorStartTime = Date.now();
        const monitorTimeout = 5 * 60 * 1000; // 5 minutes timeout
        
        // Start monitoring for status changes
        const monitorInterval = setInterval(async () => {
          try {
            // Check if we've exceeded the timeout
            if (Date.now() - monitorStartTime > monitorTimeout) {
              console.log('Analysis monitoring timed out');
              clearInterval(monitorInterval);
              await clearStaleAnalysisStatus();
              showStatus('Analysis timed out. Please try again.', 'error');
              setButtonState('Deep Read!', false, false);
              analyzeBtn.style.backgroundColor = '#2196F3';
              analyzeBtn.onclick = analyzePaper;
              return;
            }
            
            const currentStatus = await getAnalysisStatus(paperId);
            console.log('Current status check result:', currentStatus);
            
            // First check if analysis is available on backend
            const backendHasAnalysis = await checkAnalysisOnBackend(paperId);
            if (backendHasAnalysis) {
              clearInterval(monitorInterval);
              showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
              setButtonState('View Analysis', false, false);
              analyzeBtn.style.backgroundColor = '#4CAF50';
              analyzeBtn.onclick = async () => {
                const fullpageUrl = await buildFullpageUrl(paperId);
                chrome.tabs.create({ url: fullpageUrl });
              };
              return;
            }
            
            if (!currentStatus || currentStatus.status === 'error') {
              clearInterval(monitorInterval);
              showStatus('Analysis failed: ' + (currentStatus?.errorMessage || 'Unknown error'), 'error');
              setButtonState('Deep Read!', false, false);
              analyzeBtn.style.backgroundColor = '#2196F3';
              analyzeBtn.onclick = analyzePaper;
              return;
            }
            
            if (currentStatus.status === 'complete') {
              clearInterval(monitorInterval);
              const hasResult = await checkForExistingAnalysis();
              if (hasResult) {
                showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
                setButtonState('View Analysis', false, false);
                analyzeBtn.style.backgroundColor = '#4CAF50';
                analyzeBtn.onclick = async () => {
                  const fullpageUrl = await buildFullpageUrl(paperId);
                  chrome.tabs.create({ url: fullpageUrl });
                };
              } else {
                // If local storage says complete but no results, check backend one more time
                const backendRecheck = await checkAnalysisOnBackend(paperId);
                if (backendRecheck) {
                  showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
                  setButtonState('View Analysis', false, false);
                  analyzeBtn.style.backgroundColor = '#4CAF50';
                  analyzeBtn.onclick = async () => {
                    const fullpageUrl = await buildFullpageUrl(paperId);
                    chrome.tabs.create({ url: fullpageUrl });
                  };
                } else {
                  setButtonState('Deep Read!', false, false);
                  analyzeBtn.style.backgroundColor = '#2196F3';
                  analyzeBtn.onclick = analyzePaper;
                  showStatus('Analysis complete, but no results found. Please try again.', 'error');
                }
              }
            }
          } catch (error) {
            console.error('Error monitoring analysis status:', error);
            clearInterval(monitorInterval);
            showStatus('Error monitoring analysis status. Please try again.', 'error');
            setButtonState('Deep Read!', false, false);
            analyzeBtn.style.backgroundColor = '#2196F3';
            analyzeBtn.onclick = analyzePaper;
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error checking analysis status:', error);
      showStatus('Error checking analysis status. Please try again.', 'error');
      setButtonState('Deep Read!', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      analyzeBtn.onclick = analyzePaper;
    }
  }
  
  // Function to restore analysis state if in progress (reconnected to background script)
  async function restoreAnalysisState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // First check local storage status
      const paperId = await extractSsrnIdOrUrl(tab.url);
      if (paperId) {
        const localStatus = await getAnalysisStatus(paperId);
        if (localStatus && localStatus.status === 'in_progress') {
          console.log('Local storage shows analysis in progress, starting monitoring...');
          // Start monitoring for completion
          checkAndMonitorAnalysisStatus();
          return;
        }
      }

      // If no local status, check background script status
      const status = await checkAnalysisStatus(tab.id);
      
      if (status.inProgress || status.analysisInProgress) {
        console.log('Background script shows analysis in progress, setting local status...');
        
        // Set local status to in progress and start monitoring
        if (tab.url) {
          const paperId = await extractSsrnIdOrUrl(tab.url);
          if (paperId) {
            await setAnalysisStatus(paperId, 'in_progress');
            checkAndMonitorAnalysisStatus();
          }
        }
      } else if (status.hasAnalysis) {
        // Background script indicates analysis exists for this tab
        console.log('Background script indicates analysis exists for this tab');
        
        // Check for recent completed analysis in storage
        const hasExistingAnalysis = await checkForExistingAnalysis();
        if (hasExistingAnalysis) {
          console.log('Analysis results found in storage, UI should be updated by checkForExistingAnalysis');
        } else {
          // If storage doesn't have it, still show the View Analysis button
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) return;
            const paperId = await extractSsrnIdOrUrl(tab.url);
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
          showStatus('Analysis complete for this paper! Click "View Analysis" to see results.', 'success');
        }
      }
    } catch (error) {
      console.error('Error restoring analysis state:', error);
    }
  }
  // Get DOM elements using new IDs
  const analyzeBtn = document.getElementById('analyze-btn');
  const homeBtn = document.getElementById('home-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const analyzeAuthorsBtn = document.getElementById('analyze-authors-btn');
  const statusContainer = document.getElementById('status-container');

  // Function to show progress (simplified for new design)
  function showProgress(step, message) {
    showStatus(message, 'progress');
    
    // Show progress container
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'block';
      
      // Update progress bar
      const progressFill = progressContainer.querySelector('.progress-fill');
      const progressSteps = progressContainer.querySelectorAll('.progress-steps .step');
      
      if (progressFill) {
        const progressPercent = (step / 3) * 100;
        progressFill.style.width = `${progressPercent}%`;
      }
      
      // Update step indicators
      progressSteps.forEach((stepElement, index) => {
        stepElement.classList.remove('active', 'completed');
        if (index < step - 1) {
          stepElement.classList.add('completed');
        } else if (index === step - 1) {
          stepElement.classList.add('active');
        }
      });
    }
  }

  // Function to hide progress (simplified for new design)
  function hideProgress() {
    clearStatus();
    
    // Hide progress container
    const progressContainer = document.getElementById('progress-container');
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
  }

  // Function to set button state
  function setButtonState(text, disabled = false, showIcon = false) {
    if (analyzeBtn) {
      const textElement = analyzeBtn.querySelector('.button-text');
      const iconElement = analyzeBtn.querySelector('.button-icon');
      
      if (textElement) textElement.textContent = text;
      analyzeBtn.disabled = disabled;
      if (iconElement) iconElement.style.display = showIcon ? 'inline' : 'none';
    }
  }

  // Function to set authors button state
  function setAuthorsButtonState(text, disabled = false, showIcon = false) {
    if (analyzeAuthorsBtn) {
      const textElement = analyzeAuthorsBtn.querySelector('.button-text');
      const iconElement = analyzeAuthorsBtn.querySelector('.button-icon');
      
      if (textElement) textElement.textContent = text;
      analyzeAuthorsBtn.disabled = disabled;
      if (iconElement) iconElement.style.display = showIcon ? 'inline' : 'none';
    }
  }

  // Function to show/hide authors button
  function showAuthorsButton(show = true) {
    if (analyzeAuthorsBtn) {
      analyzeAuthorsBtn.style.display = show ? 'block' : 'none';
    }
  }

  function showFullpageButton(show = true) {
    const fullpageBtn = document.getElementById('fullpage-btn');
    console.log('showFullpageButton: show =', show, 'fullpageBtn =', fullpageBtn);
    if (fullpageBtn) {
      fullpageBtn.style.display = show ? 'block' : 'none';
      console.log('showFullpageButton: Set display to', fullpageBtn.style.display);
    } else {
      console.error('showFullpageButton: fullpage-btn element not found!');
    }
  }

  // Function to show status messages
  function showStatus(message, type = 'info') {
    if (statusContainer) {
      statusContainer.innerHTML = `
        <div class="status-message ${type}">
          ${message}
        </div>
      `;
    }
  }

  // Function to clear status messages
  function clearStatus() {
    if (statusContainer) {
      statusContainer.innerHTML = '';
    }
  }

  // Function to inject content script if needed
  async function ensureContentScript(tabId) {
    try {
      // First check if content script is already injected
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        console.log('Content script already injected, skipping injection');
        return;
      } catch (error) {
        // Content script not injected, proceed with injection
        console.log('Content script not found, injecting...');
      }
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      console.log('Content script injected successfully');
    } catch (error) {
      console.log('Content script injection failed:', error);
      // Don't throw error, just log it
    }
  }

  // Function to check for existing analysis (only called when user explicitly requests analysis)
  async function checkForExistingAnalysis() {
    try {
      // Get the current active tab to check for tab-specific analysis
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        console.log('No active tab found for analysis check');
        return false;
      }

      // Check for tab-specific analysis results
      const result = await chrome.storage.local.get(['analysisResults']);
      const allResults = result.analysisResults || {};
      
      // Look for analysis results for this specific tab URL
      const tabAnalysis = allResults[tab.url];
      if (tabAnalysis) {
        console.log('Found existing analysis for this tab:', tabAnalysis);
        
        // Check if this analysis is recent (within last 5 minutes)
        const analysisTime = new Date(tabAnalysis.timestamp);
        const now = new Date();
        const timeDiff = now - analysisTime;
        const isRecent = timeDiff < 5 * 60 * 1000; // 5 minutes
        
        if (isRecent) {
          // Show that analysis exists and offer to view it
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url) return;
            const paperId = await extractSsrnIdOrUrl(tab.url);
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
          
          showStatus('DONE: Analysis already exists for this paper! Click "View Analysis" to see results.', 'success');
          return true; // Indicate that analysis exists
        } else {
          console.log('Analysis exists but is too old, removing from storage');
          // Remove old analysis from storage
          delete allResults[tab.url];
          await chrome.storage.local.set({ analysisResults: allResults });
        }
      }
      
      // Also check legacy global lastAnalysis for backward compatibility
      const legacyResult = await chrome.storage.local.get(['lastAnalysis']);
      if (legacyResult.lastAnalysis) {
        const analysis = legacyResult.lastAnalysis;
        console.log('Found legacy analysis:', analysis);
        
        // Check if this analysis is for the current tab
        if (analysis.url === tab.url) {
          const analysisTime = new Date(analysis.timestamp);
          const now = new Date();
          const timeDiff = now - analysisTime;
          const isRecent = timeDiff < 5 * 60 * 1000; // 5 minutes
          
          if (isRecent) {
            // Migrate to new storage format
            const newResults = allResults || {};
            newResults[tab.url] = analysis;
            await chrome.storage.local.set({ analysisResults: newResults });
            
            // Show that analysis exists and offer to view it
            setButtonState('View Analysis', false, false);
            analyzeBtn.style.backgroundColor = '#4CAF50';
            analyzeBtn.onclick = async () => {
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (!tab || !tab.url) return;
              const paperId = await extractSsrnIdOrUrl(tab.url);
              const fullpageUrl = await buildFullpageUrl(paperId);
              chrome.tabs.create({ url: fullpageUrl });
            };
            
            showStatus('DONE: Analysis already exists for this paper! Click "View Analysis" to see results.', 'success');
            return true;
          }
        }
      }
      
      return false; // No recent analysis found for this tab
    } catch (error) {
      console.error('Error checking for existing analysis:', error);
      return false;
    }
  }

  // Function to check analysis status from background script (legacy - not used for status monitoring)
  async function checkAnalysisStatus(tabId) {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'checkAnalysisStatus',
        tabId: tabId 
      });
      return response || { inProgress: false, hasAnalysis: false, analysisInProgress: false };
    } catch (error) {
      console.error('Error checking analysis status:', error);
      return { inProgress: false, hasAnalysis: false, analysisInProgress: false };
    }
  }

  // Function to restore analysis state if in progress
  async function restoreAnalysisState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const status = await checkAnalysisStatus(tab.id);
      
      if (status.inProgress || status.analysisInProgress) {
        console.log('Analysis in progress detected, restoring UI state');
        
        // Show that analysis is in progress
        setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
        showProgress(2, 'Analysis in progress. Please wait... Do not close this popup.');
        
        // Set up monitoring to check for completion
        monitorAnalysisProgress(tab.id).catch(error => {
          console.error('Error in analysis monitoring:', error);
        });
      } else if (status.queued) {
        console.log('Analysis queued detected, restoring UI state');
        
        // Show that analysis is queued
        setButtonState('Queued...', true, true);
        const queueMsg = status.queuePosition > 0 
          ? `Analysis queued. Position: ${status.queuePosition}. Please wait...`
          : 'Analysis queued. Please wait...';
        showProgress(1, queueMsg);
        
        // Set up monitoring to check for completion
        monitorAnalysisProgress(tab.id).catch(error => {
          console.error('Error in analysis monitoring:', error);
        });
      } else if (status.hasAnalysis) {
        // Check for recent completed analysis
        const hasExistingAnalysis = await checkForExistingAnalysis();
        if (!hasExistingAnalysis) {
          // No recent analysis in storage, but background script says we have one
          console.log('Background script indicates analysis exists, but not in storage');
        }
      }
    } catch (error) {
      console.error('Error restoring analysis state:', error);
    }
  }

  // Function to monitor analysis progress and update UI when complete
  async function monitorAnalysisProgress(tabId, paperId, isPdf = false) {
    console.log('[POPUP] Starting background monitoring for paper:', paperId, 'tab:', tabId);
    
    try {
      // Use global backend instead of tab-specific
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        console.error('[POPUP] No backend available for monitoring');
        return;
      }
      
      // Start monitoring in background script
      const response = await chrome.runtime.sendMessage({
        action: 'startMonitoring',
        paperId: paperId,
        tabId: tabId,
        backend: backend
      });
      
      if (response.success) {
        console.log('[POPUP] Background monitoring started successfully');
        showProgress(1, 'Analysis in progress. Monitoring in background... Do not close this popup.');
      } else {
        console.error('[POPUP] Failed to start background monitoring');
      }
      
    } catch (error) {
      console.error('[POPUP] Error starting background monitoring:', error);
    }
  }

  // Function to stop analysis monitoring
  async function stopAnalysisMonitoring(paperId) {
    try {
      await chrome.runtime.sendMessage({
        action: 'stopMonitoring',
        paperId: paperId
      });
      console.log('[POPUP] Background monitoring stopped for paper:', paperId);
    } catch (error) {
      console.error('[POPUP] Error stopping background monitoring:', error);
    }
  }

  // Function to check if monitoring is active
  async function getMonitoringStatus(paperId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getMonitoringStatus',
        paperId: paperId
      });
      return response.status;
    } catch (error) {
      console.error('[POPUP] Error getting monitoring status:', error);
      return null;
    }
  }

  // Helper: perform SSE analysis with progress callback
  async function analyzeWithSmartBackendStream(payload, progressCallback = () => {}) {
    try {
      const finalData = await makeStreamRequest(CONFIG.ANALYZE_STREAM_ENDPOINT, payload, (eventData) => {
        if (!eventData) return;
        // Map backend events to checklist updates
        if (eventData.section) {
          if (eventData.status === 'junior_start') {
            updateTaskStatus(eventData.section, 'in_progress');
          } else if (eventData.status === 'junior_done' || eventData.status === 'authors_extracted') {
            updateTaskStatus(eventData.section, 'done');
          }
        } else if (eventData.status === 'extracting_pdf') {
          updateTaskStatus('PDF Extraction', 'in_progress');
        } else if (eventData.status === 'pdf_extracted') {
          updateTaskStatus('PDF Extraction', 'done');
        } else if (eventData.status === 'analyzing') {
          // high-level analyze step
          updateTaskStatus('Analysis', 'in_progress');
        } else if (eventData.status === 'done') {
          updateTaskStatus('Analysis', 'done');
        }

        // Forward message to generic progress handler
        if (eventData.message) progressCallback(eventData.message);
      });
      return finalData;
    } catch (error) {
      console.error('Popup: Streaming analysis failed:', error);
      throw error;
    }
  }

  // Function to analyze paper
  async function analyzePaper() {
    try {
      if (UnderAnalysis) {
        console.log('analyzePaper called while UnderAnalysis = 1; ignoring duplicate click');
        return;
      }
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        showStatus('No active tab found', 'error');
        return;
      }

      const isPdf = tab.url.toLowerCase().endsWith('.pdf');
      
      // Skip this function for PDFs - they are handled directly in updatePopupUI
      if (isPdf) {
        console.log('analyzePaper: PDF detected, but PDF analysis is handled in updatePopupUI. Skipping.');
        return;
      }

      UnderAnalysis = 1;

      // Extract paper ID (fallback to filename for PDFs)
      const paperId = (await extractSsrnIdOrUrl(tab.url)) || tab.url.split('/').pop();
      
      // Update UI to show analysis is starting
      await setAnalysisStatus(paperId, 'in_progress');
      showStatus('Analysis in progress for this paper... Please do not close this popup.', 'progress');
      setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
      analyzeBtn.style.backgroundColor = '#FF9800';

      // Use background script workflow for HTML SSRN pages
      await chrome.runtime.sendMessage({
        action: 'analysisStarted',
        tabId: tab.id,
        url: tab.url
      });
      // Start monitoring progress via storage
      checkAndMonitorAnalysisStatus();
    } catch (error) {
      console.error('Error in analyzePaper:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      // Get the current tab URL for status cleanup
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const paperId = await extractSsrnIdOrUrl(tab.url);
          if (paperId) {
            // Set error status
            await setAnalysisStatus(paperId, 'error', errorMessage);
            
            // Clear the status
            const storage = await chrome.storage.local.get([STATUS_KEY]);
            const allStatus = storage[STATUS_KEY] || {};
            delete allStatus[paperId];
            await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
          }
        }
      } catch (e) {
        console.error('Error cleaning up analysis status:', e);
      }

      showStatus('Analysis failed: ' + errorMessage, 'error');
      setButtonState('Deep Read!', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      analyzeBtn.onclick = analyzePaper;
    }
  }

  // Display backend status
  function displayBackendStatus(message = '🔍 Checking Version...') {
    const statusDiv = document.getElementById('backend-status');
    if (statusDiv) {
      statusDiv.innerHTML = `<div class="info">${message}</div>`;
    }
  }

  // Update configuration status display
  async function updateConfigurationStatus() {
    const configStatusDiv = document.getElementById('config-status');
    if (!configStatusDiv) return;
    
    try {
      const result = await chrome.storage.local.get(['llmSettings']);
      const settings = result.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      const model = settings.model;
      let hasValidConfig = false;
      
      // Check if user has configured appropriate API key for selected model
      if (model.startsWith('gemini-') && settings.geminiKey) {
        hasValidConfig = true;
      } else if (model.startsWith('gpt-') && settings.openaiKey) {
        hasValidConfig = true;
      } else if (model.startsWith('claude-') && settings.claudeKey) {
        hasValidConfig = true;
      }
      
      if (hasValidConfig) {
        configStatusDiv.style.display = 'none';
      } else {
        configStatusDiv.style.display = 'block';
        const modelType = model.startsWith('gemini-') ? 'Google AI' : 
                         model.startsWith('gpt-') ? 'OpenAI' : 
                         model.startsWith('claude-') ? 'Claude' : 'LLM';
        configStatusDiv.innerHTML = `<div class="warning">⚠️ Please configure your ${modelType} API key in Settings</div>`;
      }
    } catch (error) {
      console.error('Error checking configuration status:', error);
    }
  }

  // Update backend status display - REMOVED DUPLICATE (kept final version at end of file)

  // Debug function to show current storage state
  async function debugStorageState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('=== STORAGE DEBUG ===');
      console.log('Current tab URL:', tab?.url);
      
      const storage = await chrome.storage.local.get(['analysisResults', 'authorAnalysisResults', 'lastAnalysis', 'lastAuthorAnalysis']);
      console.log('All analysis results:', storage.analysisResults);
      console.log('All author analysis results:', storage.authorAnalysisResults);
      console.log('Legacy lastAnalysis:', storage.lastAnalysis);
      console.log('Legacy lastAuthorAnalysis:', storage.lastAuthorAnalysis);
      
      if (tab?.url && storage.analysisResults) {
        console.log('Analysis for current tab:', storage.analysisResults[tab.url]);
      }
      console.log('=== END STORAGE DEBUG ===');
    } catch (error) {
      console.error('Error debugging storage:', error);
    }
  }

  // Function to check if current tab is a PDF and set up the UI accordingly
  async function checkPageType() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('checkPageType: Current tab URL:', tab.url);
      
      // Check if it's a PDF page using multiple criteria
      const isPDF = await checkIfPDFPage(tab);
      console.log('checkPageType: Is PDF page?', isPDF);
      
      // Check if it's an SSRN page
      const isSSRN = tab.url && tab.url.includes('ssrn.com');
      console.log('checkPageType: Is SSRN page?', isSSRN);

      if (isPDF && isSSRN) {
        // PDF detected on SSRN page - show guidance to user
        console.log('checkPageType: PDF detected on SSRN page - showing guidance');
        console.log('checkPageType: Tab URL:', tab.url);
        const fileName = tab.url.split('/').pop() || 'PDF file';
        
        showStatus(`📄 Local PDF File Detected: ${fileName}`, 'info');
        
        // Hide the main analyze button and show fullpage button instead
        setButtonState('Deep Read!', true, false); // Disable main button
        analyzeBtn.style.backgroundColor = '#ccc'; // Gray out main button
        analyzeBtn.style.cursor = 'not-allowed'; // Show disabled cursor
        showAuthorsButton(false); // Hide authors button for local PDFs
        
        // Show the full page interface button prominently
        showFullpageButton(true);
        
        console.log('checkPageType: Main analyze button disabled, fullpage button shown');
      } else if (!isPDF && isSSRN) {
        // SSRN page without PDF: disable main analyze button, enable authors button
        setButtonState('Deep Read!', true, false); // Disable main button
        analyzeBtn.style.backgroundColor = '#ccc';
        showAuthorsButton(true);
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
        return;
      }
      
      if (tab.url && tab.url.includes('ssrn.com')) {
        // SSRN page detected - only show author analysis option
        console.log('checkPageType: SSRN detected - disabling paper analysis, showing author analysis');
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
        setButtonState('Deep Read!', true, false); // Disable paper analysis button
        analyzeBtn.style.backgroundColor = '#ccc'; // Gray out the button
        
        // Show only authors button for SSRN pages
        showAuthorsButton(true);
        setAuthorsButtonState('Analyze Authors', false, false);
        analyzeAuthorsBtn.style.backgroundColor = '#9C27B0';
        showFullpageButton(false); // Hide fullpage button
        
      } else {
        // Not a supported page
        console.log('checkPageType: Unsupported page - disabling both buttons');
        showStatus('Navigate to an SSRN paper (for author analysis) or open a PDF file (for paper analysis).', 'info');
        setButtonState('Deep Read!', true, false); // Disable button
        analyzeBtn.style.backgroundColor = '#ccc';
        showAuthorsButton(false); // Hide authors button for unsupported pages
        showFullpageButton(false); // Hide fullpage button
      }
    } catch (error) {
      console.error('Error checking page type:', error);
      showStatus('Error checking page status. Please try again.', 'error');
      showAuthorsButton(false);
    }
  }

  // Function to check if a tab contains a PDF using multiple detection methods
  async function checkIfPDFPage(tab) {
    try {
      console.log('[PDF DEBUG] Checking PDF for URL:', tab.url);
      console.log('[PDF DEBUG] Tab title:', tab.title);
      
      // Method 1: Check URL patterns
      const urlPatterns = [
        tab.url.toLowerCase().endsWith('.pdf'),
        tab.url.startsWith('file:///'),
        tab.url.includes('pdf') && (tab.url.includes('viewer') || tab.url.includes('download')),
        tab.url.includes('application/pdf'),
        tab.url.includes('content-type=application/pdf'),
        // Common academic PDF URL patterns
        /arxiv\.org\/pdf\//.test(tab.url),
        /researchgate\.net.*\/publication\/.*\//.test(tab.url),
        /\.edu\/.*\/pdf\//.test(tab.url),
        /\/pdf\//.test(tab.url) && !tab.url.includes('html'), // Generic /pdf/ pattern but not HTML pages
        tab.url.includes('/pdf/') || tab.url.includes('/PDF/') // Simple PDF path check
      ];
      
      console.log('[PDF DEBUG] URL pattern checks:', {
        'ends with .pdf': tab.url.toLowerCase().endsWith('.pdf'),
        'starts with file:///': tab.url.startsWith('file:///'),
        'has pdf + viewer/download': tab.url.includes('pdf') && (tab.url.includes('viewer') || tab.url.includes('download')),
        'has application/pdf': tab.url.includes('application/pdf'),
        'has content-type=application/pdf': tab.url.includes('content-type=application/pdf'),
        'arxiv.org/pdf/': /arxiv\.org\/pdf\//.test(tab.url),
        'researchgate publication': /researchgate\.net.*\/publication\/.*\//.test(tab.url),
        'edu domain with /pdf/': /\.edu\/.*\/pdf\//.test(tab.url),
        'generic /pdf/ pattern': /\/pdf\//.test(tab.url) && !tab.url.includes('html'),
        'simple PDF path check': tab.url.includes('/pdf/') || tab.url.includes('/PDF/')
      });
      
      if (urlPatterns.some(pattern => pattern)) {
        console.log('[PDF DEBUG] PDF detected via URL pattern - SUCCESS');
        return true;
      }
      
      // Method 2: Check content type via content script
      try {
        console.log('[PDF DEBUG] Trying content type check via content script...');
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkContentType' });
        console.log('[PDF DEBUG] Content type response:', response);
        if (response && response.contentType === 'application/pdf') {
          console.log('[PDF DEBUG] PDF detected via content type - SUCCESS');
          return true;
        }
      } catch (error) {
        console.log('[PDF DEBUG] Content type check failed:', error.message);
      }
      
      // Method 3: Check for PDF elements in the page
      try {
        console.log('[PDF DEBUG] Trying PDF elements check via content script...');
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkPDFElements' });
        console.log('[PDF DEBUG] PDF elements response:', response);
        if (response && response.hasPDFElements) {
          console.log('[PDF DEBUG] PDF detected via page elements - SUCCESS');
          return true;
        }
      } catch (error) {
        console.log('[PDF DEBUG] PDF elements check failed:', error.message);
      }
      
      // Method 4: Check if the page title suggests it's a PDF
      const title = tab.title || '';
      if (title.toLowerCase().includes('pdf') || title.toLowerCase().includes('document')) {
        console.log('[PDF DEBUG] PDF suggested by title:', title);
        // This is a weaker indicator, so we'll log it but not return true immediately
      }
      
      console.log('[PDF DEBUG] Final result: PDF detection FAILED');
      return false;
    } catch (error) {
      console.error('Error checking if page is PDF:', error);
      return false;
    }
  }

  // Test function to compare ID generation
  async function testIdGeneration(url) {
    console.log('🧪 TESTING ID GENERATION FOR:', url);
    
    // Test SharedIdGenerator directly
    try {
      const sharedId = await SharedIdGenerator.generateIdFromUrl(url);
      console.log('🧪 SharedIdGenerator result:', sharedId);
      
      // Test backend ID generation via message
      const bgResponse = await chrome.runtime.sendMessage({ action: 'testPaperId', url: url });
      console.log('🧪 Background result:', bgResponse);
      
      if (sharedId === bgResponse.paperId) {
        console.log('✅ IDs MATCH!');
      } else {
        console.log('❌ IDs DO NOT MATCH!');
        console.log('   SharedIdGenerator:', sharedId);
        console.log('   Background:', bgResponse.paperId);
      }
    } catch (error) {
      console.error('🧪 Test failed:', error);
    }
  }

  // Use shared ID generator for consistent paper ID generation
  async function extractSsrnIdOrUrl(url) {
    if (!url) return null;
    
    console.log('[POPUP ID DEBUG] Input URL:', url);
    
    // Add test call
    await testIdGeneration(url);
    
    // Use the shared ID generator which matches backend logic
    try {
      const paperId = await SharedIdGenerator.generateIdFromUrl(url);
      console.log('[POPUP ID DEBUG] Generated paperId:', paperId);
      return paperId;
    } catch (error) {
      console.error('[POPUP ID DEBUG] Error generating paper ID:', error);
      // Fallback to simple SSRN ID extraction
      const match = url.match(/[?&]abstract(?:_?id)?=(\d+)/i);
      const fallbackId = match ? match[1] : url;
      console.log('[POPUP ID DEBUG] Fallback paperId:', fallbackId);
      return fallbackId;
    }
  }

  // Event listeners - removed permanent analyzePaper listener since we set onclick dynamically in updatePopupUI
  
  if (analyzeAuthorsBtn) {
    analyzeAuthorsBtn.addEventListener('click', analyzeAuthors);
  }
  
  const fullpageBtn = document.getElementById('fullpage-btn');
  if (fullpageBtn) {
    fullpageBtn.addEventListener('click', async function() {
      // Get current tab to pass local file info if available
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab && tab.url && tab.url.startsWith('file:///') 
        ? chrome.runtime.getURL('fullpage.html') + '?localFile=' + encodeURIComponent(tab.url)
        : chrome.runtime.getURL('fullpage.html');
      
      chrome.tabs.create({ url });
    });
  }
  
  if (homeBtn) {
    homeBtn.addEventListener('click', function() {
      chrome.tabs.create({
        url: chrome.runtime.getURL('fullpage.html')
      });
    });
  }


  // Settings modal logic
  const settingsModal = document.getElementById('settings-modal');
  const modelSelect = document.getElementById('model-select');
  const geminiKeySection = document.getElementById('gemini-key-section');
  const geminiKeyInput = document.getElementById('gemini-key-input');
  const openaiKeySection = document.getElementById('openai-key-section');
  const openaiKeyInput = document.getElementById('openai-key-input');
  const claudeKeySection = document.getElementById('claude-key-section');
  const claudeKeyInput = document.getElementById('claude-key-input');
  const settingsSaveBtn = document.getElementById('settings-save-btn');
  const settingsCancelBtn = document.getElementById('settings-cancel-btn');

  // Open settings modal
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Load settings from storage
      chrome.storage.local.get(['llmSettings'], (result) => {
        const settings = result.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
        
        console.log('🔍 Popup: Loading LLM settings from storage:', {
          model: settings.model,
          geminiKey: settings.geminiKey ? `${settings.geminiKey.substring(0, 10)}...` : 'empty',
          openaiKey: settings.openaiKey ? `${settings.openaiKey.substring(0, 10)}...` : 'empty',
          claudeKey: settings.claudeKey ? `${settings.claudeKey.substring(0, 10)}...` : 'empty'
        });
        
        modelSelect.value = settings.model || 'gemini-2.5-flash';
        geminiKeyInput.value = settings.geminiKey || '';
        openaiKeyInput.value = settings.openaiKey || '';
        claudeKeyInput.value = settings.claudeKey || '';
        // Show appropriate API key section
        geminiKeySection.style.display = settings.model.startsWith('gemini-') ? 'block' : 'none';
        openaiKeySection.style.display = settings.model.startsWith('gpt-') ? 'block' : 'none';
        claudeKeySection.style.display = settings.model.startsWith('claude-') ? 'block' : 'none';
        settingsModal.style.display = 'flex';
      });
    });
  }

  // Close modal on cancel
  if (settingsCancelBtn) {
    settingsCancelBtn.addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });
  }

  // Show/hide API key inputs based on model selection
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      const selectedModel = modelSelect.value;
      // Show appropriate API key section based on model
      geminiKeySection.style.display = selectedModel.startsWith('gemini-') ? 'block' : 'none';
      openaiKeySection.style.display = selectedModel.startsWith('gpt-') ? 'block' : 'none';
      claudeKeySection.style.display = selectedModel.startsWith('claude-') ? 'block' : 'none';
    });
  }

  // Save settings
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      const model = modelSelect.value;
      const geminiKey = geminiKeyInput.value.trim();
      const openaiKey = openaiKeyInput.value.trim();
      const claudeKey = claudeKeyInput.value.trim();
      
      // Validate API keys for all models
      if (model.startsWith('gemini-') && !geminiKey) {
        alert('Please enter your Google AI API key to use Gemini models');
        return;
      }
      if (model.startsWith('gpt-') && !openaiKey) {
        alert('Please enter your OpenAI API key to use GPT models');
        return;
      }
      if (model.startsWith('claude-') && !claudeKey) {
        alert('Please enter your Claude API key to use Claude models');
        return;
      }
      
      const settingsToSave = { 
        model, 
        geminiKey,
        openaiKey, 
        claudeKey 
      };
      
      console.log('🔍 Popup: Saving LLM settings:', {
        model: settingsToSave.model,
        geminiKey: settingsToSave.geminiKey ? `${settingsToSave.geminiKey.substring(0, 10)}...` : 'empty',
        openaiKey: settingsToSave.openaiKey ? `${settingsToSave.openaiKey.substring(0, 10)}...` : 'empty',
        claudeKey: settingsToSave.claudeKey ? `${settingsToSave.claudeKey.substring(0, 10)}...` : 'empty'
      });
      
      chrome.storage.local.set({ 
        llmSettings: settingsToSave
      }, () => {
        console.log('🔍 Popup: Settings saved successfully');
        settingsModal.style.display = 'none';
        // Update configuration status after saving
        updateConfigurationStatus();
      });
    });
  }

  // Function to clear stale analysis status
  async function clearStaleAnalysisStatus() {
    try {
      const storage = await chrome.storage.local.get([STATUS_KEY]);
      const allStatus = storage[STATUS_KEY] || {};
      let hasChanges = false;

      // Get current time
      const now = new Date().getTime();
      
      // Loop through all statuses and clear any stale ones
      for (const [key, status] of Object.entries(allStatus)) {
        // Convert status timestamps to Date objects
        const startedAt = new Date(status.startedAt).getTime();
        const updatedAt = new Date(status.updatedAt).getTime();
        
        // Clear status if:
        // 1. It's been "in_progress" for more than 5 minutes
        // 2. Last update was more than 5 minutes ago
        const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
        if (status.status === 'in_progress' && 
            (now - startedAt > fiveMinutes || now - updatedAt > fiveMinutes)) {
          delete allStatus[key];
          hasChanges = true;
        }
      }

      // Save changes if any statuses were cleared
      if (hasChanges) {
        await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
        console.log('Cleared stale analysis status');
      }
    } catch (error) {
      console.error('Error clearing stale analysis status:', error);
    }
  }

  // === GLOBAL STATE ===
  let UnderAnalysis = 0;
  
  // Function to analyze authors
  async function analyzeAuthors() {
    try {
      console.log('=== AUTHOR ANALYSIS START ===');
      console.log('Popup: analyzeAuthors function called');
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Popup: Current tab:', tab);
      if (!tab.url) {
        throw new Error('No active tab found');
      }
      // Only allow author analysis on SSRN pages (since this is the only option for SSRN)
      if (!tab.url.includes('ssrn.com')) {
        throw new Error('Author analysis is only available on SSRN pages');
      }
      // Start analysis process
      console.log('Popup: Starting author analysis process...');
      setAuthorsButtonState('Analyzing... Do Not Close Extension Popup', true, true);
      showStatus('Extracting authors from the page...', 'progress');
      // Ensure content script is injected
      console.log('Popup: Ensuring content script is injected...');
      await ensureContentScript(tab.id);
      // Wait a short moment for the content script to initialize
      console.log('Popup: Waiting for content script to initialize...');
      await new Promise(resolve => setTimeout(resolve, 500));
      // Request content from the content script to get authors
      console.log('Popup: Requesting content from content script...');
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperContent' });
      console.log('Popup: Content script response:', response);
      if (response.error) {
        console.log('Popup: Content script returned error:', response.error);
        throw new Error(response.error);
      }
      if (!response.content) {
        console.log('Popup: No content received from content script');
        throw new Error('No content received from the page');
      }
      // Extract authors and affiliations
      const authors = response.content.authors || [];
      const affiliations = response.content.affiliations || [];
      console.log('Popup: Raw extracted content:', {
        title: response.content.title,
        authors: authors,
        affiliations: affiliations,
        hasTitle: !!response.content.title,
        hasAbstract: !!response.content.abstract,
        hasPdf: !!response.content.hasPdf,
        pageUrl: tab.url
      });
      if (authors.length === 0) {
        // Provide detailed debugging information
        const debugInfo = `
No authors found on this SSRN page.

Page: ${tab.url}
Title found: ${response.content.title ? 'Yes' : 'No'}
Abstract found: ${response.content.abstract ? 'Yes' : 'No'}
PDF available: ${response.content.hasPdf ? 'Yes' : 'No'}

This could happen if:
1. The page is still loading - try refreshing and waiting
2. The page structure has changed - SSRN may have updated their layout
3. This is not a paper details page - make sure you're on a paper abstract page
4. Authors are dynamically loaded - try scrolling down or waiting a moment

To troubleshoot:
1. Refresh the page and wait for it to fully load
2. Make sure you're on an SSRN paper abstract page (not search results)
3. Try opening the developer console (F12) to see detailed extraction logs
4. Check if authors are visible on the page manually

If the issue persists, this may be a compatibility issue with the current SSRN page structure.`;

        throw new Error(debugInfo);
      }
      console.log('Popup: Found authors:', authors);
      console.log('Popup: Found affiliations:', affiliations);
      showStatus(`Found ${authors.length} authors. Analyzing their profiles and publications...`, 'progress');
      try {
        // Use global backend
        const backend = await BackendManager.getCurrentBackend();
        if (!backend) throw new Error('No backend available');
        // Call the backend to analyze authors using per-tab backend
        console.log('Popup: Calling author analysis endpoint with per-tab backend...');
        const serverResponse = await makeApiRequestWithBackend(CONFIG.ANALYZE_AUTHORS_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({ 
            authors: authors,
            affiliations: affiliations
          })
        }, backend);
        console.log('Popup: Backend response received for author analysis');
        if (!serverResponse.ok) {
          const errorText = await serverResponse.text();
          throw new Error(`Backend error: ${serverResponse.status} - ${errorText}`);
        }
        const data = await serverResponse.json();
        if (data.error) {
          throw new Error(data.error);
        }
        console.log('Popup: Author analysis results:', data);
        // Display results
        showStatus('Author analysis complete! View detailed results below.', 'success');
        displayAuthorAnalysisResults(data);
        // Update button state
        setAuthorsButtonState('View Full Analysis', false, false);
        analyzeAuthorsBtn.style.backgroundColor = '#4CAF50';
        analyzeAuthorsBtn.onclick = async () => {
          // Store results and open full page
          const paperId = await extractSsrnIdOrUrl(tab.url);
          chrome.storage.local.set({
            lastAuthorAnalysis: {
              timestamp: new Date().toISOString(),
              paperId: paperId,
              data: data
            }
          });
          const unifiedId = await extractSsrnIdOrUrl(tab.url);
          let fullpageUrl = chrome.runtime.getURL('fullpage.html') + '?view=authors';
          if (unifiedId) {
            fullpageUrl += `&paperID=${encodeURIComponent(unifiedId)}`;
          }
          chrome.tabs.create({ url: fullpageUrl });
        };
      } catch (error) {
        console.error('Error calling author analysis backend:', error);
        throw new Error(`Failed to analyze authors: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in author analysis:', error);
      showStatus(`Error: ${error.message}`, 'error');
      setAuthorsButtonState('Analyze Authors', false, false);
      analyzeAuthorsBtn.style.backgroundColor = '#9C27B0';
    }
  }

  // Function to display author analysis results - REMOVED DUPLICATE (kept final version at end of file)

  // Function to display analysis results - REMOVED DUPLICATE (kept final version at end of file)

  // Function to check if analysis exists on backend - REMOVED DUPLICATE (kept final version at end of file)

  // Function to check analysis status first, then completed analysis if needed - REMOVED DUPLICATE (kept final version at end of file)

  /**
   * Update the popup UI according to the following logic:
   * 1) If page is an SSRN url with paperID, and not a PDF > only show the Analyze Authors button
   * 2) If page is an SSRN url with paperID, and not a PDF, but GET /analysis/paperID returns 200 > show View Analysis and Analyze Authors
   * 3) If page is a PDF and /analysis/paperID is not 200 > only show the analyze-btn option
   * 4) If page is a PDF and GET /analysis/paperID returns 200 > show View Analysis
   * 5) If page is a PDF and /analysis/paperID is not 200 and user clicked on analyze-btn > set UnderAnalysis = 1, show (Analyzing...) to user
   * Once /analysis/paperID is 200, UnderAnalysis is again 0 and depending on the above scenarios, users see the popup
   */
  async function updatePopupUI() {
    console.log('[EXTENSION DEBUG] updatePopupUI called - new code is running!');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const url = tab.url;
    console.log('[EXTENSION DEBUG] Processing URL:', url);
    const paperId = await extractSsrnIdOrUrl(url);
    console.log('[EXTENSION DEBUG] Generated paperId in popup:', paperId);
    console.log('🔍 POPUP ID GENERATION - URL:', url, 'RESULT:', paperId);
    const isSSRN = url.includes('ssrn.com') && paperId && !await checkIfPDFPage(tab);
    console.log('[EXTENSION DEBUG] About to call checkIfPDFPage...');
    const isPDF = await checkIfPDFPage(tab);
    console.log('[EXTENSION DEBUG] checkIfPDFPage returned:', isPDF);
    
    // Use global backend detection instead of per-tab
    let backend = await BackendManager.getCurrentBackend();
    console.log('[POPUP] Global backend result:', backend);
    
    // Add comprehensive debug logging
    console.log('[POPUP DEBUG] ===================');
    console.log('[POPUP DEBUG] Tab ID:', tab.id);
    console.log('[POPUP DEBUG] Paper ID:', paperId);
    console.log('[POPUP DEBUG] Tab URL:', tab.url);
    console.log('[POPUP DEBUG] Global Backend:', backend?.name, backend?.url);
    console.log('[POPUP DEBUG] ===================');
    
    if (!backend) {
      showStatus('❌ No Backend Available.', 'error');
      setButtonState('Deep Read!', true, false);
      analyzeBtn.style.backgroundColor = '#ccc';
      analyzeBtn.style.display = '';
      return;
    }
    
    let analysisStatus = { inProgress: false, hasCompleted: false };
    
    // Check if monitoring is already active for this paper
    if (paperId) {
      const monitoringStatus = await getMonitoringStatus(paperId);
      if (monitoringStatus) {
        console.log('[POPUP DEBUG] Monitoring already active for paper:', paperId);
        // Show monitoring is active
        showProgress(2, 'Analysis in progress. Monitoring active... Do not close this popup.');
        setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
        analyzeBtn.style.backgroundColor = '#FF9800';
        analyzeBtn.style.display = '';
        return;
      }
      
      console.log('[POPUP DEBUG] About to call checkAnalysisStatusAndCompletion with backend:', backend.url);
      analysisStatus = await checkAnalysisStatusAndCompletion(paperId, backend);
      console.log('[POPUP DEBUG] checkAnalysisStatusAndCompletion returned:', analysisStatus);
    }
        
    // Hide all buttons initially
    showAuthorsButton(false);
    setButtonState('Deep Read!', true, false);
    analyzeBtn.style.display = 'none';
    if (typeof analyzeAuthorsBtn !== 'undefined') analyzeAuthorsBtn.style.display = 'none';

    // SSRN page with paperID, not PDF
    if (isSSRN) {
      showAuthorsButton(true);
      setAuthorsButtonState('Analyze Authors', false, false);
      analyzeAuthorsBtn.style.display = '';
      analyzeAuthorsBtn.style.backgroundColor = '#9C27B0';
        if (analysisStatus.hasCompleted) {
        // Show both View Analysis and Analyze Authors
        analyzeBtn.style.display = '';
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
            const fullpageUrl = await buildFullpageUrl(paperId);
            chrome.tabs.create({ url: fullpageUrl });
          };
        showStatus('Analysis exists for this paper! Click "View Analysis" or "Analyze Authors".', 'success');
        } else {
        // Only show Analyze Authors
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
      }
      return;
    }

    // PDF page - allow analysis for all PDFs, not just ones with existing paperIds
    if (isPDF) {
      console.log('[POPUP DEBUG] Entering PDF analysis section');
      console.log('[POPUP DEBUG] isPDF:', isPDF, 'paperId:', paperId);
      // Generate paperId if not already available (for non-SSRN PDFs)
      if (!paperId) {
        paperId = await SharedIdGenerator.generateIdFromUrl(url);
        console.log('[POPUP DEBUG] Generated paperId for non-SSRN PDF:', paperId);
      }
      // Check persistent analyzing state
      let analyzingKey = getAnalyzingKey(tab.id, paperId);
      let analyzingObj = await chrome.storage.local.get([analyzingKey]);
      let isAnalyzing = analyzingObj[analyzingKey] === true;
      
      // If analysis is marked as in progress but the actual status shows complete, error, or no analysis exists,
      // clear the analyzing state and reset UnderAnalysis
      if (isAnalyzing && (analysisStatus.hasCompleted || analysisStatus.error || (!analysisStatus.inProgress && !analysisStatus.hasCompleted))) {
        await chrome.storage.local.remove(analyzingKey);
        isAnalyzing = false;
        console.log('Cleared stale analyzing state - analysis has completed, errored, or does not exist');
      }
      
      UnderAnalysis = isAnalyzing ? 1 : 0;
      console.log('[POPUP DEBUG] Analysis status check - inProgress:', analysisStatus.inProgress, 'hasCompleted:', analysisStatus.hasCompleted, 'isAnalyzing:', isAnalyzing);
      if (analysisStatus.inProgress) {
        // Analysis is in progress - show status and start monitoring
        console.log('[POPUP DEBUG] Taking inProgress path');
        analyzeBtn.style.display = '';
        setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
        analyzeBtn.style.backgroundColor = '#FF9800';
        showStatus('Analysis in progress... Please wait and do not close this popup.', 'progress');
        // Start monitoring backend logs for progress
        monitorAnalysisProgress(tab.id, paperId, true);
        return;
      } else if (analysisStatus.hasCompleted) {
        console.log('[POPUP DEBUG] Taking hasCompleted path');
        // Show View Analysis only
        analyzeBtn.style.display = '';
        setButtonState('View Analysis', false, false);
        analyzeBtn.style.backgroundColor = '#4CAF50';
        analyzeBtn.onclick = async () => {
          const fullpageUrl = await buildFullpageUrl(paperId);
          chrome.tabs.create({ url: fullpageUrl });
        };
        // Clear analyzing state if analysis is done
        await chrome.storage.local.remove(analyzingKey);
        showStatus('Analysis exists for this paper! Click "View Analysis".', 'success');
        return;
      } else if (isAnalyzing) {
        // Show Analyzing... state and start/resume polling backend logs
        console.log('[POPUP DEBUG] Taking isAnalyzing path');
        analyzeBtn.style.display = '';
        setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
        analyzeBtn.style.backgroundColor = '#FF9800';
        showStatus('Analyzing... Please wait and do not close this popup.', 'progress');
        // Start/resume polling backend logs for progress
        monitorAnalysisProgress(tab.id, paperId, true);
        return;
      } else {
        // Only show Deep Read!
        console.log('[POPUP DEBUG] Taking fresh analysis path - enabling button');
        analyzeBtn.style.display = '';
        setButtonState('Deep Read!', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.onclick = async () => {
          // Set persistent analyzing state
          let key = getAnalyzingKey(tab.id, paperId);
          await chrome.storage.local.set({ [key]: true });
          UnderAnalysis = 1;
          
          try {
            // Update UI to show analysis is starting
            await setAnalysisStatus(paperId, 'in_progress');
            showStatus('Analysis in progress for this paper... Please do not close this popup during analysis.', 'progress');
            setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
            analyzeBtn.style.backgroundColor = '#FF9800';

            // Direct streaming analysis for PDFs
            let fileContentB64 = null;
            try {
              const resp = await fetch(tab.url);
              const blob = await resp.blob();
              const arrayBuf = await blob.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuf);
              
              // Convert to base64 in chunks to avoid stack overflow on large files
              let binary = '';
              const chunkSize = 0x8000; // 32KB chunks
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
              }
              fileContentB64 = btoa(binary);
            } catch (e) {
              console.warn('Could not fetch PDF content for base64; backend will download directly', e);
            }

            // Get current model, scholar URL, and API keys from settings
            const settings = await chrome.storage.local.get(['llmSettings', 'userSettings']);
            const selectedModel = settings.llmSettings?.model || 'gemini-2.5-flash';
            const userScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
            const llmSettings = settings.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
            
            // Create base payload
            const basePayload = {
              content: { paperUrl: tab.url },
              model: selectedModel,
              user_scholar_url: userScholarUrl
            };
            
            // Add file content if available
            if (fileContentB64) {
              basePayload.file_content = fileContentB64;
            }
            
            // Add API keys if they have content
            if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
              basePayload.google_api_key = llmSettings.geminiKey;
            }
            if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
              basePayload.openai_api_key = llmSettings.openaiKey;
            }
            if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
              basePayload.claude_api_key = llmSettings.claudeKey;
            }
            
            const bodyPayload = basePayload;

            // Start background monitoring
            await monitorAnalysisProgress(tab.id, paperId, true);
            
            const finalEvt = await analyzeWithSmartBackendStream(bodyPayload, (msg) => {
              showStatus(msg, 'info');
            });

            // Clear analyzing state
            await chrome.storage.local.remove(key);
            UnderAnalysis = 0;
            
            // Analysis completed via streaming - update UI directly
            await setAnalysisStatus(paperId, 'complete');
            showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
            setButtonState('View Analysis', false, false);
            analyzeBtn.style.backgroundColor = '#4CAF50';
            analyzeBtn.onclick = async () => {
              const fullpageUrl = await buildFullpageUrl(paperId);
              chrome.tabs.create({ url: fullpageUrl });
            };
            
            // Stop any background monitoring
            await stopAnalysisMonitoring(paperId);
          } catch (error) {
            console.error('Error in PDF analysis:', error);
            await chrome.storage.local.remove(key);
            UnderAnalysis = 0;
            showStatus('Analysis failed: ' + (error.message || 'Unknown error'), 'error');
            updatePopupUI();
          }
        };
        
        // Check if this is an SSRN PDF or a non-SSRN PDF for appropriate messaging
        const isSSRNPDF = url.includes('ssrn.com');
        if (isSSRNPDF) {
          showStatus('PDF detected. Click "Deep Read!" to start analysis.', 'info');
        } else {
          showStatus('PDF detected. Note: This extension works best with SSRN papers, but analysis will proceed. Click "Deep Read!" to start.', 'info');
        }
        return;
      }
    }

    // Not SSRN, not PDF, or no paperId
    console.log('[POPUP DEBUG] Reached final fallback section - disabling button');
    console.log('[POPUP DEBUG] isSSRN:', isSSRN, 'isPDF:', isPDF, 'paperId:', paperId);
    showStatus('Navigate to an SSRN paper (for author analysis) or open a PDF file (for paper analysis).', 'info');
            setButtonState('Deep Read!', true, false);
            analyzeBtn.style.backgroundColor = '#ccc';
    analyzeBtn.style.display = '';
    showAuthorsButton(false);
          }



  // Patch analyzePaper to only fetch /analysis when status is complete
  const originalAnalyzePaper = analyzePaper;
  analyzePaper = async function(...args) {
    // This is now only used for non-PDFs or as a helper
    await originalAnalyzePaper.apply(this, args);
  };

  // Patch message listener for analysisComplete to reset UnderAnalysis
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'analysisComplete') {
      UnderAnalysis = 0;
      updatePopupUI();
    }
  });

  // Replace initialization to use updatePopupUI
  async function initializePopup() {
    try {
      displayBackendStatus();
      await debugStorageState();
      await updateBackendStatusDisplay();
      
      // Reset UnderAnalysis on popup initialization (handles tab refresh case)
      UnderAnalysis = 0;
      window.clickedAnalyzeThisSession = false;
      
      // Check for stale analyzing states and clean them up
      await cleanupStaleAnalyzingStates();
      
      await updatePopupUI();
    } catch (error) {
      console.error('Popup: Initialization error:', error);
      updateBackendStatusDisplay(null, error.message);
    }
  }
  
  // Run initialization
  initializePopup();
  updateConfigurationStatus();
  
  // Debug function to manually check status (for testing)
  window.debugCheckStatus = async function() {
    console.log('=== DEBUG: Manual status check ===');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab);
    
    if (tab && tab.url) {
      const paperId = await extractSsrnIdOrUrl(tab.url);
      if (paperId) {
        const status = await getAnalysisStatus(paperId);
        console.log('Status for current URL:', status);
        
        // Also show all stored statuses
        const storage = await chrome.storage.local.get([STATUS_KEY]);
        console.log('All stored statuses:', storage[STATUS_KEY]);
        
        // Check background monitoring status
        try {
          const response = await chrome.runtime.sendMessage({ action: 'debugMonitoring' });
          console.log('Background monitoring debug info:', response.debugInfo);
        } catch (error) {
          console.error('Error getting background monitoring info:', error);
        }
      }
    }
  };
  
  // Also check page type when popup is focused (in case user switches tabs)
  window.addEventListener('focus', async () => {
    try {
      await checkPageType();
    } catch (error) {
      console.error('Error checking page type on focus:', error);
    }
  });

  // Listen for runtime messages (e.g., from background script)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Popup received message:', message);
    
    if (message.action === 'analysisComplete') {
      console.log('Analysis completion notification received');
      
      // Reset analysis state
      UnderAnalysis = 0;
      
      // Clear analyzing state for this tab/paper if available
              chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs.length > 0) {
          const tab = tabs[0];
          const paperId = await extractSsrnIdOrUrl(tab.url);
          if (paperId && message.tabId === tab.id) {
            const analyzingKey = getAnalyzingKey(tab.id, paperId);
            await chrome.storage.local.remove(analyzingKey);
            console.log('Cleared analyzing state on completion:', analyzingKey);
          }
        }
      });
      
      // Update UI to show completion
      hideProgress();
      setButtonState('View Analysis', false, false);
      analyzeBtn.style.backgroundColor = '#4CAF50';
      showStatus('Analysis completed successfully! Click "View Analysis" to see results.', 'success');
      
      // Update button onclick to view results
      analyzeBtn.onclick = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        const paperId = await extractSsrnIdOrUrl(tab.url);
        const fullpageUrl = await buildFullpageUrl(paperId);
        chrome.tabs.create({ url: fullpageUrl });
      };
      
      sendResponse({ received: true });
    } else if (message.action === 'analysisStarted') {
      console.log('Analysis started notification received');
      
      // Update UI to show analysis in progress and start monitoring
      setButtonState('Analyzing... Do Not Close Extension Popup', true, true);
      showProgress(1, 'Analysis started...');
      
      // Start monitoring for status changes
      setTimeout(() => {
        checkAndMonitorAnalysisStatus();
      }, 1000);
      
      sendResponse({ received: true });
    } else if (message.action === 'analysisProgress') {
      console.log('Analysis progress update received:', message.data);
      
      // Update progress based on backend status
      if (message.data.status === 'in_progress') {
        let latestMessage = 'Analysis in progress...';
        
        // Process logs for detailed progress
        if (message.data.logs && message.data.logs.length > 0) {
          const lastLog = message.data.logs[message.data.logs.length - 1];
          if (lastLog.section) {
            if (lastLog.status === 'junior_start') {
              updateTaskStatus(lastLog.section, 'in_progress');
            } else if (lastLog.status === 'junior_done') {
              updateTaskStatus(lastLog.section, 'done');
            }
          }
          latestMessage = `[${lastLog.section || lastLog.status}] ${lastLog.message}`;
        }
        
        showProgress(2, latestMessage);
      }
      
      sendResponse({ received: true });
    } else if (message.action === 'analysisError') {
      console.log('Analysis error notification received:', message.error);
      
      // Reset analysis state
      UnderAnalysis = 0;
      
      // Clear analyzing state for this tab/paper if available
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs.length > 0) {
          const tab = tabs[0];
          const paperId = await extractSsrnIdOrUrl(tab.url);
          if (paperId && message.tabId === tab.id) {
            const analyzingKey = getAnalyzingKey(tab.id, paperId);
            await chrome.storage.local.remove(analyzingKey);
            console.log('Cleared analyzing state on error:', analyzingKey);
          }
        }
      });
      
      hideProgress();
      showStatus('Analysis failed: ' + (message.error || 'Unknown error'), 'error');
      setButtonState('Deep Read!', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      
      sendResponse({ received: true });
    }
    
    return true; // Keep message channel open for async response
  });


  // Function to display author analysis results
  function displayAuthorAnalysisResults(data) {
    const summary = data.summary;
    const authors = data.authors;

    let resultHtml = `
      <div style="margin-top: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 4px; text-align: left; font-size: 12px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">Author Analysis Summary</h3>
        <div><strong>Total Authors:</strong> ${summary.total_authors}</div>
        <div><strong>Total FT50 Publications:</strong> ${summary.total_ft50_publications}</div>
        <div><strong>Total Citations:</strong> ${summary.total_citations.toLocaleString()}</div>
        <div><strong>Highest H-index:</strong> ${summary.max_h_index}</div>
        
        <div style="margin-top: 8px;"><strong>Top Authors:</strong></div>
    `;

    // Show top 2 authors by citations
    const topAuthors = authors
      .filter(author => !author.error)
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 2);

    topAuthors.forEach(author => {
      resultHtml += `
        <div style="margin: 4px 0; padding: 4px; background: white; border-radius: 2px;">
          <div><strong>${author.name}</strong> (${author.affiliation || 'Unknown'})</div>
          <div style="font-size: 11px; color: #666;">
            ${author.citations} citations • H-index: ${author.h_index} • FT50: ${author.ft50_count}
          </div>
        </div>
      `;
    });

    resultHtml += `
        <div style="margin-top: 8px; font-size: 11px; color: #666;">
          Click "View Full Analysis" for complete details, publications, and research areas.
        </div>
      </div>
    `;

    statusContainer.innerHTML = resultHtml;
  }

  // Function to display analysis results
  function displayAnalysis(analysis, tabUrl) {
    if (!analysis) {
      showStatus('No analysis data available', 'error');
      return;
    }

    // Update button state
    setButtonState('View Analysis', false, false);
    analyzeBtn.style.backgroundColor = '#4CAF50';
    analyzeBtn.onclick = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      const paperId = await extractSsrnIdOrUrl(tab.url);
      const fullpageUrl = await buildFullpageUrl(paperId);
      chrome.tabs.create({ url: fullpageUrl });
    };

    // Show success message
    let statusMessage = 'Analysis loaded from cache. Click "View Analysis" to see the detailed summary.';
    if (analysis.data && analysis.data.author_data) {
      statusMessage += ` Author profiles available: ${analysis.data.author_data.summary.total_authors} authors with ${analysis.data.author_data.summary.total_citations.toLocaleString()} total citations.`;
    }
    showStatus(statusMessage, 'success');
  }

  // Function to check if analysis exists on backend
  async function checkAnalysisOnBackend(paperId) {
    try {
      console.log('Checking backend for analysis of paper:', paperId);
      
      // Use smart backend detection to get the correct backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for checking analysis');
        return false;
      }
      
      const url = `${backend.url}/analysis/${encodeURIComponent(paperId)}`;
      console.log('Checking analysis endpoint:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Backend has analysis data:', data);
        
        // Store the analysis data in local storage for immediate use
        if (data && data.summary) {
          // Check if the analysis contains an error state
          if (data.summary === 'Error generating analysis' || !data.summary.trim()) {
            console.log('Backend returned error analysis or empty summary:', data.summary);
            return false;
          }
          
          const storageKey = `analysis_${paperId}`;
          const analysisResult = {
            timestamp: new Date().toISOString(),
            paperId: paperId,
            content: data.content || {
              paperUrl: `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${paperId}`,
              paperId: paperId,
              title: 'Paper Analysis',
              abstract: 'Analysis loaded from backend',
              paperContent: 'Content processed by backend'
            },
            summary: data.summary,
            data: data,
            autoAnalyzed: true
          };
          
          const storageData = {};
          storageData[storageKey] = analysisResult;
          await chrome.storage.local.set(storageData);
          console.log('Stored analysis data from backend');
          
          // Update status to complete
          await setAnalysisStatus(paperId, 'complete');
        }
        
        return true;
      } else if (response.status === 404) {
        console.log('No analysis found on backend for paper:', paperId);
        return false;
      } else {
        console.log('Backend returned error for analysis check:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Error checking analysis on backend:', error);
      return false;
    }
  }

  // Function to check analysis status first, then completed analysis if needed
  async function checkAnalysisStatusAndCompletion(paperId, backend) {
    try {
      console.log('Checking analysis status first for paper:', paperId);
      console.log('[DEBUG] checkAnalysisStatusAndCompletion using backend:', backend?.name, backend?.url);
      
      // First check if analysis is in progress
      const statusUrl = `${backend.url}/analysis-status/${encodeURIComponent(paperId)}`;
      console.log('Checking status endpoint:', statusUrl);
      
      const statusResponse = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[DEBUG] Status response:', statusResponse.status, statusResponse.statusText);
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        console.log('Backend status data:', statusData);
        
        if (statusData.status === 'in_progress') {
          console.log('Analysis is in progress');
          return { inProgress: true, hasCompleted: false };
        } else if (statusData.status === 'complete') {
          console.log('Analysis status shows complete, checking for results');
          const hasCompleted = await checkAnalysisOnBackend(paperId);
          return { inProgress: false, hasCompleted };
        } else if (statusData.status === 'error') {
          console.log('Analysis status shows error');
          return { inProgress: false, hasCompleted: false, error: statusData.errorMessage };
        }
      } else if (statusResponse.status === 404) {
        console.log('No status found, checking for completed analysis');
        // No status entry, check if completed analysis exists
        const hasCompleted = await checkAnalysisOnBackend(paperId);
        return { inProgress: false, hasCompleted };
      }
      
      return { inProgress: false, hasCompleted: false };
    } catch (error) {
      console.error('Error checking analysis status and completion:', error);
      return { inProgress: false, hasCompleted: false };
    }
  }

  // Listen for tab refresh and reset UnderAnalysis if the current tab is reloaded
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading') {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0 && tabs[0].id === tabId) {
          UnderAnalysis = 0;
          window.clickedAnalyzeThisSession = false;
        }
      });
    }
  });

  // Utility to get the analyzing key for a tab and paper
  function getAnalyzingKey(tabId, paperId) {
    return `analyzing_${tabId}_${paperId}`;
  }

  // Function to clean up stale analyzing states on popup initialization
  async function cleanupStaleAnalyzingStates() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      
      const paperId = await extractSsrnIdOrUrl(tab.url);
      if (!paperId) return;
      
      // Check if there's actually an analysis in progress or completed
      const backend = await BackendManager.getCurrentBackend();
      if (backend) {
        const analysisStatus = await checkAnalysisStatusAndCompletion(paperId, backend);
        
        // If no analysis exists or is in progress, clear the analyzing state
        if (!analysisStatus.inProgress && !analysisStatus.hasCompleted) {
          const analyzingKey = getAnalyzingKey(tab.id, paperId);
          await chrome.storage.local.remove(analyzingKey);
          console.log('Cleaned up stale analyzing state for tab:', tab.id, 'paper:', paperId);
        }
      }
    } catch (error) {
      console.error('Error cleaning up stale analyzing states:', error);
    }
  }

  // On tab refresh or redirect, clear persistent analyzing state
  chrome.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading') {
      const paperId = tab && tab.url ? await extractSsrnIdOrUrl(tab.url) : null;
      if (paperId) {
        let key = getAnalyzingKey(tabId, paperId);
        chrome.storage.local.remove(key);
      }
      UnderAnalysis = 0;
    }
  });

  // Removed getTabAssignedBackend - now using global BackendManager

  // Patch checkAnalysisOnBackend to accept a backend argument
  async function checkAnalysisOnBackend(paperId, backend) {
    try {
      console.log('Checking backend for analysis of paper:', paperId);
      if (!backend) {
        backend = await BackendManager.getCurrentBackend();
      }
      if (!backend) {
        console.log('No healthy backend available for checking analysis');
        return false;
      }
      const url = `${backend.url}/analysis/${encodeURIComponent(paperId)}`;
      console.log('Checking analysis endpoint:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Backend has analysis data:', data);
        if (data && data.summary) {
          if (data.summary === 'Error generating analysis' || !data.summary.trim()) {
            console.log('Backend returned error analysis or empty summary:', data.summary);
            return false;
          }
          const storageKey = `analysis_${paperId}`;
          const analysisResult = {
            timestamp: new Date().toISOString(),
            paperId: paperId,
            content: data.content || {
              paperUrl: `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${paperId}`,
              paperId: paperId,
              title: 'Paper Analysis',
              abstract: 'Analysis loaded from backend',
              paperContent: 'Content processed by backend'
            },
            summary: data.summary,
            data: data,
            autoAnalyzed: true
          };
          const storageData = {};
          storageData[storageKey] = analysisResult;
          await chrome.storage.local.set(storageData);
          console.log('Stored analysis data from backend');
          await setAnalysisStatus(paperId, 'complete');
        }
        return true;
      } else if (response.status === 404) {
        console.log('No analysis found on backend for paper:', paperId);
        return false;
      } else {
        console.log('Backend returned error for analysis check:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Error checking analysis on backend:', error);
      return false;
    }
  }

  // Patch updateBackendStatusDisplay to accept a backend argument
  async function updateBackendStatusDisplay(backend = null, error = null) {
    const statusDiv = document.getElementById('backend-status');
    if (!statusDiv) return;
    try {
      if (error) {
        statusDiv.innerHTML = `<div class="error">❌ Backend Error<br><small>${error}</small></div>`;
        return;
      }
      if (!backend) {
        backend = await BackendManager.getCurrentBackend();
      }
      if (backend) {
        const start = Date.now();
        try {
          await fetch(`${backend.url}${CONFIG.HEALTH_ENDPOINT}`, {
            method: 'GET',
            signal: AbortSignal.timeout(CONFIG.HEALTH_CHECK_TIMEOUT)
          });
          const latency = Date.now() - start;
          statusDiv.innerHTML = `
            <div class="success">
              ✅ You are using the latest version of the extension.
              <br><small>Connected to ${backend.name} (${latency}ms)</small>
            </div>
          `;
        } catch (error) {
          statusDiv.innerHTML = `
            <div class="success">
              ✅ Using ${backend.name}
              <br><small>${backend.url}</small>
            </div>
          `;
        }
      } else {
        statusDiv.innerHTML = '<div class="error">❌ You must update the extension to the latest version.</div>';
      }
    } catch (error) {
      console.error('Error updating backend status:', error);
      statusDiv.innerHTML = '<div class="error">❌ Backend detection failed, refresh the page.</div>';
    }
  }

  // === Task progress checklist helpers ===
  // Keep an in-memory map of section -> status (in_progress | done)
  const taskStatusMap = {};

  // Ensure a checklist container exists just below the progress bar
  function ensureTaskChecklist() {
    let checklist = document.getElementById('progress-tasks');
    if (!checklist) {
      const progressContainer = document.getElementById('progress-container');
      if (!progressContainer) return null;
      checklist = document.createElement('ul');
      checklist.id = 'progress-tasks';
      checklist.style.listStyle = 'none';
      checklist.style.padding = '6px 12px';
      checklist.style.margin = '0';
      checklist.style.fontSize = '12px';
      progressContainer.parentNode.insertBefore(checklist, progressContainer.nextSibling);
    }
    return checklist;
  }

  function renderTaskChecklist() {
    const checklist = ensureTaskChecklist();
    if (!checklist) return;
    checklist.innerHTML = '';
    Object.entries(taskStatusMap).forEach(([section, status]) => {
      const li = document.createElement('li');
      li.textContent = `${status === 'done' ? '✅' : status === 'in_progress' ? '⏳' : '•'} ${section}`;
      li.style.opacity = status === 'done' ? '0.7' : '1';
      checklist.appendChild(li);
    });
  }

  function updateTaskStatus(section, status) {
    if (!section) return;
    // Only update if status changes or new
    if (taskStatusMap[section] !== status) {
      taskStatusMap[section] = status;
      renderTaskChecklist();
    }
  }

  function resetTaskChecklist() {
    for (const key in taskStatusMap) delete taskStatusMap[key];
    renderTaskChecklist();
  }

  // Version checking functionality
  async function checkForUpdates() {
    try {
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        console.log('No backend available for version check');
        return;
      }

      // Get extension version from manifest
      const manifest = chrome.runtime.getManifest();
      const extensionVersion = `v${manifest.version}`;

      const response = await fetch(`${backend.url}${CONFIG.VERSION_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': extensionVersion
        }
      });

      if (response.ok) {
        const versionData = await response.json();
        console.log('Version check result:', versionData);

        if (versionData.update_available || versionData.deprecated) {
          showVersionNotification(versionData);
        }
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  }

  function showVersionNotification(versionData) {
    // Remove any existing version notifications first
    const existingNotification = document.getElementById('version-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'version-notification';
    notificationContainer.style.cssText = `
      margin: 8px 0;
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      text-align: left;
      ${versionData.deprecated || versionData.type === 'deprecated' ? 
        'background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404;' : 
        'background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460;'
      }
    `;

    const isDeprecated = versionData.deprecated || versionData.type === 'deprecated';
    const icon = isDeprecated ? '⚠️' : 'ℹ️';
    const title = isDeprecated ? 'Extension Update Required' : 'Update Available';
    
    notificationContainer.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">
        ${icon} ${title}
      </div>
      <div style="margin-bottom: 6px;">
        ${versionData.message || 'A newer version is available.'}
      </div>
      <div style="font-size: 11px; color: #666;">
        Current: ${versionData.extension_version || 'Unknown'} → Latest: ${versionData.latest_version || versionData.backend_version || 'Unknown'}
      </div>
    `;

    // Insert notification below backend status
    const backendStatus = document.getElementById('backend-status');
    if (backendStatus && backendStatus.parentNode) {
      backendStatus.parentNode.insertBefore(notificationContainer, backendStatus.nextSibling);
    }
  }

  // Global functions for handling version warnings from API responses
  window.showVersionWarningFromAPI = function(versionWarning) {
    console.log('Received version warning from API:', versionWarning);
    showVersionNotification(versionWarning);
  };

  window.checkResponseForVersionWarning = function(versionWarning) {
    console.log('Checking response for version warning:', versionWarning);
    showVersionNotification(versionWarning);
  };

  // Initialize version checking
  setTimeout(() => {
    checkForUpdates();
  }, 2000); // Check for updates 2 seconds after popup loads
});
