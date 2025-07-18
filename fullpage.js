

document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
  // Global variables
  let viewMode = null; // Will be set from URL parameters
  let isHomepage = false; // Track if we're on homepage
  
  console.log('Fullpage loaded: DOMContentLoaded event fired');
  
  if (typeof CONFIG !== 'undefined') {
    console.log('Available backends:', Object.keys(CONFIG.BACKENDS));
  }
  
  // Initialize backend detection early
  if (typeof backendManager !== 'undefined') {
    backendManager.detectBestBackend().then(backend => {
      if (backend) {
        console.log('Initial backend selected for fullpage:', backend.name, backend.url);
      } else {
        console.log('No healthy backends found during fullpage initialization');
      }
    }).catch(error => {
      console.error('Error during fullpage backend detection:', error);
    });
  }
  
  // Homepage elements
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const searchBtnText = document.getElementById('searchBtnText');
  const searchBtnLoading = document.getElementById('searchBtnLoading');
  const searchResults = document.getElementById('searchResults');
  const settingsForm = document.getElementById('settingsForm');
  const googleScholarUrl = document.getElementById('googleScholarUrl');
  const researchInterests = document.getElementById('researchInterests');
  const saveBtnText = document.getElementById('saveBtnText');
  const saveBtnLoading = document.getElementById('saveBtnLoading');
  const totalPapers = document.getElementById('totalPapers');
  const analyzedPapers = document.getElementById('analyzedPapers');
  const totalAuthors = document.getElementById('totalAuthors');
  
  // Upload elements
  const uploadArea = document.getElementById('uploadArea');
  const pdfUploadHomepage = document.getElementById('pdfUploadHomepage');
  const uploadBtnHomepage = document.getElementById('uploadBtnHomepage');

  // Homepage functions
  async function loadHomepageStats() {
    try {
      const backend = await backendManager.detectBestBackend();
      if (!backend) {
        console.error('No backend available for stats');
        return;
      }

      const response = await fetch(`${backend.url}/storage/info`);
      if (response.ok) {
        const data = await response.json();
        
        // Update stats with animated counter
        const finalCount = data.persistent_storage.analyses || 0;
        if (analyzedPapers) {
          animateCounter(analyzedPapers, 0, finalCount, 1000); // 1 second animation
        }
        
        // Debug logging
        console.log('📊 Homepage Stats:', {
          analyzedPapers: finalCount
        });
      }
    } catch (error) {
      console.error('Error loading homepage stats:', error);
    }
  }

  async function searchPapers(query) {
    try {
      const backend = await backendManager.detectBestBackend();
      if (!backend) {
        throw new Error('No backend available');
      }

      const response = await fetch(`${backend.url}/papers/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          max_results: 20
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to search papers');
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error('Error searching papers:', error);
      throw error;
    }
  }

  function displaySearchResults(papers) {
    if (!searchResults) return;

    if (papers.length === 0) {
      searchResults.innerHTML = '<div class="no-results">No papers found matching your search.</div>';
      searchResults.style.display = 'block';
      return;
    }

    const resultsHtml = papers.map((paper, idx) => {
      const title = paper.title || 'Untitled';
      // Robust author extraction
      let authors = '';
      if (Array.isArray(paper.metadata?.authors) && paper.metadata.authors.length > 0) {
        authors = paper.metadata.authors.join(', ');
      } else if (Array.isArray(paper.authors) && paper.authors.length > 0) {
        authors = paper.authors.join(', ');
      } else if (typeof paper.metadata?.authors === 'string' && paper.metadata.authors) {
        authors = paper.metadata.authors;
      } else if (typeof paper.authors === 'string' && paper.authors) {
        authors = paper.authors;
      }
      const paperId = paper.paper_id || paper.paperId || '';
      const hasAnalysis = paper.analysis !== null && paper.analysis !== undefined;
      
      return `
        <div class="search-result-item" data-paper-id="${paperId}">
          <div class="search-result-title">${title}</div>
          <div class="search-result-meta">
            Paper ID: ${paperId} ${hasAnalysis ? '• Analyzed' : '• Not analyzed'}
          </div>
          <div class="search-result-authors">${authors ? authors : '<span style=\'color:#bbb\'>No authors found</span>'}</div>
        </div>
      `;
    }).join('');

    searchResults.innerHTML = resultsHtml;
    searchResults.style.display = 'block';

    // Add click handlers for navigation
    Array.from(searchResults.getElementsByClassName('search-result-item')).forEach(item => {
      item.addEventListener('click', function() {
        const paperId = this.getAttribute('data-paper-id');
        if (paperId) {
          window.location.href = `fullpage.html?paperID=${encodeURIComponent(paperId)}`;
        }
      });
    });
  }

  async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      searchResults.style.display = 'none';
      return;
    }

    // Show loading state
    searchBtn.disabled = true;
    searchBtnText.style.display = 'none';
    searchBtnLoading.style.display = 'inline-block';

    try {
      const papers = await searchPapers(query);
      displaySearchResults(papers);
    } catch (error) {
      searchResults.innerHTML = `<div class="no-results">Error searching papers: ${error.message}</div>`;
      searchResults.style.display = 'block';
    } finally {
      // Hide loading state
      searchBtn.disabled = false;
      searchBtnText.style.display = 'inline';
      searchBtnLoading.style.display = 'none';
    }
  }

  async function loadSettings() {
    try {
      // Try to load from backend first
      const backend = await backendManager.detectBestBackend();
      if (backend) {
        try {
          const response = await fetch(`${backend.url}/user/settings`);
          if (response.ok) {
            const data = await response.json();
            if (googleScholarUrl) googleScholarUrl.value = data.google_scholar_url || '';
            if (researchInterests) researchInterests.value = data.research_interests || '';
            return;
          }
        } catch (error) {
          console.log('Backend settings not available, using local storage');
        }
      }
      
      // Fallback to local storage
      const result = await chrome.storage.local.get(['userSettings']);
      const settings = result.userSettings || {};
      
      if (googleScholarUrl) googleScholarUrl.value = settings.googleScholarUrl || '';
      if (researchInterests) researchInterests.value = settings.researchInterests || '';
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    saveBtnText.style.display = 'none';
    saveBtnLoading.style.display = 'inline-block';

    try {
      const settings = {
        google_scholar_url: googleScholarUrl.value.trim(),
        research_interests: researchInterests.value.trim()
      };

      // Try to save to backend first
      const backend = await backendManager.detectBestBackend();
      if (backend) {
        try {
          const response = await fetch(`${backend.url}/user/settings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('Settings saved to backend:', data);
          }
        } catch (error) {
          console.log('Backend settings not available, using local storage');
        }
      }
      
      // Also save to local storage as backup
      const localSettings = {
        googleScholarUrl: settings.google_scholar_url,
        researchInterests: settings.research_interests,
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ userSettings: localSettings });
      
      // Show success message
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings: ' + error.message);
    } finally {
      // Hide loading state
      submitBtn.disabled = false;
      saveBtnText.style.display = 'inline';
      saveBtnLoading.style.display = 'none';
    }
  }

  // Counter animation function
  function animateCounter(element, start, end, duration) {
    const startTime = performance.now();
    const difference = end - start;
    
    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(start + (difference * easeOutQuart));
      
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    }
    
    requestAnimationFrame(updateCounter);
  }

  // Global function to view a paper (called from search results)
  window.viewPaper = function(paperId) {
    const url = chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId);
    window.location.href = url;
  };

  // Upload functionality for homepage
  function setupHomepageUpload() {
    if (!uploadArea || !pdfUploadHomepage || !uploadBtnHomepage) return;
    
    // Click to upload
    uploadBtnHomepage.addEventListener('click', () => {
      pdfUploadHomepage.click();
    });
    
    // File input change
    pdfUploadHomepage.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleHomepagePdfUpload(file);
      }
    });
    
    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.querySelector('.upload-placeholder').classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.querySelector('.upload-placeholder').classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.querySelector('.upload-placeholder').classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type === 'application/pdf') {
        handleHomepagePdfUpload(files[0]);
      }
    });
  }
  
  async function handleHomepagePdfUpload(file) {
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file.');
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      alert('File size must be less than 50MB.');
      return;
    }
    
    try {
      // Show loading state
      const uploadPlaceholder = uploadArea.querySelector('.upload-placeholder');
      const originalContent = uploadPlaceholder.innerHTML;
      uploadPlaceholder.innerHTML = `
        <div class="loading" style="margin: 20px auto;"></div>
        <p>Processing PDF...</p>
      `;
      
      // Switch to analysis view by hiding homepage content
      document.body.classList.remove('homepage-mode');
      
      // Use the existing handlePdfUpload function from the original fullpage.js
      const result = await handlePdfUpload(file);
      
      // After analysis is complete, update the URL with the paper ID
      // so the page knows to display the analysis results
      if (result && result.paperId) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('paperID', result.paperId);
        window.history.replaceState({}, '', currentUrl.toString());
        
        // Trigger a page reload to properly initialize the analysis view
        window.location.reload();
      }
    } catch (error) {
      console.error('Error uploading PDF:', error);
      alert('Error uploading PDF: ' + error.message);
      
      // Restore original content and homepage mode
      const uploadPlaceholder = uploadArea.querySelector('.upload-placeholder');
      uploadPlaceholder.innerHTML = originalContent;
      document.body.classList.add('homepage-mode');
    }
  }

  // Event listeners for homepage
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        handleSearch();
      }
    });
  }
  
  if (searchBtn) {
    searchBtn.addEventListener('click', handleSearch);
  }
  
  if (settingsForm) {
    settingsForm.addEventListener('submit', saveSettings);
  }
  
  // Setup upload functionality
  setupHomepageUpload();
  
  async function setAnalysisStatus(paperId, status, errorMessage = null) {
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
  }
  
  async function getAnalysisStatus(paperId) {
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    return allStatus[paperId] || null;
  }
  
  async function clearStaleAnalysisStatus() {
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    // Clear any stale in_progress statuses
    let hasChanges = false;
    for (const [key, status] of Object.entries(allStatus)) {
      if (status.status === 'in_progress') {
        const startedAt = new Date(status.startedAt).getTime();
        if (now - startedAt > fiveMinutes) {
          delete allStatus[key];
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      await chrome.storage.local.set({ [STATUS_KEY]: allStatus });
    }
  }
  
  const analyzeBtn = document.getElementById('analyzeBtn');
  const backBtn = document.getElementById('backBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusDiv = document.getElementById('status');
  const summaryDiv = document.getElementById('summary');
  const uploadSection = document.getElementById('uploadSection');
  const pdfUpload = document.getElementById('pdfUpload');
  const uploadBtn = document.getElementById('uploadBtn');
  const chatSection = document.getElementById('chatSection');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const viewAuthorsBtn = document.getElementById('viewAuthorsBtn');
  
  // New content structure elements
  const analysisContent = document.getElementById('analysisContent');
  const paperInfo = document.getElementById('paperInfo');
  const paperTitle = document.getElementById('paperTitle');
  const paperMeta = document.getElementById('paperMeta');

  let currentPdfContent = null;



  // Function to clear all content
  async function clearContent() {
    try {
      // Get current tab to clear tab-specific content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab && tab.url) {
        // Clear tab-specific analysis results
        const existingResults = await chrome.storage.local.get(['analysisResults', 'authorAnalysisResults']);
        const allResults = existingResults.analysisResults || {};
        const allAuthorResults = existingResults.authorAnalysisResults || {};
        
        if (allResults[tab.url]) {
          delete allResults[tab.url];
          await chrome.storage.local.set({ analysisResults: allResults });
          console.log('Cleared analysis results for current tab');
        }
        
        if (allAuthorResults[tab.url]) {
          delete allAuthorResults[tab.url];
          await chrome.storage.local.set({ authorAnalysisResults: allAuthorResults });
          console.log('Cleared author analysis results for current tab');
        }
      }
      
      // Also clear legacy storage for backward compatibility
      await chrome.storage.local.remove(['lastAnalysis', 'lastAuthorAnalysis']);
      
      // Clear UI elements
      clearStatus();
      summaryDiv.innerHTML = '';
      chatMessages.innerHTML = '';
      chatSection.style.display = 'none';
      currentPdfContent = null;
      
      // Hide analysis content structure
      if (analysisContent) {
        analysisContent.style.display = 'none';
      }
      if (paperInfo) {
        paperInfo.style.display = 'none';
      }
      if (paperTitle) {
        paperTitle.textContent = '';
      }
      if (paperMeta) {
        paperMeta.textContent = '';
      }
      
      // Reset file input
      pdfUpload.value = '';
      
      // Show upload section prominently
      uploadSection.style.display = 'block';
      
      updateStatus('Content cleared. Ready for new upload.');
    } catch (error) {
      console.error('Error clearing content:', error);
      updateStatus(`Error clearing content: ${error.message}`, true);
    }
  }

  // Function to update status with timestamp
  function updateStatus(message, isError = false) {
    const timestamp = new Date().toLocaleTimeString();
    const statusClass = isError ? 'error' : 'info';
    statusDiv.innerHTML += `<div class="${statusClass}">[${timestamp}] ${message}</div>`;
    statusDiv.scrollTop = statusDiv.scrollHeight;
  }

  // Function to clear status
  function clearStatus() {
    statusDiv.innerHTML = '';
    summaryDiv.innerHTML = '';
  }

  // Function to analyze content using smart backend detection
  async function analyzeWithSmartBackend(content) {
    updateStatus('Using smart backend detection for analysis...');
    
    try {
      // Add paperID to content if not present
      if (!content.paperId && content.paperUrl) {
        content.paperId = await extractSsrnIdOrUrl(content.paperUrl);
      }

      // Try multiple times with different backends
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          // Use streaming endpoint for better user experience
          const serverResponse = await makeStreamRequest(CONFIG.ANALYZE_STREAM_ENDPOINT, { 
            content,
            file_content: content.file_content // Move file_content to top level for backend
          }, (event) => {
            // Handle streaming updates with detailed progress messages
            if (event.status === 'progress' || event.status === 'extracting_pdf' || event.status === 'analyzing' || event.status === 'extracting_authors' || 
                event.status === 'junior_start' || event.status === 'junior_done' || event.status === 'pdf_extracted' || event.status === 'authors_extracted') {
              // Show detailed progress messages from the backend
              const message = event.message || 'Processing...';
              updateStatus(message);
              console.log(`[Stream] ${event.status}: ${message}`);
            } else if (event.status === 'error') {
              throw new Error(event.message || 'Analysis failed');
            }
          });

          if (!serverResponse || !serverResponse.summary) {
            throw new Error('No analysis results received');
          }

          const currentBackend = await backendManager.getCurrentBackend();
          updateStatus(`Successfully connected to ${currentBackend.name}`);
          return serverResponse;
        } catch (error) {
          attempts++;
          if (attempts === maxAttempts) {
            throw error;
          }
          console.log(`Attempt ${attempts} failed, trying next backend...`);
          await backendManager.refreshBackend();
        }
      }
    } catch (error) {
      console.error('Smart backend analysis failed:', error);
      throw new Error(`Could not connect to any healthy backend: ${error.message}`);
    }
  }

  // Function to convert markdown to HTML
  function markdownToHtml(markdown) {
    if (!markdown) {
      console.warn('No markdown content provided to markdownToHtml');
      return '<div class="markdown-content"><p>No content available</p></div>';
    }

    try {
      // Clean up markdown input
      const cleanMarkdown = markdown
        .replace(/\u0000/g, '') // Remove null characters
        .replace(/\r\n/g, '\n') // Normalize line endings
        .trim(); // Remove leading/trailing whitespace

      if (!cleanMarkdown) {
        console.warn('Markdown content is empty after cleanup');
        return '<div class="markdown-content"><p>No content available</p></div>';
      }

      // Check if marked library is available
      if (typeof marked === 'undefined') {
        console.error('Marked library not loaded');
        return '<div class="markdown-content"><p>' + cleanMarkdown + '</p></div>';
      }

      // Convert markdown to HTML using marked
      const html = marked.parse(cleanMarkdown);
      if (!html) {
        console.warn('Marked returned empty HTML');
        return '<div class="markdown-content"><p>No content available</p></div>';
      }

      // Wrap in markdown-content div and return
      return `<div class="markdown-content">${html}</div>`;
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      return '<div class="markdown-content"><p>Error converting content to HTML</p></div>';
    }
  }

  // Function to handle PDF upload
  async function handlePdfUpload(file) {
    try {
      clearStatus();
      updateStatus('Reading PDF file...');
      
      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        updateStatus('File too large. Maximum size is 50MB.', true);
        return null;
      }
      
      // Convert file to base64 using Promise
      const base64Content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          try {
            updateStatus('Converting PDF to base64...');
            
            // Extract base64 content (remove data:application/pdf;base64, prefix)
            const base64Content = e.target.result.split(',')[1];
            
            if (!base64Content) {
              reject(new Error('Failed to convert PDF to base64'));
              return;
            }
            
            resolve(base64Content);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = function(error) {
          console.error('Error reading file:', error);
          reject(new Error('Error reading PDF file. Please try again.'));
        };

        // Read as data URL (which gives us base64)
        reader.readAsDataURL(file);
      });
      
      updateStatus('PDF processed successfully. Starting analysis...');

      const content = {
        title: file.name.replace('.pdf', ''),
        paperId: file.name.replace('.pdf', ''),
        paperUrl: URL.createObjectURL(file),
        isLocalFile: true,
        filePath: file.name,
        hasPdf: true,
        file_content: base64Content // Send as base64 string - backend expects 'file_content'
      };

      currentPdfContent = content;
      const result = await analyzePaper(content);
      return result; // Return the result so we can get the paper ID
      
    } catch (error) {
      console.error('Error handling PDF upload:', error);
      updateStatus(`Error uploading PDF: ${error.message}`, true);
      // Show upload section again on error
      if (uploadSection) {
        uploadSection.style.display = 'block';
      }
      return null;
    }
  }

  // Function to analyze paper
  async function analyzePaper(content = null) {
    try {
      if (!content) {
        updateStatus('No content provided for analysis', true);
        return;
      }
      
      // Check if config is loaded
      if (typeof CONFIG === 'undefined') {
        updateStatus('Configuration not loaded. Please refresh the page.', true);
        return;
      }
      
      // Check if backendManager is loaded
      if (typeof backendManager === 'undefined') {
        updateStatus('Backend manager not loaded. Please refresh the page.', true);
        return;
      }
      
      // Extract paper ID
      const paperId = (await extractSsrnIdOrUrl(content.paperUrl)) || content.paperId;
      const storageKey = `analysis_${paperId}`;
      
      // Check cache before sending request
      updateStatus('Checking cache for existing analysis...');
      const cached = await chrome.storage.local.get([storageKey]);
      if (cached[storageKey] && cached[storageKey].summary) {
        updateStatus('Loaded analysis from cache.');
        const html = markdownToHtml(cached[storageKey].summary);
        summaryDiv.innerHTML = html;
        currentPdfContent = cached[storageKey].content || content;  // Use provided content as fallback
        
        // If there's author data, display it
        if (cached[storageKey].data && cached[storageKey].data.author_data) {
          displayAuthorAnalysis(cached[storageKey].data.author_data);
        }
        
        chatSection.style.display = 'block';
        return;
      }
      
      updateStatus('Starting new analysis...');
      
      // Hide upload section during analysis
      if (uploadSection) {
        uploadSection.style.display = 'none';
      }
      
      // Set analysis status to in progress
      await setAnalysisStatus(paperId, 'in_progress');
      
      // Use smart backend detection to connect to the server
      updateStatus('Connecting to backend...');
      const data = await analyzeWithSmartBackend(content);
      
      if (!data || !data.summary) {
        throw new Error('No summary received from server');
      }

      updateStatus('Analysis complete!');
      
      // Convert markdown to HTML and display
      const html = markdownToHtml(data.summary);
      summaryDiv.innerHTML = html;
      
      // Show chat section
      chatSection.style.display = 'block';
      
      // Store the content for chat functionality
      currentPdfContent = content;
      
      // When storing analysis results:
      const analysisResult = {
        timestamp: new Date().toISOString(),
        paperId: paperId,
        content: content,  // Store the full content
        summary: data.summary,
        data: data  // Store the entire data object
      };
      
      // Store in local storage
      const storageData = {};
      storageData[storageKey] = analysisResult;
      await chrome.storage.local.set(storageData);
      
      // Update analysis status to complete
      await setAnalysisStatus(paperId, 'complete');
      
      // Show View Author Analysis button if author data is available
      if (data.author_data && viewAuthorsBtn) {
        viewAuthorsBtn.style.display = 'inline-block';
        viewAuthorsBtn.style.backgroundColor = '#4CAF50';
        // Display author analysis if available
        displayAuthorAnalysis(data.author_data);
      }
      
      // Return the paper ID so the calling function can update the URL
      return { paperId: paperId };
      
    } catch (error) {
      console.error('Error analyzing paper:', error);
      updateStatus(`Analysis failed: ${error.message}`, true);
      
      // Show upload section again on error
      if (uploadSection) {
        uploadSection.style.display = 'block';
      }
      
      // Update analysis status to error and clear any cached error state
      if (paperId) {
        await setAnalysisStatus(paperId, 'error', error.message);
        const storageKey = `analysis_${paperId}`;
        await chrome.storage.local.remove([storageKey]);
        
        // Show retry button
        if (analyzeBtn) {
          analyzeBtn.style.display = 'inline-block';
          analyzeBtn.style.backgroundColor = '#2196F3';
          analyzeBtn.textContent = 'Retry Analysis';
          analyzeBtn.onclick = async () => {
            if (content) {
              await analyzePaper(content);
            } else {
              updateStatus('No paper content available for analysis', true);
            }
          };
        }
      }
      
      // Return null for error case
      return null;
    }
  }

  // Function to add message to chat
  function addMessage(message, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    if (isUser) {
      messageDiv.textContent = message;
    } else {
      messageDiv.innerHTML = markdownToHtml(message);
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageDiv; // Return the created messageDiv
  }

  // Function to handle chat
  async function handleChat(message) {
    if (!currentPdfContent) {
      addMessage('No PDF content available for chat. Please upload a PDF first.', false);
      return;
    }

    // First, display the user's message
    addMessage(message, true);

    // Add loading indicator and disable input
    const loadingMessage = addMessage('Thinking...', false);
    const sendButton = document.getElementById('sendBtn');
    const chatInputField = document.getElementById('chatInput');
    
    // Disable input and button while processing
    if (sendButton) sendButton.disabled = true;
    if (chatInputField) chatInputField.disabled = true;
    
    // Add typing indicator animation
    loadingMessage.classList.add('loading-message');
    loadingMessage.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    try {
      // Get LLM settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      // Format request to match backend's expected structure
      const requestBody = {
        message: message,
        paper: currentPdfContent, // Send the entire PDF content object as 'paper'
        model: getModelName(llmSettings.model),
        google_api_key: llmSettings.geminiKey || undefined,
        openai_api_key: llmSettings.openaiKey || undefined,
        claude_api_key: llmSettings.claudeKey || undefined
      };

      const response = await makeApiRequest(CONFIG.CHAT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      // Remove loading indicator
      loadingMessage.remove();

      if (response.ok) {
        const data = await response.json();
        addMessage(data.response, false);
      } else {
        const errorData = await response.text();
        console.error('Chat error response:', errorData);
        addMessage(`Error: ${errorData || 'Could not get response from server'}`, false);
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Remove loading indicator on error
      loadingMessage.remove();
      
      addMessage(`Error: ${error.message || 'Could not connect to server'}`, false);
    } finally {
      // Re-enable input and button
      if (sendButton) sendButton.disabled = false;
      if (chatInputField) {
        chatInputField.disabled = false;
        chatInputField.focus(); // Return focus to input
      }
    }
  }

  // Function to display author analysis results
  function displayAuthorAnalysis(authorData) {
    const summary = authorData.summary;
    const authors = authorData.authors;
    
    // Create HTML for author analysis display
    let html = `
      <hr style="margin: 30px 0; border: none; border-top: 2px solid #e9ecef;">
      <div class="author-analysis-container">
        <h2>Author Analysis Results</h2>
        
        <div class="summary-stats">
          <h3>Summary Statistics</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Total Authors:</span>
              <span class="stat-value">${summary.total_authors}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total FT50 Publications:</span>
              <span class="stat-value">${summary.total_ft50_publications}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Total Citations:</span>
              <span class="stat-value">${summary.total_citations.toLocaleString()}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Highest H-index:</span>
              <span class="stat-value">${summary.max_h_index}</span>
            </div>
          </div>
        </div>

        <div class="authors-list">
          <h3>Individual Author Profiles</h3>
    `;

    // Add each author's profile
    authors.forEach((author, index) => {
      html += `
        <div class="author-profile">
          <h4>${author.name}</h4>
          ${author.affiliation ? `<p class="affiliation"><strong>Affiliation:</strong> ${author.affiliation}</p>` : ''}
          
          ${author.note ? `
            <p class="info-message">${author.note}</p>
          ` : ''}
          
          ${author.error ? `
            <p class="error-message">Error: ${author.error}</p>
          ` : `
            <div class="author-stats">
              <div class="stat-row">
                <span class="stat-label">Citations:</span>
                <span class="stat-value">${author.citations.toLocaleString()}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">H-index:</span>
                <span class="stat-value">${author.h_index}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">i10-index:</span>
                <span class="stat-value">${author.i10_index}</span>
              </div>
              <div class="stat-row">
                <span class="stat-label">FT50 Publications:</span>
                <span class="stat-value">${author.ft50_count}</span>
              </div>
            </div>

            ${author.ft50_journals && author.ft50_journals.length > 0 ? `
              <div class="ft50-journals">
                <strong>FT50 Journals:</strong>
                <ul>
                  ${author.ft50_journals.map(journal => `<li>${journal}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${author.research_areas && author.research_areas.length > 0 ? `
              <div class="research-areas">
                <strong>Research Areas:</strong>
                <div class="tags">
                  ${author.research_areas.map(area => `<span class="tag">${area}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            ${author.most_cited_papers && author.most_cited_papers.length > 0 ? `
              <div class="most-cited-papers">
                <strong>Most Cited Papers:</strong>
                <ul>
                  ${author.most_cited_papers.slice(0, 3).map(paper => 
                    `<li>${paper.title || paper} ${paper.citations ? `(${paper.citations} citations)` : ''}</li>`
                  ).join('')}
                </ul>
              </div>
            ` : ''}

            ${author.publications && author.publications.length > 0 ? `
              <div class="recent-publications">
                <strong>Recent Publications (Top ${Math.min(5, author.publications.length)}):</strong>
                <ul>
                  ${author.publications.slice(0, 5).map(pub => `
                    <li>
                      <strong>${pub.title}</strong><br>
                      ${pub.authors ? `<em>${pub.authors}</em><br>` : ''}
                      ${pub.venue ? `${pub.venue}` : ''} ${pub.year ? `(${pub.year})` : ''}
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}

            ${author.profile_url ? `
              <div class="profile-link">
                <a href="${author.profile_url}" target="_blank">View Full Profile</a>
              </div>
            ` : ''}
          `}
        </div>
      `;
    });

    html += `
        </div>

        ${summary.unique_ft50_journals && summary.unique_ft50_journals.length > 0 ? `
          <div class="unique-journals">
            <h3>All FT50 Journals Represented</h3>
            <div class="tags">
              ${summary.unique_ft50_journals.map(journal => `<span class="tag">${journal}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${summary.research_areas && summary.research_areas.length > 0 ? `
          <div class="all-research-areas">
            <h3>Research Areas Covered</h3>
            <div class="tags">
              ${summary.research_areas.map(area => `<span class="tag">${area}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Add CSS styles for author analysis
    html += `
      <style>
        .author-analysis-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
        }
        .summary-stats {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-top: 15px;
        }
        .stat-item {
          background: white;
          padding: 15px;
          border-radius: 6px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-label {
          display: block;
          font-weight: 600;
          color: #495057;
          margin-bottom: 5px;
        }
        .stat-value {
          display: block;
          font-size: 1.4em;
          font-weight: 700;
          color: #2c3e50;
        }
        .author-profile {
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .author-profile h4 {
          margin: 0 0 10px 0;
          color: #2c3e50;
          font-size: 1.3em;
        }
        .affiliation {
          color: #6c757d;
          margin-bottom: 15px;
        }
        .info-message {
          background-color: #e3f2fd;
          color: #1976d2;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
          font-style: italic;
        }
        .author-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin-bottom: 15px;
        }
        .stat-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 4px;
        }
        .stat-row .stat-label {
          font-weight: 500;
          color: #495057;
        }
        .stat-row .stat-value {
          font-weight: 600;
          color: #2c3e50;
        }
        .ft50-journals, .research-areas, .most-cited-papers, .recent-publications {
          margin: 15px 0;
        }
        .ft50-journals ul, .most-cited-papers ul, .recent-publications ul {
          margin: 8px 0;
          padding-left: 20px;
        }
        .ft50-journals li, .most-cited-papers li, .recent-publications li {
          margin-bottom: 5px;
        }
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .tag {
          background: #e9ecef;
          color: #495057;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.9em;
          font-weight: 500;
        }
        .profile-link {
          margin-top: 15px;
        }
        .profile-link a {
          color: #007bff;
          text-decoration: none;
          font-weight: 500;
        }
        .profile-link a:hover {
          text-decoration: underline;
        }
        .error-message {
          color: #dc3545;
          font-style: italic;
        }
        .unique-journals, .all-research-areas {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-top: 20px;
        }
        .unique-journals h3, .all-research-areas h3 {
          margin-top: 0;
          color: #2c3e50;
        }
      </style>
    `;

    // Only render author analysis in authors view
    if (summaryDiv && viewMode === 'authors') {
      summaryDiv.innerHTML = html;
    }
  }

  // Use shared ID generator for consistent paper ID generation
  async function extractSsrnIdOrUrl(url) {
    if (!url) return null;
    
    // Use the shared ID generator which matches backend logic
    try {
      const paperId = await SharedIdGenerator.generateIdFromUrl(url);
      return paperId;
    } catch (error) {
      console.error('Error generating paper ID:', error);
      // Fallback to simple SSRN ID extraction
      const match = url.match(/[?&]abstract(?:_?id)?=(\d+)/i);
      return match ? match[1] : url;
    }
  }

  // Add this async function to fetch analysis from backend by paperID
  async function fetchAnalysisFromBackend(paperId) {
    try {
      // Use smart backend detection to get the correct backend URL
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching analysis');
        return null;
      }
      
      const url = `${backend.url}/analysis/${encodeURIComponent(paperId)}`;
      console.log('Trying to fetch analysis from backend:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log('Backend returned non-OK for analysis:', response.status, response.statusText);
        
        if (response.status === 404) {
          console.log('Analysis not found on backend for paper:', paperId);
          return null;
        } else if (response.status >= 500) {
          throw new Error(`Backend server error: ${response.status} - ${response.statusText}`);
        } else {
          throw new Error(`Backend error: ${response.status} - ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      console.log('Received data from backend:', data);
      
      if (data) {
        // Store in local storage for future use
        const storageKey = `analysis_${paperId}`;
        
        // Extract summary from the response data
        let summary = '';
        if (typeof data === 'object') {
          if (data.summary && typeof data.summary === 'string') {
            summary = data.summary;
          } else if (data.data && data.data.summary && typeof data.data.summary === 'string') {
            summary = data.data.summary;
          }
        }
        
        // Clean up summary (only remove script tags, preserve markdown)
        if (summary) {
          summary = summary
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .trim();
        }
        
        // Check if the analysis contains an error state
        if (summary === 'Error generating analysis' || !summary || summary.trim() === '') {
          console.log('Backend returned error analysis or empty summary:', summary);
          return null;
        }
        
        const analysisResult = {
          timestamp: new Date().toISOString(),
          paperId: paperId,
          content: data.content || {  // Add default content structure if not provided
            title: data.content?.title || 'Unknown Title',
            paperContent: data.content?.paperContent || '',
            paperUrl: data.content?.paperUrl || '',
            paperId: paperId,
            abstract: data.content?.abstract || '',
            authors: data.content?.authors || []
          },
          summary: summary,  // Use cleaned summary
          data: {
            summary: summary,  // Store cleaned summary in data object as well
            author_data: data.author_data || null  // Handle missing author data
          },
          autoAnalyzed: true
        };
        
        console.log('Storing analysis result:', analysisResult);
        const storageData = {};
        storageData[storageKey] = analysisResult;
        await chrome.storage.local.set(storageData);
        return analysisResult;
      }
      return null;
    } catch (err) {
      console.error('Error fetching analysis from backend:', err);
      return null;
    }
  }

  // Add helper function to get model name
  function getModelName(selectedModel) {
    // Gemini models
    if (selectedModel.startsWith('gemini-')) {
      return selectedModel;
    }
    
    // OpenAI models
    if (selectedModel.startsWith('gpt-')) {
      return selectedModel;
    }
    
    // Claude models
    if (selectedModel.startsWith('claude-')) {
      return selectedModel;
    }
    
    // Default to fastest model
    return 'gemini-2.5-flash';
  }

  // Check URL parameters to determine view mode
  (async function initializePage() {
    const urlParams = new URLSearchParams(window.location.search);
    viewMode = urlParams.get('view'); // Set global viewMode variable
    const paperUrl = urlParams.get('paperUrl');
    const paperId = (paperUrl ? await extractSsrnIdOrUrl(paperUrl) : null) || urlParams.get('paperID');

    // Check if we're on homepage (no paperID)
    if (!paperId) {
      isHomepage = true;
      document.body.classList.add('homepage-mode');
      
      // Load homepage data
      await loadHomepageStats();
      await loadSettings();
      
      // Focus search input
      if (searchInput) {
        searchInput.focus();
      }
      
      console.log('Initialized homepage mode');
      return;
    }

    // If we have a paperID, we're viewing an existing analysis - ensure we're not in homepage mode
    if (paperId) {
      // Remove homepage mode to show paper analysis content
      document.body.classList.remove('homepage-mode');
      isHomepage = false;
      
      if (uploadSection) uploadSection.style.display = 'none';
      if (analyzeBtn) analyzeBtn.style.display = 'none';
      updateStatus(`Loading analysis for paper ID: ${paperId}...`);
    }

    // Use paperID for storage key
    const storageKey = `analysis_${paperId}`;
    console.log('Looking up analysis for paperID:', paperId, 'with key:', storageKey);

  // Initialize the page based on URL parameters
  (async () => {
    let analysis = null;
    
    // First try to load from local storage
    const result = await chrome.storage.local.get([storageKey]);
    analysis = result[storageKey];

    if (viewMode === 'authors' && analysis && analysis.data?.author_data) {
      displayAuthorAnalysis(analysis.data.author_data);
      if (summaryDiv) summaryDiv.style.display = 'block'; // Ensure visible for author analysis
      if (chatSection) chatSection.style.display = 'none';
      // Hide status, but show header with only backBtn
      const header = document.querySelector('.header');
      const statusDiv = document.getElementById('status');
      const analysisContent = document.getElementById('analysisContent');
      const paperInfo = document.getElementById('paperInfo');
      const backBtn = document.getElementById('backBtn');
      const analyzeBtn = document.getElementById('analyzeBtn');
      const clearBtn = document.getElementById('clearBtn');
      const viewAuthorsBtn = document.getElementById('viewAuthorsBtn');
      if (statusDiv) statusDiv.style.display = 'none';
      if (analysisContent) analysisContent.style.display = 'block';
      if (paperInfo) paperInfo.style.display = 'block';
      if (header) header.style.display = 'flex';
      if (backBtn) backBtn.style.display = 'inline-block';
      if (analyzeBtn) analyzeBtn.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      if (viewAuthorsBtn) viewAuthorsBtn.style.display = 'none';
      // Set paper title and meta if available
      if (analysis.data.content) {
        const paperTitle = document.getElementById('paperTitle');
        const paperMeta = document.getElementById('paperMeta');
        if (paperTitle) paperTitle.textContent = analysis.data.content.title || '';
        if (paperMeta) {
          const authors = (analysis.data.content.authors || []).join(', ');
          const analyzed = analysis.timestamp ? new Date(analysis.timestamp).toLocaleDateString() : '';
          const metaInfo = `Paper ID: ${analysis.data.content.paperId || ''} | Authors: ${authors} | Analyzed: ${analyzed}`;
          paperMeta.textContent = metaInfo;
        }
      }
      return;
    }
    
    if (analysis) {
      console.log('Found analysis in local storage:', analysis);
    } else {
      console.log('No analysis found in local storage, checking if analysis is in progress...');
      
      // Check if analysis is currently in progress
      const status = await getAnalysisStatus(paperId);
      if (status && status.status === 'in_progress') {
        console.log('Analysis is in progress, waiting for completion...');
        updateStatus('Analysis in progress, please wait...');
        
        // Wait for analysis to complete (poll every 2 seconds)
        let waitAttempts = 0;
        const maxWaitAttempts = 60; // Wait up to 2 minutes
        
        while (waitAttempts < maxWaitAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          waitAttempts++;
          
          // Check if analysis is complete by looking for stored results
          const updatedResult = await chrome.storage.local.get([storageKey]);
          if (updatedResult[storageKey]) {
            console.log('Analysis completed, found results in storage');
            analysis = updatedResult[storageKey];
            updateStatus('Analysis completed, loading results...');
            break;
          }
          
          // Check status
          const updatedStatus = await getAnalysisStatus(paperId);
          if (updatedStatus && updatedStatus.status === 'error') {
            console.log('Analysis failed with error:', updatedStatus.errorMessage);
            updateStatus(`Analysis failed: ${updatedStatus.errorMessage || 'Unknown error'}`, true);
            break;
          } else if (!updatedStatus || updatedStatus.status !== 'in_progress') {
            console.log('Analysis status changed unexpectedly:', updatedStatus);
            break;
          }
          
          // Update status to show we're still waiting
          updateStatus(`Analysis in progress, please wait... (${waitAttempts * 2}s)`);
        }
        
        if (waitAttempts >= maxWaitAttempts && !analysis) {
          console.log('Timeout waiting for analysis to complete');
          updateStatus('Analysis is taking longer than expected. Please try refreshing the page.', true);
          await clearStaleAnalysisStatus();
        }
      } else {
        // No analysis in progress, try to fetch from backend as fallback
        console.log('No analysis in progress, checking backend for existing analysis...');
        updateStatus('Checking backend for existing analysis...');
        
        try {
          const backendAnalysis = await fetchAnalysisFromBackend(paperId);
          if (backendAnalysis) {
            console.log('Found analysis on backend:', backendAnalysis);
            analysis = backendAnalysis;
            updateStatus('Successfully loaded analysis from backend');
          } else {
            console.log('No analysis found on backend');
            updateStatus('No analysis found for this paper.', true);
          }
        } catch (error) {
          console.error('Error fetching from backend:', error);
          updateStatus(`Error connecting to backend: ${error.message}`, true);
        }
      }
    }
    
    console.log('Final analysis data to display:', analysis);
    
    if (analysis) {
      // Clear any existing status messages
      clearStatus();
      
      // Check if the analysis contains an error
      if (analysis.summary === 'Error generating analysis' || analysis.error) {
        console.log('Found error state in cached analysis, clearing and retrying...');
        await chrome.storage.local.remove([storageKey]);
        await clearStaleAnalysisStatus();
        analysis = null;
        // Show upload section if analysis is cleared due to error
        if (uploadSection) {
          uploadSection.style.display = 'block';
        }
        updateStatus('Previous analysis had errors and was cleared. Please try uploading the paper again.', true);
        return;
      } else {
        // Show appropriate status message first
        if (analysis.autoAnalyzed) {
          updateStatus(`DONE: PDF automatically analyzed at ${new Date(analysis.timestamp).toLocaleString()}`);
          updateStatus('Analysis completed automatically when PDF was loaded');
        } else {
          updateStatus(`Loaded analysis for paper ID: ${paperId} from ${new Date(analysis.timestamp).toLocaleString()}`);
        }
      }
      
      // Get summary from either analysis.summary or analysis.data.summary
      let summary = '';
      if (analysis && analysis.data && typeof analysis.data === 'object') {
        summary = analysis.data.summary || analysis.summary || '';
      } else if (analysis) {
        summary = analysis.summary || '';
      }
      
      // Display the summary if available and valid
      if (summary && typeof summary === 'string' && summary.trim()) {
        try {
          // Only remove script tags for security, preserve markdown content
          summary = summary
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            
          const html = markdownToHtml(summary);
          if (html) {
            // Show the analysis content structure
            if (analysisContent) {
              analysisContent.style.display = 'block';
            }
            
            // Display the summary content
            if (summaryDiv) {
              summaryDiv.innerHTML = html;
              summaryDiv.style.display = 'block';
            }
            
            // Enable chat section if we have content and not in authors view
            if (analysis.content && viewMode !== 'authors') {
              // Check for various content fields that might contain the paper data
              const hasContent = analysis.content.paperContent || 
                                analysis.content.abstract || 
                                analysis.content.file_content ||
                                analysis.content.title; // Even just having a title is enough for chat
              
              if (hasContent) {
                currentPdfContent = analysis.content;
                if (chatSection) {
                  chatSection.style.display = 'block';
                  console.log('Chat enabled: Paper content loaded from stored analysis');
                }
              } else {
                console.log('No suitable content found for chat:', analysis.content);
              }
            }
            
            // Set paper information if available
            if (analysis.content) {
              if (paperTitle && analysis.content.title) {
                paperTitle.textContent = analysis.content.title;
              }
              if (paperMeta) {
                const authors = (analysis.content.authors || []).join(', ');
                const analyzed = analysis.timestamp ? new Date(analysis.timestamp).toLocaleDateString() : '';
                let metaInfo = `Paper ID: ${analysis.content.paperId || ''} | Authors: ${authors} | Analyzed: ${analyzed}`;
                paperMeta.textContent = metaInfo;
              }
            }
          }
        } catch (error) {
          console.error('Error rendering summary:', error);
          updateStatus('Error displaying analysis summary', true);
        }
      }
    }
  })();

  // Set up event listeners for buttons
  if (viewAuthorsBtn) {
    viewAuthorsBtn.addEventListener('click', function() {
      const urlParams = new URLSearchParams(window.location.search);
      const paperId = urlParams.get('paperID');
      if (paperId) {
        const authorsUrl = chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId) + '&view=authors';
        window.location.href = authorsUrl;
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', function() {
      const urlParams = new URLSearchParams(window.location.search);
      // Use global viewMode variable (no need to redeclare)
      const paperId = urlParams.get('paperID');
      
      if (viewMode === 'authors' && paperId) {
        // Go back to main analysis view
        const mainUrl = chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId);
        window.location.href = mainUrl;
      } else {
        // Go back to extension popup or previous page
        window.history.back();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async function() {
      const urlParams = new URLSearchParams(window.location.search);
      const paperId = urlParams.get('paperID');
      if (paperId && confirm('Are you sure you want to clear this analysis? This action cannot be undone.')) {
        const storageKey = `analysis_${paperId}`;
        await chrome.storage.local.remove([storageKey]);
        await setAnalysisStatus(paperId, 'not_started');
        updateStatus('Analysis cleared successfully.', false);
        // Redirect to main fullpage interface
        window.location.href = chrome.runtime.getURL('fullpage.html');
      }
    });
  }

  // Set up chat functionality event listeners
  if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', async function() {
      const message = chatInput.value.trim();
      if (message) {
        chatInput.value = '';
        await handleChat(message);
      }
    });
    
    chatInput.addEventListener('keypress', async function(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
          chatInput.value = '';
          await handleChat(message);
        }
      }
    });
  } else {
    console.warn('sendBtn or chatInput not found');
  }
  })(); // End of initializePage async IIFE
});
