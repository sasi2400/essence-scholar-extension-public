document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements using new IDs
  const analyzeBtn = document.getElementById('analyze-btn');
  const openFullBtn = document.getElementById('open-full-btn');
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
      const result = await chrome.storage.local.get(['lastAnalysis']);
      if (result.lastAnalysis) {
        const analysis = result.lastAnalysis;
        console.log('Found existing analysis:', analysis);
        
        // Check if this analysis is recent (within last 5 minutes)
        const analysisTime = new Date(analysis.timestamp);
        const now = new Date();
        const timeDiff = now - analysisTime;
        const isRecent = timeDiff < 5 * 60 * 1000; // 5 minutes
        
        if (isRecent) {
          // Show that analysis exists and offer to view it
          setButtonState('View Analysis', false, false);
          analyzeBtn.style.backgroundColor = '#4CAF50';
          analyzeBtn.onclick = () => {
            chrome.tabs.create({
              url: chrome.runtime.getURL('fullpage.html')
            });
          };
          
          showStatus('DONE: Analysis already exists! Click "View Analysis" to see results.', 'success');
          return true; // Indicate that analysis exists
        }
      }
      return false; // No recent analysis found
    } catch (error) {
      console.error('Error checking for existing analysis:', error);
      return false;
    }
  }

  // Function to check analysis status from background script
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
        monitorAnalysisProgress(tab.id);
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
  function monitorAnalysisProgress(tabId) {
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
                  // Analysis may have failed
                  setButtonState('Analyze Current Paper', false, false);
                  showStatus('Analysis completed. Click to start a new analysis.', 'info');
                }
              } catch (error) {
                console.log('Could not read badge text:', error);
                setButtonState('Analyze Current Paper', false, false);
                showStatus('Analysis completed. Click to start a new analysis.', 'info');
              }
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring analysis progress:', error);
        clearInterval(checkInterval);
        hideProgress();
        setButtonState('Analyze Current Paper', false, false);
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

      // Check if we're on a valid page
      if (!tab.url.includes('ssrn.com') && 
          !tab.url.toLowerCase().endsWith('.pdf') && 
          !tab.url.startsWith('file:///')) {
        throw new Error('Please navigate to an SSRN paper page or open a PDF file first, then click Analyze');
      }

      // Check for existing analysis first (only when user clicks analyze)
      console.log('Popup: Checking for existing analysis...');
      const hasExistingAnalysis = await checkForExistingAnalysis();
      if (hasExistingAnalysis) {
        console.log('Popup: Existing analysis found, stopping here');
        return; // Stop here if existing analysis was found and user chose to view it
      }

      // Check if analysis is already in progress
      console.log('Popup: Checking analysis status...');
      const status = await checkAnalysisStatus(tab.id);
      if (status && (status.inProgress || status.analysisInProgress)) {
        console.log('Analysis already in progress, not starting new one');
        showStatus('Analysis is already in progress. Please wait...', 'progress');
        return;
      }

      // Start analysis process
      console.log('Popup: Starting analysis process...');
      setButtonState('Analyzing...', true, true);
      showProgress(1, 'Extracting content from the page...');

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
        
        // Use the new smart API request system
        const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({ content: response.content })
        });

        console.log('Popup: Backend response received');

        if (!serverResponse.ok) {
          const errorText = await serverResponse.text();
          throw new Error(`Backend error: ${serverResponse.status} - ${errorText}`);
        }

        const data = await serverResponse.json();

        if (data.error) {
          throw new Error(data.error);
        }

        // Update progress
        showProgress(3, 'Analysis complete! Storing results...');

        // Store the content and analysis for the full page view
        await chrome.storage.local.set({
          lastAnalysis: {
            timestamp: new Date().toISOString(),
            url: tab.url,
            title: response.content.title || 'Document',
            content: response.content,
            summary: data.summary,
            autoAnalyzed: false
          }
        });

        // Show completion status
        hideProgress();
        clearStatus();
        showStatus('DONE: Analysis complete! Click "Go to Full Page" to view the detailed summary.', 'success');
        
        // Update button state
        setButtonState('View Analysis', false, false);
        analyzeBtn.style.backgroundColor = '#4CAF50';
        analyzeBtn.onclick = () => {
          chrome.tabs.create({
            url: chrome.runtime.getURL('fullpage.html')
          });
        };

      } catch (error) {
        console.error('Error analyzing paper:', error);
        
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

  // Function to check if current tab is a PDF and set up the UI accordingly
  async function checkPageType() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url && (tab.url.toLowerCase().endsWith('.pdf') || tab.url.startsWith('file:///'))) {
        // PDF detected - show ready state and wait for user to click analyze
        showStatus('PDF detected. Click "Analyze Current Paper" to start analysis.', 'info');
        setButtonState('Analyze Current Paper', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3'; // Blue for ready state
        showAuthorsButton(false); // Hide authors button for PDFs
        
      } else if (tab.url && tab.url.includes('ssrn.com')) {
        // SSRN page detected
        showStatus('SSRN page detected. Click "Analyze Current Paper" to start analysis.', 'info');
        setButtonState('Analyze Current Paper', false, false);
        analyzeBtn.style.backgroundColor = '#2196F3';
        
        // Show authors button for SSRN pages
        showAuthorsButton(true);
        setAuthorsButtonState('Analyze Authors', false, false);
        analyzeAuthorsBtn.style.backgroundColor = '#9C27B0';
        
      } else {
        // Not a supported page
        showStatus('Navigate to an SSRN paper or open a PDF file to analyze.', 'info');
        setButtonState('Analyze Current Paper', true, false); // Disable button
        analyzeBtn.style.backgroundColor = '#ccc';
        showAuthorsButton(false); // Hide authors button for unsupported pages
      }
    } catch (error) {
      console.error('Error checking page type:', error);
      showStatus('Error checking page status. Please try again.', 'error');
      showAuthorsButton(false);
    }
  }



  // Event listeners
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzePaper);
  }
  
  if (analyzeAuthorsBtn) {
    analyzeAuthorsBtn.addEventListener('click', analyzeAuthors);
  }
  
  if (openFullBtn) {
    openFullBtn.addEventListener('click', function() {
      chrome.tabs.create({
        url: chrome.runtime.getURL('fullpage.html')
      });
    });
  }

  // Initialize popup with backend detection
  console.log('Popup: Initializing with smart backend detection...');
  console.log('Popup: Available backends:', Object.keys(CONFIG.BACKENDS));
  
  // Display backend status and initialize
  async function initializePopup() {
    try {
      // Show loading
      displayBackendStatus();
      
      // Detect and display current backend
      await updateBackendStatusDisplay();
      
      // Check page type
      await checkPageType();
      
      // Restore analysis state if in progress
      await restoreAnalysisState();
      
      console.log('Popup: Initialization complete');
    } catch (error) {
      console.error('Popup: Initialization error:', error);
      updateBackendStatusDisplay(null, error.message);
    }
  }
  
  // Run initialization
  initializePopup();

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
      analyzeBtn.onclick = () => {
        chrome.tabs.create({
          url: chrome.runtime.getURL('fullpage.html')
        });
      };
      
      sendResponse({ received: true });
    } else if (message.action === 'analysisStarted') {
      console.log('Analysis started notification received');
      
      // Update UI to show analysis in progress
      setButtonState('Analyzing...', true, true);
      showProgress(1, 'Analysis started...');
      
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

      // Only allow author analysis on SSRN pages
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
              url: tab.url,
              data: data
            }
          });
          chrome.tabs.create({
            url: chrome.runtime.getURL('fullpage.html') + '?view=authors'
          });
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
});
