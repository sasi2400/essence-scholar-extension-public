

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
      console.log('Loading settings...');
      
      // Always try local storage first for immediate loading
      const result = await chrome.storage.local.get(['userSettings']);
      const localSettings = result.userSettings || {};
      console.log('Local settings found:', localSettings);
      
      if (googleScholarUrl) {
        googleScholarUrl.value = localSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
        console.log('Set Google Scholar URL:', localSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en');
      } else {
        console.warn('Google Scholar URL element not found');
      }
      
      if (researchInterests) {
        researchInterests.value = localSettings.researchInterests || '';
        console.log('Set Research Interests:', localSettings.researchInterests ? 'Content loaded' : 'Empty');
      } else {
        console.warn('Research Interests element not found');
      }
      
      // Show indicator if research interests were generated
      if (localSettings.isGenerated && localSettings.generatedAt) {
        console.log('Loaded generated research profile from:', new Date(localSettings.generatedAt).toLocaleString());
      }
      
      // Try to load from backend as well (but don't override local settings if backend fails)
      try {
        const backend = await BackendManager.getCurrentBackend();
        if (backend) {
          const response = await makeApiRequestWithBackend('/user/settings', {
            method: 'GET'
          }, backend);
          
          if (response.ok) {
            const data = await response.json();
            console.log('Backend settings found:', data);
            
            // Only update if backend has data and local storage is empty
            if (data.google_scholar_url && !localSettings.googleScholarUrl) {
              if (googleScholarUrl) googleScholarUrl.value = data.google_scholar_url;
            }
            if (data.research_interests && !localSettings.researchInterests) {
              if (researchInterests) researchInterests.value = data.research_interests;
            }
          }
        }
      } catch (error) {
        console.log('Backend settings not available, using local storage only');
      }
      
      console.log('Settings loaded successfully');
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }
  
  // Debug function to check storage contents
  window.debugStorage = async function() {
    console.log('=== DEBUG STORAGE ===');
    try {
      const userSettings = await chrome.storage.local.get(['userSettings']);
      const llmSettings = await chrome.storage.local.get(['llmSettings']);
      console.log('User Settings:', userSettings);
      console.log('LLM Settings:', llmSettings);
      
      // Check if elements exist
      console.log('Google Scholar URL element:', !!googleScholarUrl);
      console.log('Research Interests element:', !!researchInterests);
      
      if (googleScholarUrl) {
        console.log('Current Google Scholar URL value:', googleScholarUrl.value);
      }
      if (researchInterests) {
        console.log('Current Research Interests value:', researchInterests.value);
      }
    } catch (error) {
      console.error('Debug storage error:', error);
    }
  };
  
  async function loadModelSettings() {
    try {
      console.log('Loading model settings...');
      const result = await chrome.storage.local.get(['llmSettings']);
      const settings = result.llmSettings || { model: 'gemini-2.5-flash' };
      console.log('Model settings found:', settings);
      
      // Set the selected model
      const modelCards = document.querySelectorAll('.model-card');
      console.log('Found model cards:', modelCards.length);
      modelCards.forEach(card => {
        card.classList.remove('selected');
        if (card.dataset.model === settings.model) {
          card.classList.add('selected');
          console.log('Selected model card:', card.dataset.model);
        }
      });
      
      console.log('Model settings loaded successfully');
    } catch (error) {
      console.error('Error loading model settings:', error);
    }
  }
  
  async function saveModelSettings(selectedModel) {
    try {
      const result = await chrome.storage.local.get(['llmSettings']);
      const settings = result.llmSettings || {};
      settings.model = selectedModel;
      
      await chrome.storage.local.set({ llmSettings: settings });
      console.log('Model settings saved:', settings);
    } catch (error) {
      console.error('Error saving model settings:', error);
    }
  }
  
  async function saveGeneratedProfile(googleScholarUrl, generatedProfile) {
    try {
      // Save to local storage
      const localSettings = {
        googleScholarUrl: googleScholarUrl,
        researchInterests: generatedProfile,
        updatedAt: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        isGenerated: true
      };
      await chrome.storage.local.set({ userSettings: localSettings });
      
      // Also try to save to backend
      const backend = await BackendManager.getCurrentBackend();
      if (backend) {
        try {
          const response = await makeApiRequestWithBackend('/user/settings', {
            method: 'POST',
            body: JSON.stringify({
              google_scholar_url: googleScholarUrl,
              research_interests: generatedProfile
            })
          }, backend);
          
          if (response.ok) {
            console.log('Generated profile saved to backend');
          }
        } catch (error) {
          console.log('Backend save failed, but local storage is updated');
        }
      }
      
      console.log('Generated profile saved to storage');
    } catch (error) {
      console.error('Error saving generated profile:', error);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    
    console.log('Saving settings...');
    
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    saveBtnText.style.display = 'none';
    saveBtnLoading.style.display = 'inline-block';

    try {
      const settings = {
        google_scholar_url: googleScholarUrl.value.trim() || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en',
        research_interests: researchInterests.value.trim()
      };
      
      console.log('Settings to save:', settings);

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
      console.log('Saving to local storage:', localSettings);
      await chrome.storage.local.set({ userSettings: localSettings });
      console.log('Settings saved to local storage successfully');
      
      // Also save current model selection if available
      const currentModelResult = await chrome.storage.local.get(['llmSettings']);
      if (currentModelResult.llmSettings && currentModelResult.llmSettings.model) {
        console.log('Current model selection preserved:', currentModelResult.llmSettings.model);
      }
      
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
  
  async function generateResearchProfile() {
    const generateBtnText = document.getElementById('generateBtnText');
    const generateBtnLoading = document.getElementById('generateBtnLoading');
    const generateProfileBtn = document.getElementById('generateProfileBtn');
    
    // Show loading state
    generateBtnText.style.display = 'none';
    generateBtnLoading.style.display = 'inline-block';
    generateProfileBtn.disabled = true;
    
    try {
      const googleScholarUrl = document.getElementById('googleScholarUrl').value.trim() || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const researchInterests = document.getElementById('researchInterests').value.trim();
      
      if (!googleScholarUrl) {
        throw new Error('Please enter a Google Scholar Profile URL first');
      }
      
      // Validate Google Scholar URL
      if (!googleScholarUrl.includes('scholar.google.com') && !googleScholarUrl.includes('scholar.google.de')) {
        throw new Error('Please enter a valid Google Scholar Profile URL');
      }
      
      updateStatus('🔍 Generating research profile from Google Scholar...', false);
      
      // Get current backend
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No healthy backend available');
      }
      
      // Call backend to generate research profile
      const response = await makeApiRequestWithBackend('/generate-research-profile', {
        method: 'POST',
        body: JSON.stringify({
          googleScholarUrl: googleScholarUrl,
          researchInterests: researchInterests
        })
      }, backend);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      // Update the research interests field with generated content
      if (result.generatedProfile) {
        document.getElementById('researchInterests').value = result.generatedProfile;
        
        // Save the generated profile to storage
        await saveGeneratedProfile(googleScholarUrl, result.generatedProfile);
        
        updateStatus('✅ Research profile generated and saved successfully!', false);
        console.log('Generated research profile:', result.generatedProfile);
      } else {
        updateStatus('⚠️ Profile generated but no content returned', false);
      }
      
    } catch (error) {
      console.error('Error generating research profile:', error);
      updateStatus('Error generating research profile: ' + error.message, true);
    } finally {
      // Hide loading state
      generateBtnText.style.display = 'inline';
      generateBtnLoading.style.display = 'none';
      generateProfileBtn.disabled = false;
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
  window.viewPaper = async function(paperId) {
    // Get current scholar URL from settings
    const settings = await chrome.storage.local.get(['userSettings']);
    const userScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
    
    const url = chrome.runtime.getURL('fullpage.html') + '?paperID=' + encodeURIComponent(paperId) + '&scholar=' + encodeURIComponent(userScholarUrl);
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
      
      // After analysis is complete, update the URL with the paper ID and scholar URL
      // so the page knows to display the analysis results
      if (result && result.paperId) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('paperID', result.paperId);
        
        // Get current scholar URL from settings and add it to the URL
        const settings = await chrome.storage.local.get(['userSettings']);
        const userScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
        currentUrl.searchParams.set('scholar', userScholarUrl);
        
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
  
  // Setup generate profile button
  const generateProfileBtn = document.getElementById('generateProfileBtn');
  if (generateProfileBtn) {
    generateProfileBtn.addEventListener('click', generateResearchProfile);
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
          // Get all settings in one call to ensure consistency, with retry for fresh data
          let settings, llmSettings;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (retryCount < maxRetries) {
            settings = await chrome.storage.local.get(['userSettings', 'llmSettings']);
            llmSettings = settings.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
            
            // Check if we have the API key for the selected model
            const selectedModel = llmSettings.model || 'gemini-2.5-flash';
            const hasRequiredKey = (selectedModel.startsWith('claude-') && llmSettings.claudeKey && llmSettings.claudeKey.trim()) ||
                                 (selectedModel.startsWith('gpt-') && llmSettings.openaiKey && llmSettings.openaiKey.trim()) ||
                                 (selectedModel.startsWith('gemini-') && llmSettings.geminiKey && llmSettings.geminiKey.trim());
            
            console.log(`🔍 Fullpage: Retry ${retryCount + 1}/${maxRetries} - Model: ${selectedModel}, Has required key: ${hasRequiredKey}`);
            console.log(`🔍 Fullpage: Current keys - Claude: ${llmSettings.claudeKey ? 'present' : 'missing'}, OpenAI: ${llmSettings.openaiKey ? 'present' : 'missing'}, Gemini: ${llmSettings.geminiKey ? 'present' : 'missing'}`);
            
            if (hasRequiredKey || retryCount === maxRetries - 1) {
              break; // We have the key or this is our last attempt
            }
            
            console.log(`🔍 Fullpage: API key not found, retrying... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            retryCount++;
          }
          
          const researchInterests = settings.userSettings?.researchInterests || '';
          const userScholarUrl = settings.userSettings?.googleScholarUrl || '';
          const selectedModel = llmSettings.model || 'gemini-2.5-flash';
          
          // Debug logging to see what's loaded from storage
          console.log('🔍 Fullpage: LLM Settings loaded from storage:', {
            model: llmSettings.model,
            geminiKey: llmSettings.geminiKey ? `${llmSettings.geminiKey.substring(0, 10)}...` : 'empty',
            openaiKey: llmSettings.openaiKey ? `${llmSettings.openaiKey.substring(0, 10)}...` : 'empty',
            claudeKey: llmSettings.claudeKey ? `${llmSettings.claudeKey.substring(0, 10)}...` : 'empty'
          });
          
          // Prepare request body with only non-empty API keys
          const requestBody = { 
            content,
            file_content: content.file_content, // Move file_content to top level for backend
            research_interests: researchInterests, // Include research interests for personalized analysis
            user_scholar_url: userScholarUrl, // Include user's Google Scholar URL for analysis configuration
            model: selectedModel // Include the selected model for analysis
          };
          
          // Only add API keys if they have actual content
          if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
            requestBody.google_api_key = llmSettings.geminiKey;
          }
          if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
            requestBody.openai_api_key = llmSettings.openaiKey;
          }
          if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
            requestBody.claude_api_key = llmSettings.claudeKey;
          }
          
          // Debug logging to see what's being sent
          console.log('🔍 Fullpage: Request body API keys:', {
            google_api_key: requestBody.google_api_key ? `${requestBody.google_api_key.substring(0, 10)}...` : 'undefined',
            openai_api_key: requestBody.openai_api_key ? `${requestBody.openai_api_key.substring(0, 10)}...` : 'undefined',
            claude_api_key: requestBody.claude_api_key ? `${requestBody.claude_api_key.substring(0, 10)}...` : 'undefined'
          });
          
          // Use streaming endpoint for better user experience
          const serverResponse = await makeStreamRequest(CONFIG.ANALYZE_STREAM_ENDPOINT, requestBody, (event) => {
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

  // Add this async function to fetch analysis from backend by paperID and scholar URL
  async function fetchAnalysisFromBackend(paperId, requestedScholarUrl = null) {
    try {
      // Use smart backend detection to get the correct backend URL
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching analysis');
        return null;
      }
      
      // Build URL with scholar parameter if specified
      let url = `${backend.url}/analysis/${encodeURIComponent(paperId)}`;
      if (requestedScholarUrl) {
        url += `?scholar=${encodeURIComponent(requestedScholarUrl)}`;
      }
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
          console.log('Analysis not found on backend for paper:', paperId, 'with model:', requestedModel);
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
          model: requestedModel || data.ai_model || 'unknown',
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

  // Add function to get all available analyses for a paper
  async function getAllAnalysesForPaper(paperId) {
    try {
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching analyses');
        return [];
      }
      
      const url = `${backend.url}/storage/paper/${encodeURIComponent(paperId)}`;
      console.log('Trying to fetch all analyses for paper:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log('Backend returned non-OK for paper details:', response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();
      console.log('Received paper details from backend:', data);
      
      // Return analysis information if available
      if (data.analysis) {
        return [data.analysis];
      }
      
      return [];
    } catch (err) {
      console.error('Error fetching all analyses for paper:', err);
      return [];
    }
  }

  // Add function to show analysis selector when multiple analyses are available
  function showAnalysisSelector(paperId, currentScholarUrl) {
    const selectorHtml = `
      <div class="analysis-selector" style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;">
        <div style="margin-bottom: 10px;">
          <strong>Multiple analyses available for this paper:</strong>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="analysis-option" data-model="" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 3px; background: ${!currentModel ? '#007bff' : '#fff'}; color: ${!currentModel ? '#fff' : '#000'}; cursor: pointer;">
            Latest Analysis
          </button>
          <button class="analysis-option" data-model="gemini-2.5-flash" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 3px; background: ${currentModel === 'gemini-2.5-flash' ? '#007bff' : '#fff'}; color: ${currentModel === 'gemini-2.5-flash' ? '#fff' : '#000'}; cursor: pointer;">
            Gemini 2.5 Flash
          </button>
          <button class="analysis-option" data-model="gpt-4" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 3px; background: ${currentModel === 'gpt-4' ? '#007bff' : '#fff'}; color: ${currentModel === 'gpt-4' ? '#fff' : '#000'}; cursor: pointer;">
            GPT-4
          </button>
          <button class="analysis-option" data-model="claude-3-5-sonnet" style="padding: 5px 10px; border: 1px solid #ccc; border-radius: 3px; background: ${currentModel === 'claude-3-5-sonnet' ? '#007bff' : '#fff'}; color: ${currentModel === 'claude-3-5-sonnet' ? '#fff' : '#000'}; cursor: pointer;">
            Claude 3.5 Sonnet
          </button>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #666;">
          Click to switch between different AI model analyses
        </div>
      </div>
    `;
    
    // Insert the selector before the analysis content
    const analysisContent = document.getElementById('analysisContent');
    if (analysisContent) {
      // Remove existing selector if present
      const existingSelector = analysisContent.querySelector('.analysis-selector');
      if (existingSelector) {
        existingSelector.remove();
      }
      
      // Insert new selector at the top
      analysisContent.insertAdjacentHTML('afterbegin', selectorHtml);
      
      // Add event listeners to the buttons
      const buttons = analysisContent.querySelectorAll('.analysis-option');
      buttons.forEach(button => {
        button.addEventListener('click', async function() {
          const url = new URL(window.location);
          
          // Get user's Google Scholar URL from settings
          const settings = await chrome.storage.local.get(['userSettings']);
          const userScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
          
          // Add scholar URL parameter
          url.searchParams.set('scholar', encodeURIComponent(userScholarUrl));
          
          // Reload the page with the new parameters
          window.location.href = url.toString();
        });
      });
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

  // --- Typewriter effect for SSRN Paper Summarizer title ---
  function startTitleTypewriter() {
    const titleElement = document.getElementById('mainTitle');
    const cursorElement = document.querySelector('.cursor');
    if (!titleElement || !cursorElement) return;
    
    const fullText = 'SSRN Paper Summarizer';
    let currentIndex = 0;
    titleElement.textContent = '';
    cursorElement.style.display = 'inline-block';

    function typeNextChar() {
      if (currentIndex < fullText.length) {
        titleElement.textContent = fullText.slice(0, currentIndex + 1);
        currentIndex++;
        setTimeout(typeNextChar, 80);
      } else {
        // Keep cursor blinking at the end
        cursorElement.style.display = 'inline-block';
      }
    }
    typeNextChar();
  }

  // --- Dynamic subtitle messages for homepage (unchanged) ---
  const subtitleMessages = [
    "Your paper pilot, ScholarWing",
    "Intelligent analysis and insights",
    "AI-powered research companion",
    "Transform papers into insights",
    "Your academic research assistant",
    "Smart paper analysis at your fingertips"
  ];

  let currentSubtitleIndex = 0;
  let subtitleInterval = null;

  function updateSubtitle() {
    const subtitleElement = document.getElementById('dynamicSubtitle');
    if (subtitleElement && isHomepage) {
      subtitleElement.style.opacity = '0';
      setTimeout(() => {
        subtitleElement.textContent = subtitleMessages[currentSubtitleIndex];
        subtitleElement.style.opacity = '1';
        currentSubtitleIndex = (currentSubtitleIndex + 1) % subtitleMessages.length;
      }, 500);
    }
  }

  function startSubtitleLoop() {
    if (subtitleInterval) clearInterval(subtitleInterval);
    updateSubtitle();
    subtitleInterval = setInterval(updateSubtitle, 3000);
  }

  function stopSubtitleLoop() {
    if (subtitleInterval) clearInterval(subtitleInterval);
  }

  // --- Main initialization ---
  (async function initializePage() {
    const urlParams = new URLSearchParams(window.location.search);
    viewMode = urlParams.get('view'); // Set global viewMode variable
    const paperUrl = urlParams.get('paperUrl');
    const paperId = (paperUrl ? await extractSsrnIdOrUrl(paperUrl) : null) || urlParams.get('paperID');
    const requestedScholarUrl = urlParams.get('scholar'); // Get requested scholar URL from URL

    // Check if we're on homepage (no paperID)
    if (!paperId) {
      isHomepage = true;
      document.body.classList.add('homepage-mode');
      startSubtitleLoop(); // Start subtitle loop on homepage
      startTitleTypewriter(); // Start typewriter effect for title
      
      // Load homepage data
      await loadHomepageStats();
      await loadSettings();
      await loadModelSettings();
      
      // Set up model selection after everything is loaded
      setupModelSelection();
      
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
      stopSubtitleLoop(); // Stop subtitle loop when leaving homepage
      
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
          const backendAnalysis = await fetchAnalysisFromBackend(paperId, requestedScholarUrl);
          if (backendAnalysis) {
            console.log('Found analysis on backend:', backendAnalysis);
            analysis = backendAnalysis;
            const scholarInfo = requestedScholarUrl ? ` (Scholar: ${requestedScholarUrl})` : '';
            updateStatus(`Successfully loaded analysis from backend${scholarInfo}`);
          } else {
            console.log('No analysis found on backend');
            const scholarInfo = requestedScholarUrl ? ` for scholar ${requestedScholarUrl}` : '';
            updateStatus(`No analysis found for this paper${scholarInfo}.`, true);
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
                const modelInfo = analysis.model ? ` | Model: ${analysis.model}` : '';
                let metaInfo = `Paper ID: ${analysis.content.paperId || ''} | Authors: ${authors} | Analyzed: ${analyzed}${modelInfo}`;
                paperMeta.textContent = metaInfo;
              }
            }
            
            // Show analysis selector if we have a paper ID (indicating multiple analyses might be available)
            if (paperId) {
              showAnalysisSelector(paperId, requestedScholarUrl);
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
  
  // Set up model selection event listeners
  function setupModelSelection() {
    console.log('Setting up model selection...');
    const modelCards = document.querySelectorAll('.model-card');
    console.log('Found model cards:', modelCards.length);
    
    modelCards.forEach((card, index) => {
      console.log(`Setting up card ${index}:`, card.dataset.model);
      card.addEventListener('click', async function() {
        console.log('Model card clicked:', this.dataset.model);
        const selectedModel = this.dataset.model;
        
        // Check if API key is required and available
        const needsApiKey = await checkApiKeyRequirement(selectedModel);
        console.log('Needs API key:', needsApiKey);
        
        if (needsApiKey) {
          // Show API key modal
          showApiKeyModal(selectedModel);
          return;
        }
        
        // Remove selection from all cards
        modelCards.forEach(c => c.classList.remove('selected'));
        
        // Add selection to clicked card
        this.classList.add('selected');
        
        // Save the selection
        await saveModelSettings(selectedModel);
        
        // Show a subtle success indicator
        this.style.transform = 'scale(1.05)';
        setTimeout(() => {
          this.style.transform = '';
        }, 200);
        
        console.log('Model selected:', selectedModel);
      });
    });
  }
  
  // Call setup function after DOM is ready
  // Note: setupModelSelection will be called after the page initializes
  
  // API Key validation functions
  async function checkApiKeyRequirement(selectedModel) {
    try {
      const result = await chrome.storage.local.get(['llmSettings']);
      const settings = result.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      // Check if user has configured appropriate API key for selected model
      if (selectedModel.startsWith('gemini-') && !settings.geminiKey) {
        return true; // Needs API key
      } else if (selectedModel.startsWith('gpt-') && !settings.openaiKey) {
        return true; // Needs API key
      } else if (selectedModel.startsWith('claude-') && !settings.claudeKey) {
        return true; // Needs API key
      }
      
      return false; // No API key needed or already configured
    } catch (error) {
      console.error('Error checking API key requirement:', error);
      return true; // Default to requiring API key on error
    }
  }
  
  function showApiKeyModal(selectedModel) {
    const modal = document.getElementById('api-key-modal');
    const message = document.getElementById('api-key-message');
    const geminiSection = document.getElementById('gemini-key-section');
    const openaiSection = document.getElementById('openai-key-section');
    const claudeSection = document.getElementById('claude-key-section');
    
    // Hide all sections first
    geminiSection.style.display = 'none';
    openaiSection.style.display = 'none';
    claudeSection.style.display = 'none';
    
    // Show appropriate section based on model
    if (selectedModel.startsWith('gemini-')) {
      message.textContent = 'To use Gemini models, you need to provide a Google AI API key.';
      geminiSection.style.display = 'block';
    } else if (selectedModel.startsWith('gpt-')) {
      message.textContent = 'To use GPT models, you need to provide an OpenAI API key.';
      openaiSection.style.display = 'block';
    } else if (selectedModel.startsWith('claude-')) {
      message.textContent = 'To use Claude models, you need to provide a Claude API key.';
      claudeSection.style.display = 'block';
    }
    
    // Store the selected model for later use
    modal.dataset.selectedModel = selectedModel;
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Set up modal event listeners
    setupApiKeyModalListeners();
  }
  
  function setupApiKeyModalListeners() {
    const modal = document.getElementById('api-key-modal');
    const cancelBtn = document.getElementById('api-key-cancel-btn');
    const saveBtn = document.getElementById('api-key-save-btn');
    const geminiInput = document.getElementById('gemini-key-input');
    const openaiInput = document.getElementById('openai-key-input');
    const claudeInput = document.getElementById('claude-key-input');
    
    // Cancel button - close modal and revert selection
    cancelBtn.onclick = () => {
      modal.style.display = 'none';
      // Revert the model selection
      const modelCards = document.querySelectorAll('.model-card');
      modelCards.forEach(c => c.classList.remove('selected'));
      loadModelSettings(); // Reload the previously selected model
    };
    
    // Save button - validate and save API key
    saveBtn.onclick = async () => {
      const selectedModel = modal.dataset.selectedModel;
      let apiKey = '';
      
      // Get the appropriate API key based on model
      if (selectedModel.startsWith('gemini-')) {
        apiKey = geminiInput.value.trim();
        if (!apiKey) {
          alert('Please enter your Google AI API key to use Gemini models');
          return;
        }
      } else if (selectedModel.startsWith('gpt-')) {
        apiKey = openaiInput.value.trim();
        if (!apiKey) {
          alert('Please enter your OpenAI API key to use GPT models');
          return;
        }
      } else if (selectedModel.startsWith('claude-')) {
        apiKey = claudeInput.value.trim();
        if (!apiKey) {
          alert('Please enter your Claude API key to use Claude models');
          return;
        }
      }
      
      try {
        // Get existing settings
        const result = await chrome.storage.local.get(['llmSettings']);
        const settings = result.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
        
        // Update the appropriate API key
        if (selectedModel.startsWith('gemini-')) {
          settings.geminiKey = apiKey;
        } else if (selectedModel.startsWith('gpt-')) {
          settings.openaiKey = apiKey;
        } else if (selectedModel.startsWith('claude-')) {
          settings.claudeKey = apiKey;
        }
        
        // Update the model
        settings.model = selectedModel;
        
        // Save settings
        await chrome.storage.local.set({ llmSettings: settings });
        
        // Close modal
        modal.style.display = 'none';
        
        // Update the UI to show the selected model
        const modelCards = document.querySelectorAll('.model-card');
        modelCards.forEach(c => c.classList.remove('selected'));
        const selectedCard = document.querySelector(`[data-model="${selectedModel}"]`);
        if (selectedCard) {
          selectedCard.classList.add('selected');
        }
        
        // Show success indicator
        if (selectedCard) {
          selectedCard.style.transform = 'scale(1.05)';
          setTimeout(() => {
            selectedCard.style.transform = '';
          }, 200);
        }
        
        console.log('API key saved and model selected:', selectedModel);
        
        // Clear the input fields
        geminiInput.value = '';
        openaiInput.value = '';
        claudeInput.value = '';
        
      } catch (error) {
        console.error('Error saving API key:', error);
        alert('Error saving API key. Please try again.');
      }
    };
  }
  
  })(); // End of initializePage async IIFE
});
