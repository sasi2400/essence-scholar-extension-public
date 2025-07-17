document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
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
      
      const paperId = extractSsrnIdOrUrl(tab.url);
      if (!paperId) {
        console.log('No paper ID found for status monitoring');
        return;
      }
      
      console.log('Checking analysis status for paper ID:', paperId);
      const status = await getAnalysisStatus(paperId);
      console.log('Current analysis status:', status);
      
      // Always hide/disable View Analysis button unless status is complete
      setButtonState('Analyze Current Paper', false, false);
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
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
            });
          };
          return;
        } else {
          showStatus('Analysis has not been done for this paper.', 'info');
          setButtonState('Analyze Current Paper', false, false);
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
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
            });
          };
          return;
        }
        // If backend does not have analysis, show not done message
        showStatus('Analysis has not been done for this paper.', 'info');
        setButtonState('Analyze Current Paper', false, false);
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
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
            });
          };
        } else {
          setButtonState('Analyze Current Paper', false, false);
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
              chrome.tabs.create({
                url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
              });
            };
            return;
          }
          // Only show in progress if there is a previous status (i.e., not a new paper)
          if (!status.startedAt) {
            // No previous analysis, do not show in progress
            setButtonState('Analyze Current Paper', true, false);
            analyzeBtn.style.backgroundColor = '#ccc';
            analyzeBtn.onclick = null;
            return;
          }
          showStatus('Analysis in progress for this paper. Monitoring for completion...', 'progress');
          setButtonState('Analyzing...', true, true);
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
              setButtonState('Analyze Current Paper', false, false);
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
                chrome.tabs.create({
                  url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
                });
              };
              return;
            }
            
            if (!currentStatus || currentStatus.status === 'error') {
              clearInterval(monitorInterval);
              showStatus('Analysis failed: ' + (currentStatus?.errorMessage || 'Unknown error'), 'error');
              setButtonState('Analyze Current Paper', false, false);
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
                  chrome.tabs.create({
                    url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
                  });
                };
              } else {
                // If local storage says complete but no results, check backend one more time
                const backendRecheck = await checkAnalysisOnBackend(paperId);
                if (backendRecheck) {
                  showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
                  setButtonState('View Analysis', false, false);
                  analyzeBtn.style.backgroundColor = '#4CAF50';
                  analyzeBtn.onclick = async () => {
                    chrome.tabs.create({
                      url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
                    });
                  };
                } else {
                  setButtonState('Analyze Current Paper', false, false);
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
            setButtonState('Analyze Current Paper', false, false);
            analyzeBtn.style.backgroundColor = '#2196F3';
            analyzeBtn.onclick = analyzePaper;
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Error checking analysis status:', error);
      showStatus('Error checking analysis status. Please try again.', 'error');
      setButtonState('Analyze Current Paper', false, false);
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
      const paperId = extractSsrnIdOrUrl(tab.url);
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
          const paperId = extractSsrnIdOrUrl(tab.url);
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
            const paperId = extractSsrnIdOrUrl(tab.url);
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
            });
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
  const backendStatus = document.getElementById('backend-status');

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
            const paperId = extractSsrnIdOrUrl(tab.url);
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
            });
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
              const paperId = extractSsrnIdOrUrl(tab.url);
              chrome.tabs.create({
                url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
              });
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
        setButtonState('Analyzing...', true, true);
        showProgress(2, 'Analysis in progress. Please wait...');
        
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
  async function monitorAnalysisProgress(tabId) {
    let lastStatus = null;
    
    const checkInterval = setInterval(async () => {
      try {
        const status = await checkAnalysisStatus(tabId);
        
        // Only update UI if status changed
        if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
          lastStatus = status;
          
                if (status.inProgress || status.analysisInProgress) {
        // Still in progress - update progress indicator
        showProgress(2, 'Analysis in progress. Please wait...');
      } else if (status.queued) {
        // Analysis is queued - show queue position
        const queueMsg = status.queuePosition > 0 
          ? `Analysis queued. Position: ${status.queuePosition}. Please wait...`
          : 'Analysis queued. Please wait...';
        showProgress(1, queueMsg);
      } else {
            // Analysis completed
            clearInterval(checkInterval);
            console.log('Analysis completed, updating UI');
            
            hideProgress();
            
            // Check if we have results in storage
            const hasResults = await checkForExistingAnalysis();
            
            if (!hasResults) {
              // Analysis completed but no results found - check badge for status
              try {
                const badge = await chrome.action.getBadgeText({});
                if (badge === 'OK') {
                  showStatus('Analysis completed successfully! Click "Go to Full Page" to view results.', 'success');
                  setButtonState('View Analysis', false, false);
                  analyzeBtn.style.backgroundColor = '#4CAF50';
                } else {
                  // Analysis may have failed - re-check page type to set correct button state
                  await checkPageType();
                }
              } catch (error) {
                console.log('Could not read badge text:', error);
                // Re-check page type to set correct button state
                await checkPageType();
              }
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring analysis progress:', error);
        clearInterval(checkInterval);
        hideProgress();
        // Re-check page type to set correct button state
        await checkPageType();
        showStatus('Error monitoring analysis. Click to try again.', 'error');
      }
    }, 2000); // Check every 2 seconds

    // Clear interval after 5 minutes to prevent infinite polling
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log('Analysis monitoring timeout reached');
    }, 5 * 60 * 1000);
  }

  // Function to analyze paper
  async function analyzePaper() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        showStatus('No active tab found', 'error');
        return;
      }

      // Set initial status
      const paperId = extractSsrnIdOrUrl(tab.url);
      if (!paperId) {
        showStatus('Could not extract paper ID from URL', 'error');
        return;
      }
      
      // Update UI to show analysis is starting
      await setAnalysisStatus(paperId, 'in_progress');
      showStatus('Analysis in progress for this paper. Monitoring for completion...', 'progress');
      setButtonState('Analyzing...', true, true);
      analyzeBtn.style.backgroundColor = '#FF9800';

      // Send message to background script to start analysis
      await chrome.runtime.sendMessage({
        action: 'analysisStarted',
        tabId: tab.id,
        url: tab.url
      });

      // Start monitoring the analysis progress
      checkAndMonitorAnalysisStatus();

    } catch (error) {
      console.error('Error in analyzePaper:', error);
      const errorMessage = error.message || 'Unknown error occurred';
      
      // Get the current tab URL for status cleanup
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const paperId = extractSsrnIdOrUrl(tab.url);
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
      setButtonState('Analyze Current Paper', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      analyzeBtn.onclick = analyzePaper;
    }
  }

  // Display backend status
  function displayBackendStatus(message = '🔍 Detecting backend...') {
    const statusDiv = document.getElementById('backend-status');
    if (statusDiv) {
      statusDiv.innerHTML = `<div class="info">${message}</div>`;
    }
  }

  // Update backend status display
  async function updateBackendStatusDisplay(backend = null, error = null) {
    const statusDiv = document.getElementById('backend-status');
    if (!statusDiv) return;

    try {
      if (error) {
        statusDiv.innerHTML = `<div class="error">❌ Backend Error<br><small>${error}</small></div>`;
        return;
      }

      if (!backend) {
        // Detect current backend
        backend = await backendManager.getCurrentBackend();
      }

      if (backend) {
        // Measure latency
        const start = Date.now();
        try {
          await fetch(`${backend.url}${CONFIG.HEALTH_ENDPOINT}`, {
            method: 'GET',
            signal: AbortSignal.timeout(CONFIG.HEALTH_CHECK_TIMEOUT)
          });
          const latency = Date.now() - start;
          
          statusDiv.innerHTML = `
            <div class="success">
              ✅ Connected to ${backend.name}
              <br><small>${backend.url} (${latency}ms)</small>
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
        statusDiv.innerHTML = '<div class="error">❌ No backends available</div>';
      }
    } catch (error) {
      console.error('Error updating backend status:', error);
      statusDiv.innerHTML = '<div class="error">❌ Backend detection failed</div>';
    }
  }

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
        setButtonState('Analyze Current Paper', true, false); // Disable main button
        analyzeBtn.style.backgroundColor = '#ccc'; // Gray out main button
        analyzeBtn.style.cursor = 'not-allowed'; // Show disabled cursor
        showAuthorsButton(false); // Hide authors button for local PDFs
        
        // Show the full page interface button prominently
        showFullpageButton(true);
        
        console.log('checkPageType: Main analyze button disabled, fullpage button shown');
      } else if (!isPDF && isSSRN) {
        // SSRN page without PDF: disable main analyze button, enable authors button
        setButtonState('Analyze Current Paper', true, false); // Disable main button
        analyzeBtn.style.backgroundColor = '#ccc';
        showAuthorsButton(true);
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
        return;
      }
      
      if (tab.url && tab.url.includes('ssrn.com')) {
        // SSRN page detected - only show author analysis option
        console.log('checkPageType: SSRN detected - disabling paper analysis, showing author analysis');
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
        setButtonState('Analyze Current Paper', true, false); // Disable paper analysis button
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
        setButtonState('Analyze Current Paper', true, false); // Disable button
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
      // Method 1: Check URL patterns
      const urlPatterns = [
        tab.url.toLowerCase().endsWith('.pdf'),
        tab.url.startsWith('file:///'),
        tab.url.includes('pdf') && (tab.url.includes('viewer') || tab.url.includes('download')),
        tab.url.includes('application/pdf'),
        tab.url.includes('content-type=application/pdf')
      ];
      
      if (urlPatterns.some(pattern => pattern)) {
        console.log('checkIfPDFPage: PDF detected via URL pattern');
        return true;
      }
      
      // Method 2: Check content type via content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkContentType' });
        if (response && response.contentType === 'application/pdf') {
          console.log('checkIfPDFPage: PDF detected via content type');
          return true;
        }
      } catch (error) {
        console.log('checkIfPDFPage: Could not check content type via content script:', error.message);
      }
      
      // Method 3: Check for PDF elements in the page
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'checkPDFElements' });
        if (response && response.hasPDFElements) {
          console.log('checkIfPDFPage: PDF detected via page elements');
          return true;
        }
      } catch (error) {
        console.log('checkIfPDFPage: Could not check PDF elements:', error.message);
      }
      
      // Method 4: Check if the page title suggests it's a PDF
      const title = tab.title || '';
      if (title.toLowerCase().includes('pdf') || title.toLowerCase().includes('document')) {
        console.log('checkIfPDFPage: PDF suggested by title:', title);
        // This is a weaker indicator, so we'll log it but not return true immediately
      }
      
      return false;
    } catch (error) {
      console.error('Error checking if page is PDF:', error);
      return false;
    }
  }

  // Replace the old extractSsrnIdOrUrl with a robust version
  function extractSsrnIdOrUrl(url) {
    if (!url) return null;
    // Prefer query string: abstract_id or abstractId
    let match = url.match(/[?&]abstract_id=(\d+)/i);
    if (match) return match[1];
    match = url.match(/[?&]abstractId=(\d+)/i);
    if (match) return match[1];
    match = url.match(/[?&]abstract=(\d+)/i);
    if (match) return match[1];
    // Fallback: look for ssrn_id1234567 or abstract1234567 in the path/filename
    match = url.match(/ssrn_id(\d+)/i);
    if (match) return match[1];
    match = url.match(/abstract(\d+)/i);
    if (match) return match[1];
    // Fallback: use the full URL as ID
    return url;
  }

  // Event listeners
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzePaper);
  }
  
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
        const settings = result.llmSettings || { model: 'gemini-2.5-flash', openaiKey: '', claudeKey: '' };
        modelSelect.value = settings.model || 'gemini-2.5-flash';
        openaiKeyInput.value = settings.openaiKey || '';
        claudeKeyInput.value = settings.claudeKey || '';
        openaiKeySection.style.display = (settings.model === 'openai') ? 'block' : 'none';
        claudeKeySection.style.display = (settings.model === 'claude') ? 'block' : 'none';
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
      // Show OpenAI key section for GPT models
      openaiKeySection.style.display = selectedModel.startsWith('gpt-') ? 'block' : 'none';
      // Show Claude key section for Claude models
      claudeKeySection.style.display = selectedModel.startsWith('claude-') ? 'block' : 'none';
    });
  }

  // Save settings
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      const model = modelSelect.value;
      const openaiKey = openaiKeyInput.value.trim();
      const claudeKey = claudeKeyInput.value.trim();
      
      // Validate API keys if needed
      if (model.startsWith('gpt-') && !openaiKey) {
        alert('Please enter your OpenAI API key to use GPT models');
        return;
      }
      if (model.startsWith('claude-') && !claudeKey) {
        alert('Please enter your Claude API key to use Claude models');
        return;
      }
      
      chrome.storage.local.set({ 
        llmSettings: { 
          model, 
          openaiKey, 
          claudeKey 
        } 
      }, () => {
        settingsModal.style.display = 'none';
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
      setAuthorsButtonState('Analyzing...', true, true);
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
        // Get the backend for this tab
        const backend = await getTabAssignedBackend(tab.id);
        if (!backend) throw new Error('No backend available for this tab');
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
        analyzeAuthorsBtn.onclick = () => {
          // Store results and open full page
          chrome.storage.local.set({
            lastAuthorAnalysis: {
              timestamp: new Date().toISOString(),
              paperId: extractSsrnIdOrUrl(tab.url),
              data: data
            }
          });
          const unifiedId = extractSsrnIdOrUrl(tab.url);
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
          const paperId = extractSsrnIdOrUrl(tab.url);
          chrome.tabs.create({
            url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
          });
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
      
      const url = `${backend.url}/analysis/${paperId}`;
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const url = tab.url;
    const paperId = extractSsrnIdOrUrl(url);
    const isSSRN = url.includes('ssrn.com') && paperId && !await checkIfPDFPage(tab);
    const isPDF = await checkIfPDFPage(tab);
    let backend = await getTabAssignedBackend(tab.id);
    console.log('[POPUP] getTabAssignedBackend result:', backend);
    if (!backend) {
      showStatus('❌ No backends available. Please check your backend server.', 'error');
      setButtonState('Analyze Current Paper', true, false);
      analyzeBtn.style.backgroundColor = '#ccc';
      analyzeBtn.style.display = '';
      return;
    }
    let backendHasAnalysis = false;
    if (paperId) backendHasAnalysis = await checkAnalysisOnBackend(paperId, backend);
        
    // Hide all buttons initially
    showAuthorsButton(false);
    setButtonState('Analyze Current Paper', true, false);
    analyzeBtn.style.display = 'none';
    if (typeof analyzeAuthorsBtn !== 'undefined') analyzeAuthorsBtn.style.display = 'none';

    // SSRN page with paperID, not PDF
    if (isSSRN) {
      showAuthorsButton(true);
      setAuthorsButtonState('Analyze Authors', false, false);
      analyzeAuthorsBtn.style.display = '';
      analyzeAuthorsBtn.style.backgroundColor = '#9C27B0';
        if (backendHasAnalysis) {
        // Show both View Analysis and Analyze Authors
        analyzeBtn.style.display = '';
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = async () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId) });
          };
        showStatus('Analysis exists for this paper! Click "View Analysis" or "Analyze Authors".', 'success');
        } else {
        // Only show Analyze Authors
        showStatus('SSRN page detected. Click "Analyze Authors" to analyze author profiles.', 'info');
      }
      return;
    }

    // PDF page
    if (isPDF && paperId) {
      // Check persistent analyzing state
      let analyzingKey = getAnalyzingKey(tab.id, paperId);
      let analyzingObj = await chrome.storage.local.get([analyzingKey]);
      let isAnalyzing = analyzingObj[analyzingKey] === true;
      UnderAnalysis = isAnalyzing ? 1 : 0;
      if (backendHasAnalysis) {
        // Show View Analysis only
        analyzeBtn.style.display = '';
        setButtonState('View Analysis', false, false);
        analyzeBtn.style.backgroundColor = '#4CAF50';
        analyzeBtn.onclick = async () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId) });
        };
        // Clear analyzing state if analysis is done
        await chrome.storage.local.remove(analyzingKey);
        showStatus('Analysis exists for this paper! Click "View Analysis".', 'success');
        return;
      } else if (isAnalyzing) {
        // Show Analyzing... state
        analyzeBtn.style.display = '';
        setButtonState('Analyzing...', true, true);
        analyzeBtn.style.backgroundColor = '#FF9800';
        showStatus('Analyzing... Please wait.', 'progress');
        return;
      } else {
        // Only show Analyze Current Paper
        analyzeBtn.style.display = '';
        setButtonState('Analyze Current Paper', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.onclick = async () => {
          // Set persistent analyzing state
          let key = getAnalyzingKey(tab.id, paperId);
          await chrome.storage.local.set({ [key]: true });
          UnderAnalysis = 1;
          updatePopupUI();
          await analyzePaper();
        };
        showStatus('PDF detected. Click "Analyze Current Paper" to start analysis.', 'info');
        return;
      }
    }

    // Not SSRN, not PDF, or no paperId
    showStatus('Navigate to an SSRN paper (for author analysis) or open a PDF file (for paper analysis).', 'info');
            setButtonState('Analyze Current Paper', true, false);
            analyzeBtn.style.backgroundColor = '#ccc';
    analyzeBtn.style.display = '';
    showAuthorsButton(false);
          }

  // Patch analyzePaper to reset UnderAnalysis when analysis is done
  const originalAnalyzePaper = analyzePaper;
  analyzePaper = async function(...args) {
    try {
      await originalAnalyzePaper.apply(this, args);
      // After analysis, check backend again
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const paperId = tab && tab.url ? extractSsrnIdOrUrl(tab.url) : null;
      if (paperId && await checkAnalysisOnBackend(paperId)) {
        UnderAnalysis = 0;
      }
    } catch (e) {
      UnderAnalysis = 0;
      throw e;
    }
    updatePopupUI();
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
      // Do NOT reset UnderAnalysis or window.clickedAnalyzeThisSession here
      await updatePopupUI();
    } catch (error) {
      console.error('Popup: Initialization error:', error);
      updateBackendStatusDisplay(null, error.message);
    }
  }
  
  // Run initialization
  initializePopup();
  
  // Debug function to manually check status (for testing)
  window.debugCheckStatus = async function() {
    console.log('=== DEBUG: Manual status check ===');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab);
    
    if (tab && tab.url) {
      const paperId = extractSsrnIdOrUrl(tab.url);
      if (paperId) {
        const status = await getAnalysisStatus(paperId);
        console.log('Status for current URL:', status);
        
        // Also show all stored statuses
        const storage = await chrome.storage.local.get([STATUS_KEY]);
        console.log('All stored statuses:', storage[STATUS_KEY]);
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
      
      // Update UI to show completion
      hideProgress();
      setButtonState('View Analysis', false, false);
      analyzeBtn.style.backgroundColor = '#4CAF50';
      showStatus('Analysis completed successfully! Click "View Analysis" to see results.', 'success');
      
      // Update button onclick to view results
      analyzeBtn.onclick = async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        const paperId = extractSsrnIdOrUrl(tab.url);
        chrome.tabs.create({
          url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
        });
      };
      
      sendResponse({ received: true });
    } else if (message.action === 'analysisStarted') {
      console.log('Analysis started notification received');
      
      // Update UI to show analysis in progress and start monitoring
      setButtonState('Analyzing...', true, true);
      showProgress(1, 'Analysis started...');
      
      // Start monitoring for status changes
      setTimeout(() => {
        checkAndMonitorAnalysisStatus();
      }, 1000);
      
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
      const paperId = extractSsrnIdOrUrl(tab.url);
      chrome.tabs.create({
        url: chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId)
      });
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
      
      const url = `${backend.url}/analysis/${paperId}`;
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

  // On tab refresh or redirect, clear persistent analyzing state
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading') {
      const paperId = tab && tab.url ? extractSsrnIdOrUrl(tab.url) : null;
      if (paperId) {
        let key = getAnalyzingKey(tabId, paperId);
        chrome.storage.local.remove(key);
      }
      UnderAnalysis = 0;
    }
  });

  // Utility to get the assigned backend for the current tab
  async function getTabAssignedBackend(tabId) {
    const response = await chrome.runtime.sendMessage({ action: 'getTabBackend', tabId });
    return response.backend || null;
  }

  // Patch checkAnalysisOnBackend to accept a backend argument
  async function checkAnalysisOnBackend(paperId, backend) {
    try {
      console.log('Checking backend for analysis of paper:', paperId);
      if (!backend) {
        backend = await backendManager.getCurrentBackend();
      }
      if (!backend) {
        console.log('No healthy backend available for checking analysis');
        return false;
      }
      const url = `${backend.url}/analysis/${paperId}`;
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
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        backend = tab ? await getTabAssignedBackend(tab.id) : null;
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
              ✅ Connected to ${backend.name}
              <br><small>${backend.url} (${latency}ms)</small>
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
        statusDiv.innerHTML = '<div class="error">❌ No backends available</div>';
      }
    } catch (error) {
      console.error('Error updating backend status:', error);
      statusDiv.innerHTML = '<div class="error">❌ Backend detection failed</div>';
    }
  }
});
