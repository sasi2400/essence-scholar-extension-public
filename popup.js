document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
  async function setAnalysisStatus(url, status, errorMessage = null) {
    console.log('Setting analysis status:', { url, status, errorMessage });
    const now = new Date().toISOString();
    const update = {
      status,
      updatedAt: now,
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
    allStatus[url] = update;
    await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
    console.log('Analysis status set successfully:', update);
  }
  
  async function getAnalysisStatus(url) {
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    
    // Try exact match first
    let status = allStatus[url] || null;
    
    // If no exact match, try to find a similar URL (handle trailing slashes, etc.)
    if (!status) {
      const normalizedUrl = url.replace(/\/$/, ''); // Remove trailing slash
      for (const [storedUrl, storedStatus] of Object.entries(allStatus)) {
        const normalizedStoredUrl = storedUrl.replace(/\/$/, '');
        if (normalizedUrl === normalizedStoredUrl) {
          status = storedStatus;
          console.log('Found status with normalized URL match:', storedUrl);
          break;
        }
      }
    }
    
    console.log('Getting analysis status for URL:', url, 'Result:', status);
    return status;
  }
  
  // Function to check and monitor analysis status using local storage
  async function checkAndMonitorAnalysisStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        console.log('No tab or URL found for status monitoring');
        return;
      }
      
      console.log('Checking analysis status for URL:', tab.url);
      const status = await getAnalysisStatus(tab.url);
      console.log('Current analysis status:', status);
      
      // Always hide/disable View Analysis button unless status is complete
      setButtonState('Analyze Current Paper', false, false);
      analyzeBtn.style.backgroundColor = '#2196F3';
      analyzeBtn.onclick = analyzePaper;

      if (!status) {
        console.log('No analysis status found for this URL');
        return;
      }
      
      if (status.status === 'in_progress') {
        console.log('Analysis in progress, starting monitoring...');
        showStatus('Analysis in progress for this paper. Monitoring for completion...', 'progress');
        setButtonState('Analyzing...', true, true); // Disable button
        analyzeBtn.style.backgroundColor = '#FF9800';
        // Hide View Analysis button if present
        // Start monitoring for status changes
        const monitorInterval = setInterval(async () => {
          try {
            const currentStatus = await getAnalysisStatus(tab.url);
            console.log('Current status check result:', currentStatus);
            if (currentStatus && currentStatus.status !== 'in_progress') {
              console.log('Status changed from in_progress to:', currentStatus.status);
              clearInterval(monitorInterval);
              if (currentStatus.status === 'complete') {
                // Only now show View Analysis if result is available
                const hasResult = await checkForExistingAnalysis();
                if (hasResult) {
                  showStatus('Analysis complete! Click "View Analysis" to see results.', 'success');
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
                } else {
                  // No result, show error or reset
                  setButtonState('Analyze Current Paper', false, false);
                  analyzeBtn.style.backgroundColor = '#2196F3';
                  analyzeBtn.onclick = analyzePaper;
                  showStatus('Analysis complete, but no results found. Please try again.', 'error');
                }
              } else if (currentStatus.status === 'error') {
                showStatus('Analysis failed: ' + (currentStatus.errorMessage || 'Unknown error'), 'error');
                setButtonState('Analyze Current Paper', false, false);
                analyzeBtn.style.backgroundColor = '#2196F3';
                analyzeBtn.onclick = analyzePaper;
              }
            }
          } catch (error) {
            console.error('Error monitoring analysis status:', error);
            clearInterval(monitorInterval);
          }
        }, 2000);
        setTimeout(() => {
          console.log('Stopping status monitoring after timeout');
          clearInterval(monitorInterval);
        }, 10 * 60 * 1000);
      } else if (status.status === 'queued') {
        setButtonState('Queued...', true, true);
        analyzeBtn.style.backgroundColor = '#FF9800';
        showStatus('Analysis is queued. Please wait...', 'progress');
      } else if (status.status === 'complete') {
        // Only show View Analysis if result is available
        const hasResult = await checkForExistingAnalysis();
        if (hasResult) {
          showStatus('Analysis complete for this paper. Click "View Analysis" to see results.', 'success');
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
        } else {
          setButtonState('Analyze Current Paper', false, false);
          analyzeBtn.style.backgroundColor = '#2196F3';
          analyzeBtn.onclick = analyzePaper;
          showStatus('Analysis complete, but no results found. Please try again.', 'error');
        }
      } else if (status.status === 'error') {
        showStatus('Analysis failed: ' + (status.errorMessage || 'Unknown error'), 'error');
        setButtonState('Analyze Current Paper', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.onclick = analyzePaper;
      }
    } catch (error) {
      console.error('Error checking analysis status:', error);
    }
  }
  
  // Function to restore analysis state if in progress (reconnected to background script)
  async function restoreAnalysisState() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      // First check local storage status
      const localStatus = await getAnalysisStatus(tab.url);
      if (localStatus && localStatus.status === 'in_progress') {
        console.log('Local storage shows analysis in progress, starting monitoring...');
        // Start monitoring for completion
        checkAndMonitorAnalysisStatus();
        return;
      }

      // If no local status, check background script status
      const status = await checkAnalysisStatus(tab.id);
      
      if (status.inProgress || status.analysisInProgress) {
        console.log('Background script shows analysis in progress, setting local status...');
        
        // Set local status to in progress and start monitoring
        await setAnalysisStatus(tab.url, 'in_progress');
        checkAndMonitorAnalysisStatus();
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
      console.log('=== POPUP ANALYSIS START ===');
      console.log('Popup: analyzePaper function called');
      
      // Check if button is disabled (for local files)
      if (analyzeBtn && analyzeBtn.disabled) {
        console.log('Popup: Analyze button is disabled, ignoring click');
        return;
      }
      
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      console.log('Popup: Current tab:', tab);
      
      if (!tab.url) {
        throw new Error('No active tab found');
      }

      // Check if we're already in the fullpage view
      if (tab.url.includes('fullpage.html')) {
        // If we're in fullpage view, just focus on the current tab
        await chrome.tabs.update(tab.id, { active: true });
        return;
      }

      // Only allow paper analysis on PDF pages (since SSRN pages only show author analysis)
      const isPDF = await checkIfPDFPage(tab);
      if (!isPDF) {
        throw new Error('Paper analysis is only available for PDF files. For SSRN pages, use "Analyze Authors" instead.');
      }

      // Check for existing analysis first (only when user clicks analyze)
      console.log('Popup: Checking for existing analysis...');
      const hasExistingAnalysis = await checkForExistingAnalysis();
      if (hasExistingAnalysis) {
        console.log('Popup: Existing analysis found, stopping here');
        return; // Stop here if existing analysis was found and user chose to view it
      }

      // Check if analysis is already in progress or queued
      console.log('Popup: Checking analysis status...');
      const status = await checkAnalysisStatus(tab.id);
      if (status && (status.inProgress || status.analysisInProgress || status.queued)) {
        if (status.queued) {
          const queueMsg = status.queuePosition > 0 
            ? `Analysis is queued (position ${status.queuePosition}). Please wait...`
            : 'Analysis is queued. Please wait...';
          console.log('Analysis already queued, not starting new one');
          showStatus(queueMsg, 'progress');
        } else {
          console.log('Analysis already in progress, not starting new one');
          showStatus('Analysis is already in progress. Please wait...', 'progress');
        }
        return;
      }

      // Start analysis process
      console.log('Popup: Starting analysis process...');
      setButtonState('Analyzing...', true, true);
      showProgress(1, 'Extracting content from the page...');
      
      // Set analysis status to in progress
      console.log('About to set analysis status to in_progress for URL:', tab.url);
      await setAnalysisStatus(tab.url, 'in_progress');
      console.log('Analysis status set to in_progress');
      
      // Notify background script that analysis is starting
      try {
        console.log('Popup: Sending analysisStarted message to background script for tabId:', tab.id);
        const response = await chrome.runtime.sendMessage({ 
          action: 'analysisStarted', 
          tabId: tab.id,
          url: tab.url
        });
        console.log('Popup: Background script response to analysisStarted:', response);
      } catch (error) {
        console.error('Popup: Could not notify background script:', error);
      }

      // Ensure content script is injected
      console.log('Popup: Ensuring content script is injected...');
      await ensureContentScript(tab.id);

      // Wait a short moment for the content script to initialize
      console.log('Popup: Waiting for content script to initialize...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update progress
      showProgress(2, 'Requesting content from the page...');

      // Request content from the content script
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
      
      console.log('Popup: Content received successfully, content length:', response.content.length || 'N/A');

      // Update progress
      showProgress(2, 'Sending content to AI for analysis...');

      try {
        console.log('Popup: Starting backend analysis with smart detection...');
        console.log('Popup: Content to send:', typeof response.content, response.content ? 'Content available' : 'No content');
        
        // Get LLM settings
        const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', openaiKey: '' };
        
        // Extract paper ID
        const paperId = extractSsrnIdOrUrl(tab.url);
        const storageKey = `analysis_${paperId}`;
        
        // Check cache
        let cached = await chrome.storage.local.get([storageKey]);
        if (cached[storageKey]) {
          showStatus('Loaded analysis from cache.', 'success');
          displayAnalysis(cached[storageKey], tab.url);
          return;
        }

        // Add paper ID to content
        response.content.paperId = paperId;
        
        // Use consistent model mapping - null for Gemini to use backend default
        const modelToSend = llmSettings.model === 'openai' ? 'openai-4o' : null;
        const apiKeyToSend = llmSettings.model === 'openai' ? llmSettings.openaiKey : undefined;
        
        console.log('Popup: Sending to backend with model:', modelToSend, 'hasApiKey:', !!apiKeyToSend);

        const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            content: response.content,
            model: modelToSend,
            openai_api_key: apiKeyToSend
          })
        });

        console.log('Popup: Backend response received');

        if (!serverResponse.ok) {
          const errorText = await serverResponse.text();
          throw new Error(`Backend error: ${serverResponse.status} - ${errorText}`);
        }

        const data = await serverResponse.json();
        console.log('Popup: Backend response data:', data);

        if (data.error) {
          throw new Error(data.error);
        }

        // Handle local file response - show guidance instead of redirecting
        if (data.action === 'open_fullpage' && data.localFile) {
          console.log('Popup: Local file detected, showing guidance');
          const fileName = data.fileName || 'PDF file';
          
          showStatus(`📄 Local PDF File Detected: ${fileName}`, 'info');
          showStatus('Click "Open Full Page Interface" to upload and analyze this file.', 'info');
          
          // Hide the main analyze button and show fullpage button instead
          setButtonState('Analyze Current Paper', true, false); // Disable main button
          analyzeBtn.style.backgroundColor = '#ccc'; // Gray out main button
          
          // Show the full page interface button
          showFullpageButton(true);
          
          return;
        }

        // Update progress
        showProgress(3, 'Analysis complete! Storing results...');

        // When storing analysis results:
        const analysisResult = {
          timestamp: new Date().toISOString(),
          paperId: paperId,
          title: response.content.title || 'Document',
          content: response.content,
          summary: data.summary,
          autoAnalyzed: false
        };
        cached = await chrome.storage.local.get([storageKey]); // Declare only once
        if (!cached[storageKey]) {
          await chrome.storage.local.set({ [storageKey]: analysisResult });
        }
        
        // Also store as lastAnalysis for backward compatibility with fullpage.html
        await chrome.storage.local.set({ lastAnalysis: analysisResult });

        // If author data is available from the full analysis, store it for the author view
        if (data.author_data) {
          console.log('Popup: Author data received from full analysis, storing for author view');
          const authorResult = {
            timestamp: new Date().toISOString(),
            paperId: paperId,
            data: data.author_data
          };
          
          // Store author analysis per tab URL
          const existingAuthorResults = await chrome.storage.local.get(['authorAnalysisResults']);
          const allAuthorResults = existingAuthorResults.authorAnalysisResults || {};
          allAuthorResults[tab.url] = authorResult;
          
          await chrome.storage.local.set({ 
            authorAnalysisResults: allAuthorResults,
            lastAuthorAnalysis: authorResult // For backward compatibility
          });
        }
        
        // Set analysis status to complete
        await setAnalysisStatus(tab.url, 'complete');

        // Notify background script that analysis is complete
        try {
          console.log('Popup: Sending analysisComplete message to background script for tabId:', tab.id);
          const response = await chrome.runtime.sendMessage({ 
            action: 'analysisComplete', 
            tabId: tab.id,
            url: tab.url,
            hasResults: true
          });
          console.log('Popup: Background script response to analysisComplete:', response);
        } catch (error) {
          console.error('Popup: Could not notify background script of completion:', error);
        }

        // Show completion status
        hideProgress();
        clearStatus();
        let statusMessage = 'DONE: Analysis complete! Click "Go to Full Page" to view the detailed summary.';
        if (data.author_data) {
          statusMessage += ` Author profiles also fetched: ${data.author_data.summary.total_authors} authors with ${data.author_data.summary.total_citations.toLocaleString()} total citations.`;
        }
        showStatus(statusMessage, 'success');
        
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

      } catch (error) {
        console.error('Error analyzing paper:', error);
        
        // Set analysis status to error
        await setAnalysisStatus(tab.url, 'error', error.message);
        
        // Notify background script that analysis failed
        try {
          console.log('Popup: Sending analysisError message to background script for tabId:', tab.id, 'Error:', error.message);
          const response = await chrome.runtime.sendMessage({ 
            action: 'analysisError', 
            tabId: tab.id,
            url: tab.url,
            error: error.message
          });
          console.log('Popup: Background script response to analysisError:', response);
        } catch (bgError) {
          console.error('Popup: Could not notify background script of error:', bgError);
        }
        
        // Handle specific error types
        if (error.name === 'AbortError') {
          throw new Error('Analysis timed out. The request took too long to complete. Please try again.');
        } else if (error.message.includes('Failed to fetch')) {
          throw new Error('Network error. Please check your internet connection and try again.');
        } else if (error.message.includes('signal is aborted')) {
          throw new Error('Request was cancelled. This might be due to a timeout or network issue. Please try again.');
        } else {
          throw new Error(`Failed to analyze paper: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.error('Error:', error);
      hideProgress();
      clearStatus();
      showStatus(`Error: ${error.message}`, 'error');
      setButtonState('Analyze Current Paper', false, false);
      
      // Set analysis status to error if we have a tab URL
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          await setAnalysisStatus(tab.url, 'error', error.message);
          
          // Notify background script that analysis failed
          try {
            console.log('Popup: Sending analysisError message to background script in catch block for tabId:', tab.id, 'Error:', error.message);
            const response = await chrome.runtime.sendMessage({ 
              action: 'analysisError', 
              tabId: tab.id,
              url: tab.url,
              error: error.message
            });
            console.log('Popup: Background script response to analysisError in catch block:', response);
          } catch (bgError) {
            console.error('Popup: Could not notify background script of error in catch block:', bgError);
          }
        }
      } catch (statusError) {
        console.error('Error setting analysis status:', statusError);
      }
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
      
      if (isPDF) {
        // PDF detected - check if it's a local file
        const isLocalFile = tab.url.startsWith('file:///');
        
        if (isLocalFile) {
          // Local PDF detected - show guidance to user
          console.log('checkPageType: Local PDF detected - showing guidance');
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
        } else {
          // Web-hosted PDF detected - show paper analysis option
          console.log('checkPageType: Web-hosted PDF detected - enabling paper analysis, hiding author analysis');
          showStatus('PDF detected. Click "Analyze Current Paper" to start analysis.', 'info');
          setButtonState('Analyze Current Paper', false, false);
          analyzeBtn.style.backgroundColor = '#2196F3'; // Blue for ready state
          showAuthorsButton(false); // Hide authors button for PDFs
          showFullpageButton(false); // Hide fullpage button
        }
        
      } else if (tab.url && tab.url.includes('ssrn.com')) {
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
  const settingsSaveBtn = document.getElementById('settings-save-btn');
  const settingsCancelBtn = document.getElementById('settings-cancel-btn');

  // Open settings modal
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Load settings from storage
      chrome.storage.local.get(['llmSettings'], (result) => {
        const settings = result.llmSettings || { model: 'gemini', openaiKey: '' };
        modelSelect.value = settings.model || 'gemini';
        openaiKeyInput.value = settings.openaiKey || '';
        openaiKeySection.style.display = (settings.model === 'openai') ? 'block' : 'none';
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

  // Show/hide OpenAI key input based on model selection
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      openaiKeySection.style.display = (modelSelect.value === 'openai') ? 'block' : 'none';
    });
  }

  // Save settings
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      const model = modelSelect.value;
      const openaiKey = openaiKeyInput.value.trim();
      chrome.storage.local.set({ llmSettings: { model, openaiKey } }, () => {
        settingsModal.style.display = 'none';
      });
    });
  }

  // Initialize popup with backend detection
  console.log('Popup: Initializing with smart backend detection...');
  console.log('Popup: Available backends:', Object.keys(CONFIG.BACKENDS));
  
  // Function to check for existing analysis by paper ID on popup load
  async function checkForExistingAnalysisByPaperId() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return;
      const paperId = extractSsrnIdOrUrl(tab.url);
      if (!paperId) return;
      const storageKey = `analysis_${paperId}`;
      const cached = await chrome.storage.local.get([storageKey]);
      if (cached[storageKey] && cached[storageKey].summary) {
        // Analysis exists, show View Analysis button
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
        showStatus('Analysis already exists for this paper! Click "View Analysis" to see results.', 'success');
      } else {
        // No analysis, show Analyze button
        setButtonState('Analyze Current Paper', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.onclick = analyzePaper;
        showStatus('No analysis found for this paper. Click "Analyze Current Paper" to start.', 'info');
      }
    } catch (error) {
      console.error('Error checking for existing analysis by paper ID:', error);
    }
  }

  // Display backend status and initialize
  async function initializePopup() {
    try {
      // Show loading
      displayBackendStatus();
      
      // Debug storage state
      await debugStorageState();
      
      // Detect and display current backend
      await updateBackendStatusDisplay();
      
      // Restore analysis state if in progress (reconnected)
      await restoreAnalysisState();
      
      // Check page type and set appropriate button states
      await checkPageType();
      await checkForExistingAnalysisByPaperId();

      // Check and monitor analysis status
      console.log('Calling checkAndMonitorAnalysisStatus...');
      await checkAndMonitorAnalysisStatus();
      console.log('checkAndMonitorAnalysisStatus completed');
      
      console.log('Popup: Initialization complete');
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
      const status = await getAnalysisStatus(tab.url);
      console.log('Status for current URL:', status);
      
      // Also show all stored statuses
      const storage = await chrome.storage.local.get([STATUS_KEY]);
      console.log('All stored statuses:', storage[STATUS_KEY]);
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
        // Call the backend to analyze authors using smart detection
        console.log('Popup: Calling author analysis endpoint with smart backend detection...');
        
        const serverResponse = await makeApiRequest(CONFIG.ANALYZE_AUTHORS_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({ 
            authors: authors,
            affiliations: affiliations
          })
        });

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
});
