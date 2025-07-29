document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
  // Global variables
  let viewMode = null; // Will be set from URL parameters
  let isHomepage = false; // Track if we're on homepage
  
  // Junior researchers data - defined early for global access
  const juniorResearchers = [
    {
      id: 'key_message',
      name: 'Key Message',
      description: 'Core findings and contributions'
    },
    {
      id: 'author_profiles',
      name: 'Author Profiles',
      description: 'Author credentials and backgrounds'
    },
    {
      id: 'contributions_novelty',
      name: 'Novelty & Contributions',
      description: 'Claimed contributions and novelty'
    },
    {
      id: 'data_variables_models',
      name: 'Data & Methods',
      description: 'Data sources and econometric models'
    },
    {
      id: 'identification_causality',
      name: 'Causal Inference',
      description: 'Identification strategies and methods'
    },
    {
      id: 'quick_takeaways',
      name: 'Relevance',
      description: 'Quick takeaways and relevance'
    },
    {
      id: 'bibliography_reference',
      name: 'Bibliography',
      description: 'Reference patterns and citations'
    }
  ];
  
  // === CONSISTENT VIEW MODE SYSTEM ===
  /*
   * FULLPAGE VIEW MODES:
   * 
   * 1. fullpage (homepage)
   *    URL: fullpage.html (no parameters)
   *    Shows: Homepage with search, settings, upload
   * 
   * 2. fullpage+paperID 
   *    URL: fullpage.html?paperID=123&scholar=...
   *    Shows: Analysis view (generates analysisID internally)
   *    Used by: Search results, legacy URLs
 
   */
  const VIEW_MODES = {
    HOMEPAGE: 'homepage',
    // ANALYSIS: 'analysis', 
    ANALYSIS_WITH_PAPER_ID: 'analysis_paperid',
    // AUTHORS: 'authors',
    AUTHOR_PROFILE: 'author_profile'
  };
  
  // View Mode Detection - determines current view mode from URL parameters
  function detectViewMode() {
    const urlParams = getUrlParams();
    // const view = urlParams.get('view');
    // const analysisId = urlParams.get('analysisID');
    const paperId = urlParams.get('paperID');
    const authorId = urlParams.get('authorID');
    
    // Priority order for view mode detection:
    // 1. authorID present = individual author profile view
    if (authorId) {
      return VIEW_MODES.AUTHOR_PROFILE;
    }
    
    // // 2. Explicit view=authors parameter
    // if (view === 'authors') {
    //   return VIEW_MODES.AUTHORS;
    // }
    
    // // 3. analysisID present = analysis view
    // if (analysisId) {
    //   return VIEW_MODES.ANALYSIS;
    // }
    
    // 4. paperID present = analysis view with paperID (will generate analysisID)
    if (paperId) {
      return VIEW_MODES.ANALYSIS_WITH_PAPER_ID;
    }
    
    // 5. No parameters = homepage
    return VIEW_MODES.HOMEPAGE;
  }
  
  // Consistent URL Building Functions
  function buildHomepageUrl() {
    return chrome.runtime.getURL('fullpage.html');
  }
  
  // function buildAnalysisUrl(analysisId, additionalParams = {}) {
  //   try {
  //     const baseUrl = chrome.runtime.getURL('fullpage.html');
  //     let url = `${baseUrl}?analysisID=${encodeURIComponent(analysisId)}`;
      
  //     // Add any additional parameters
  //     Object.keys(additionalParams).forEach(key => {
  //       url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(additionalParams[key]);
  //     });
      
  //     return url;
  //   } catch (error) {
  //     console.error('Error building analysis URL:', error);
  //     const baseUrl = chrome.runtime.getURL('fullpage.html');
  //     return `${baseUrl}?analysisID=${encodeURIComponent(analysisId)}`;
  //   }
  // }
  
  async function buildAnalysisUrlFromPaperId(paperId, scholarUrl = null, additionalParams = {}) {
    // try {
      // Get scholar URL if not provided
      if (!scholarUrl) {
        const result = await chrome.storage.local.get(['userSettings']);
        const settings = result.userSettings || {};
        scholarUrl = settings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      }
      
    //   // Generate analysisId and use standard analysis URL
    //   const analysisId = await generateAnalysisId(paperId, scholarUrl);
    //   return buildAnalysisUrl(analysisId, additionalParams);
    // } catch (error) {
    //   console.error('Error building analysis URL from paperID:', error);
    //   // Fallback to basic URL with paperID
      const baseUrl = chrome.runtime.getURL('fullpage.html');
      return `${baseUrl}?paperID=${encodeURIComponent(paperId)}`;
    // }
    return `${baseUrl}`;
  }
  
  // async function buildAuthorsViewUrl(analysisId = null, paperId = null, scholarUrl = null, additionalParams = {}) {
  //   try {
  //     let effectiveAnalysisId = analysisId;
      
  //     // If no analysisId but have paperId, generate it
  //     if (!effectiveAnalysisId && paperId) {
  //       if (!scholarUrl) {
  //         const result = await chrome.storage.local.get(['userSettings']);
  //         const settings = result.userSettings || {};
  //         scholarUrl = settings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
  //       }
  //       effectiveAnalysisId = await generateAnalysisId(paperId, scholarUrl);
  //     }
      
  //     if (!effectiveAnalysisId) {
  //       throw new Error('Cannot build authors view URL without analysisId or paperId');
  //     }
      
  //     // Build URL with view=authors parameter
  //     return buildAnalysisUrl(effectiveAnalysisId, { view: 'authors', ...additionalParams });
  //   } catch (error) {
  //     console.error('Error building authors view URL:', error);
  //     return buildHomepageUrl();
  //   }
  // }
  
  // Legacy function for backward compatibility
  function getHomepageUrl() {
    return buildHomepageUrl();
  }
  
  console.log('Fullpage loaded: DOMContentLoaded event fired');
  
  // Debug function to test button functionality - accessible from console
  window.debugButtons = function() {
    console.log('🔧 DEBUG: Testing button functionality');
    const clearBtn = document.getElementById('clearBtn');
    const viewAuthorsBtn = document.getElementById('viewAuthorsBtn');
    
    console.log('Button elements:', {
      clearBtn: clearBtn,
      viewAuthorsBtn: null, // Button removed from UI
      clearBtnVisible: clearBtn ? (clearBtn.offsetWidth > 0 && clearBtn.offsetHeight > 0) : false,
      viewAuthorsBtnVisible: false, // Button no longer exists
      clearBtnStyles: clearBtn ? window.getComputedStyle(clearBtn) : null,
      viewAuthorsBtnStyles: null // Button removed
    });
    
    if (clearBtn) {
      console.log('Testing clearBtn click...');
      clearBtn.click();
    }
  };
  
  // Manual fix function to force setup UI and listeners
  window.forceFixButtons = async function() {
    console.log('🔧 FORCE FIX: Manually setting up buttons');
    await setupBasicErrorUI();
    setupButtonEventListeners();
    console.log('🔧 FORCE FIX: Complete. Test buttons now.');
  };
  
  // Fallback function for viewAuthorsBtn onclick (called directly from HTML)
  window.handleViewAuthorsClick = async function() {
    console.log('🎯 View Authors button clicked via HTML onclick fallback');
    const paperId = getCurrentPaperId();
    console.log('🎯 Paper ID from URL:', paperId);
    
          if (paperId) {
        try {
          const authorsUrl = buildPaperIdUrl(paperId, { view: 'authors' });
          console.log('🎯 Redirecting to authors view:', authorsUrl);
          window.location.href = authorsUrl;
        } catch (error) {
          console.error('❌ Error building authors URL:', error);
          alert('Error navigating to authors view: ' + error.message);
        }
      } else {
        console.warn('⚠️  No paper ID found, redirecting to homepage');
        window.location.href = buildHomepageUrl();
      }
  };
  
  // Fallback function for backBtn onclick (called directly from HTML)
  window.handleBackClick = async function() {
    console.log('🎯 Back button clicked via HTML onclick fallback');
    const paperId = getCurrentPaperId();
    
    // Back button is only shown in authors view, so always go back to analysis view
          if (viewMode === VIEW_MODES.AUTHORS && paperId) {
        console.log('Navigating back to analysis view with paperId:', paperId);
        const mainUrl = buildPaperIdUrl(paperId);
        window.location.href = mainUrl;
      } else {
        console.warn('Back button clicked outside of authors view, going to homepage');
        window.location.href = buildHomepageUrl();
      }
  };
  
  if (typeof CONFIG !== 'undefined') {
    console.log('Available backends:', Object.keys(CONFIG.BACKENDS));
  }
  
  // Initialize backend detection early
  if (typeof BackendManager !== 'undefined') {
    BackendManager.getCurrentBackend().then(backend => {
      if (backend) {
        console.log('Initial backend selected for fullpage:', backend.name, backend.url);
      } else {
        console.log('No backend available during fullpage initialization');
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
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        console.error('No backend available for stats');
        return;
      }

      const response = await fetch(`${backend.url}/storage/info`);
      if (response.ok) {
        const data = await response.json();
        
        // Update all stats with animated counters
        const papersCount = data.persistent_storage.papers || 0;
        const authorsCount = data.persistent_storage.authors || 0;
        const analysesCount = data.persistent_storage.analyses || 0;
        
        if (totalPapers) {
          animateCounter(totalPapers, 0, papersCount, 1000);
        }
        
        if (totalAuthors) {
          animateCounter(totalAuthors, 0, authorsCount, 1200);
        }
        
        if (analyzedPapers) {
          animateCounter(analyzedPapers, 0, analysesCount, 1400);
        }
        
        // Debug logging
        console.log('📊 Homepage Stats:', {
          totalPapers: papersCount,
          totalAuthors: authorsCount,
          analyzedPapers: analysesCount
        });
      }
    } catch (error) {
      console.error('Error loading homepage stats:', error);
      // Set fallback values if there's an error
      if (totalPapers) totalPapers.textContent = '0';
      if (totalAuthors) totalAuthors.textContent = '0';
      if (analyzedPapers) analyzedPapers.textContent = '0';
    }
  }

  async function searchPapers(query) {
    try {
      const backend = await BackendManager.getCurrentBackend();
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
      const hasAnalysis = paper.analysis_count > 0;
      
      return `
        <div class="search-result-item ${hasAnalysis ? 'has-analysis' : 'no-analysis'}" 
             data-paper-id="${paperId}" 
             data-has-analysis="${hasAnalysis}">
          <div class="search-result-title">${title}</div>
          <div class="search-result-meta">
            Paper ID: ${paperId} ${hasAnalysis ? `• <span style="color: #28a745; font-weight: 600;">✅ Analyzed on ${new Date(paper.updated_at).toLocaleDateString()}</span>` : '• <span style="color: #6c757d;">📄 Not analyzed</span>'}
          </div>
          <div class="search-result-authors">${authors ? authors : '<span style=\'color:#bbb\'>No authors found</span>'}</div>
        </div>
      `;
    }).join('');

    searchResults.innerHTML = resultsHtml;
    searchResults.style.display = 'block';

    // Add click handlers for navigation
    Array.from(searchResults.getElementsByClassName('search-result-item')).forEach(item => {
      item.addEventListener('click', async function(event) {
        // Prevent any default behavior and stop event bubbling
        event.preventDefault();
        event.stopPropagation();
        
        console.log('🔍 Search result clicked!');
        const paperId = this.getAttribute('data-paper-id');
        const hasAnalysis = this.getAttribute('data-has-analysis') === 'true';
        
        console.log('🔍 Paper ID:', paperId);
        console.log('🔍 Has analysis:', hasAnalysis);
        
        if (paperId) {
          try {
            console.log('🔍 Using paperID for navigation (consistent approach)');
            const fullpageUrl = await buildAnalysisUrlFromPaperId(paperId);
            console.log('🔍 Built URL:', fullpageUrl);
            window.location.href = fullpageUrl;
          } catch (error) {
            console.error('🔍 Error building URL from paperID:', error);
            // Fallback to basic paperID URL
            const fallbackUrl = `${chrome.runtime.getURL('fullpage.html')}?paperID=${encodeURIComponent(paperId)}`;
            console.log('🔍 Using fallback URL:', fallbackUrl);
            window.location.href = fallbackUrl;
          }
        } else {
          console.log('🔍 No paper ID found');
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
        const scholarUrl = localSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
        googleScholarUrl.value = scholarUrl;
        console.log('📚 Loaded Scholar URL from storage:', localSettings.googleScholarUrl);
        console.log('📚 Set Google Scholar URL input to:', scholarUrl);
        // Cache the scholar URL for sync access
        window.localScholarUrlCache = scholarUrl;
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
      // const userSettings = await chrome.storage.local.get(['userSettings']);
      // const llmSettings = await chrome.storage.local.get(['llmSettings']);
      // Get LLM settings and user settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', geminiKey: '', openaiKey: '', claudeKey: '' };
      const userSettings = (await chrome.storage.local.get(['userSettings'])) || {};
      const userScholarUrl = userSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const researchInterests = userSettings.researchInterests || '';
            
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
      settings.lastUpdated = new Date().toISOString();
      
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
      console.log('📚 Saving to local storage:', localSettings);
      await chrome.storage.local.set({ userSettings: localSettings });
      console.log('📚 Settings saved to local storage successfully');
      console.log('📚 Scholar URL saved as:', localSettings.googleScholarUrl);
      
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

  // Enhanced counter animation function with visual effects
  function animateCounter(element, start, end, duration) {
    const startTime = performance.now();
    const difference = end - start;
    
    // Add animating class for pulse effect
    element.classList.add('animating');
    
    function updateCounter(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = Math.floor(start + (difference * easeOutQuart));
      
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        // Remove animating class when complete
        setTimeout(() => {
          element.classList.remove('animating');
        }, 100);
      }
    }
    
    requestAnimationFrame(updateCounter);
  }

  // Junior Researchers Functionality
  async function loadJuniorResearchersSettings() {
    try {
      const result = await chrome.storage.local.get(['juniorResearchersSettings']);
      const settings = result.juniorResearchersSettings || getDefaultJuniorResearchers();
      
      // Update checkboxes based on saved settings
      Object.keys(settings).forEach(researcherKey => {
        const checkbox = document.getElementById(`junior_${researcherKey}`);
        if (checkbox) {
          checkbox.checked = settings[researcherKey];
        }
      });
      
      console.log('Junior researchers settings loaded:', settings);
    } catch (error) {
      console.error('Error loading junior researchers settings:', error);
    }
  }
  
  async function saveJuniorResearchersSettings() {
    try {
      const settings = {};
      const checkboxes = document.querySelectorAll('input[name="junior_researchers"]');
      
      checkboxes.forEach(checkbox => {
        settings[checkbox.value] = checkbox.checked;
      });
      
      await chrome.storage.local.set({ juniorResearchersSettings: settings });
      console.log('Junior researchers settings saved:', settings);
      
      // Show success message
      const saveBtn = document.getElementById('saveResearcherSelection');
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '✓ Saved!';
      saveBtn.style.backgroundColor = '#28a745';
      
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.backgroundColor = '#28a745';
      }, 2000);
      
    } catch (error) {
      console.error('Error saving junior researchers settings:', error);
      alert('Error saving settings: ' + error.message);
    }
  }
  
  function getDefaultJuniorResearchers() {
    return {
      key_message: true,
      author_profiles: true,
      contributions_novelty: true,
      data_variables_models: true,
      identification_causality: true,
      quick_takeaways: true,
      bibliography_reference: true
    };
  }
  
  function resetJuniorResearchersToDefault() {
    const defaultSettings = getDefaultJuniorResearchers();
    
    Object.keys(defaultSettings).forEach(researcherKey => {
      const checkbox = document.getElementById(`junior_${researcherKey}`);
      if (checkbox) {
        checkbox.checked = defaultSettings[researcherKey];
      }
    });
    
    console.log('Junior researchers reset to default');
  }
  
  function setupJuniorResearchers() {
    console.log('🔧 Setting up junior researchers functionality...');
    
    // Load saved settings
    loadJuniorResearchersSettings();
    
    // Setup save button
    const saveBtn = document.getElementById('saveResearcherSelection');
    const resetBtn = document.getElementById('resetResearcherSelection');
    
    console.log('🔍 Junior researcher button elements found:', {
      saveBtn: !!saveBtn,
      resetBtn: !!resetBtn,
      saveBtnVisible: saveBtn ? (saveBtn.offsetWidth > 0 && saveBtn.offsetHeight > 0) : false,
      resetBtnVisible: resetBtn ? (resetBtn.offsetWidth > 0 && resetBtn.offsetHeight > 0) : false
    });
    
    if (saveBtn) {
      console.log('✅ Setting up save researcher selection button');
      saveBtn.addEventListener('click', function(event) {
        console.log('🎯 Save researcher selection button clicked!');
        event.preventDefault();
        saveJuniorResearchersSettings();
      });
    } else {
      console.error('❌ Save researcher selection button not found!');
    }
    
    if (resetBtn) {
      console.log('✅ Setting up reset researcher selection button');
      resetBtn.addEventListener('click', function(event) {
        console.log('🎯 Reset researcher selection button clicked!');
        event.preventDefault();
        resetJuniorResearchersToDefault();
      });
    } else {
      console.error('❌ Reset researcher selection button not found!');
    }
    
    console.log('✅ Junior researchers functionality set up');
  }
  
  // Function to get current junior researchers selection (for use during analysis)
  async function getCurrentJuniorResearchersSelection() {
    try {
      const result = await chrome.storage.local.get(['juniorResearchersSettings']);
      return result.juniorResearchersSettings || getDefaultJuniorResearchers();
    } catch (error) {
      console.error('Error getting current junior researchers selection:', error);
      return getDefaultJuniorResearchers();
    }
  }

  // Global function to view a paper (called from search results)
  window.viewPaper = async function(paperId) {
    // Use consistent URL building
    const url = await buildAnalysisUrlFromPaperId(paperId);
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
    
    // Capture original content before try block
    const uploadPlaceholder = uploadArea.querySelector('.upload-placeholder');
    const originalContent = uploadPlaceholder?.innerHTML;
    
    try {
      // Show step 1: Reading file
      uploadPlaceholder.innerHTML = `
        <div class="loading" style="margin: 20px auto;"></div>
        <p><strong>Step 1/5:</strong> Reading PDF file...</p>
        <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 10px;">
          <small>📄 File: ${file.name}</small><br>
          <small>📊 Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB</small>
        </div>
      `;
      
      // Convert file to base64
      const base64Content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
          try {
            // Show step 2: Converting file
            uploadPlaceholder.innerHTML = `
              <div class="loading" style="margin: 20px auto;"></div>
              <p><strong>Step 2/5:</strong> Converting PDF to base64...</p>
              <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 10px;">
                <small>📄 File: ${file.name}</small><br>
                <small>📊 Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB</small><br>
                <small>🔄 Status: Processing...</small>
              </div>
            `;
            
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
      
      // Show step 3: Extracting metadata
      uploadPlaceholder.innerHTML = `
        <div class="loading" style="margin: 20px auto;"></div>
        <p><strong>Step 3/5:</strong> Extracting PDF metadata...</p>
        <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 10px;">
          <small>📄 File: ${file.name}</small><br>
          <small>📊 Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB</small><br>
          <small>🔍 Analyzing title, authors, abstract...</small>
        </div>
      `;
      
      const content = {
        title: file.name.replace('.pdf', ''),
        paperUrl: '',
        isLocalFile: true,
        filePath: file.name,
        fileName: file.name,
        fileSize: file.size,
        hasPdf: true,
        file_content: base64Content
      };
      
      // Generate paper ID
      const paperId = await SharedIdGenerator.generatePaperId(content);
      content.paperId = paperId;

      // Get current backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // Check if paper exists and extract metadata
      const metadataResponse = await fetch(`${backend.url}/pdf/extract-metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          file_content: base64Content
        })
      });
      
      if (!metadataResponse.ok) {
        throw new Error(`Metadata extraction failed: ${metadataResponse.status}`);
      }
      
      const metadata = await metadataResponse.json();
      
      // Show step 4: Processing results
      if (metadata.paper_exists) {
        uploadPlaceholder.innerHTML = `
          <div class="loading" style="margin: 20px auto;"></div>
          <p><strong>Step 4/5:</strong> Paper already exists in database!</p>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #4CAF50;">
            <h4 style="margin: 0 0 10px 0; color: #2e7d32;">📄 ${metadata.title}</h4>
            <small><strong>Authors:</strong> ${metadata.authors.join(', ')}</small><br>
            <small><strong>Pages:</strong> ${metadata.total_pages}</small><br>
            <small><strong>Paper ID:</strong> ${metadata.paper_id}</small>
          </div>
        `;
      } else {
        uploadPlaceholder.innerHTML = `
          <div class="loading" style="margin: 20px auto;"></div>
          <p><strong>Step 4/5:</strong> Metadata extracted successfully!</p>
          <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #2196F3;">
            <h4 style="margin: 0 0 10px 0; color: #1565c0;">📄 ${metadata.title}</h4>
            <small><strong>Authors:</strong> ${metadata.authors.join(', ')}</small><br>
            <small><strong>Pages:</strong> ${metadata.total_pages}</small><br>
            <small><strong>Paper ID:</strong> ${metadata.paper_id}</small><br>
            <small><strong>Status:</strong> New paper created in database</small>
          </div>
        `;
      }
      
      // Show step 5: Redirecting
      setTimeout(() => {
        uploadPlaceholder.innerHTML = `
          <div class="loading" style="margin: 20px auto;"></div>
          <p><strong>Step 5/5:</strong> Opening paper view...</p>
          <div style="background: #e8f5e8; padding: 15px; border-radius: 5px; margin-top: 10px; border-left: 4px solid #4CAF50;">
            <h4 style="margin: 0 0 10px 0; color: #2e7d32;">✅ Ready!</h4>
            <small>Redirecting to paper analysis page...</small>
          </div>
        `;
        
        // Redirect to fullpage with paper ID
        setTimeout(() => {
          const redirectUrl = `${window.location.origin}${window.location.pathname}${metadata.redirect_url}`;
          console.log('🎯 Redirecting to:', redirectUrl);
          window.location.href = redirectUrl;
        }, 1000);
      }, 1500);
      
    } catch (error) {
      console.error('Error uploading PDF:', error);
      
      // Show error state
      uploadPlaceholder.innerHTML = `
        <div style="background: #ffebee; padding: 15px; border-radius: 5px; border-left: 4px solid #f44336;">
          <h4 style="margin: 0 0 10px 0; color: #c62828;">❌ Upload Failed</h4>
          <small>${error.message}</small><br>
          <button onclick="location.reload()" style="margin-top: 10px; padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 3px; cursor: pointer;">Try Again</button>
        </div>
      `;
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
  
  // DOM Elements - Analysis View (consolidated from multiple locations)
  // analyzeBtn removed - analysis handled via homepage upload
  const backBtn = document.getElementById('backBtn');
  const clearBtn = document.getElementById('clearBtn');
  const viewAuthorsBtn = document.getElementById('viewAuthorsBtn');
  const statusDiv = document.getElementById('status');
  const summaryDiv = document.getElementById('summary');
  const uploadSection = document.getElementById('uploadSection');
  const pdfUpload = document.getElementById('pdfUpload');
  const uploadBtn = document.getElementById('uploadBtn');
  const chatSection = document.getElementById('chatSection');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const analysisContent = document.getElementById('analysisContent');
  const paperInfo = document.getElementById('paperInfo');
  const paperTitle = document.getElementById('paperTitle');
  const paperMeta = document.getElementById('paperMeta');

  let currentPdfContent = null;

  // Helper functions to avoid code duplication
  function getUrlParams() {
    return new URLSearchParams(window.location.search);
  }

  function getPaperIdFromUrl() {
    return getUrlParams().get('paperID');
  }

  // function getAnalysisIdFromUrl() {
  //   return getUrlParams().get('analysisID');
  // }

  function navigateToHomepage() {
    window.location.replace(buildHomepageUrl());
  }

  // Note: Removed complex waiting state functions - now using inline processing



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
          
          // Get junior researchers selection
          const juniorResearchersSelection = await getCurrentJuniorResearchersSelection();
          
          // Prepare request body with only non-empty API keys
          const requestBody = { 
            content,
            file_content: content.file_content, // Move file_content to top level for backend
            research_interests: researchInterests, // Include research interests for personalized analysis
            user_scholar_url: userScholarUrl, // Include user's Google Scholar URL for analysis configuration
            model: selectedModel, // Include the selected model for analysis
            junior_researchers: juniorResearchersSelection // Include junior researchers selection
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
            paperUrl: '',      // Don't use blob URL for ID generation
            isLocalFile: true,
            filePath: file.name,
            fileName: file.name,
            fileSize: file.size,
            hasPdf: true,
            file_content: base64Content // Send as base64 string - backend expects 'file_content'
          };
          
          // Generate consistent paper ID using the same logic as popup for file:// URLs
          const paperId = await SharedIdGenerator.generatePaperId(content);
          content.paperId = paperId;

          currentPdfContent = content;
      const result = await analyzePaper(content);
      return result; // Return the result so we can get the paper ID
      
    } catch (error) {
      console.error('Error handling PDF upload:', error);
      updateStatus(`Error uploading PDF: ${error.message}`, true);
      // Keep upload section hidden on error - user can use "Go to Homepage" to try again
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
      
      // Generate consistent analysis_id using the same logic as backend
      const settings = await chrome.storage.local.get(['userSettings']);
      const userScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const generatedAnalysisId = await generateAnalysisId(paperId, userScholarUrl);
      
      // When storing analysis results:
      const analysisResult = {
        timestamp: new Date().toISOString(),
        paperId: paperId,
        analysisId: data.analysis_id || generatedAnalysisId, // Use backend analysis_id or generate consistent one
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
      
      // Return both paperId and analysisId for URL construction
      return { 
        paperId: paperId,
        analysisId: data.analysis_id || generatedAnalysisId
      };
      
    } catch (error) {
      console.error('Error analyzing paper:', error);
      updateStatus(`Analysis failed: ${error.message}`, true);
      
      // Keep upload section hidden on error - user can use "Go to Homepage" to try again
      
      // Update analysis status to error and clear any cached error state
      if (paperId) {
        await setAnalysisStatus(paperId, 'error', error.message);
        const storageKey = `analysis_${paperId}`;
        await chrome.storage.local.remove([storageKey]);
        
        // Retry functionality now handled via homepage upload section
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
    console.log("🔍 Chat: handleChat function called with message:", message);
    
    if (!currentPdfContent) {
      console.log("🔍 Chat: No PDF content available, returning early");
      addMessage('No PDF content available for chat. Please upload a PDF first.', false);
      return;
    }
    
    console.log("🔍 Chat: PDF content is available, proceeding with chat");

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
      console.log("🔍 Chat: Starting handleChat function");
      
      // Get LLM settings - fetch fresh each time to avoid caching issues
      const storageResult = await chrome.storage.local.get(['llmSettings']);
      console.log("🔍 Chat: Raw storage result:", storageResult);
      
      const llmSettings = storageResult.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      console.log("🔍 Chat: LLM settings loaded:", {
        model: llmSettings.model,
        hasGeminiKey: !!llmSettings.geminiKey,
        hasOpenaiKey: !!llmSettings.openaiKey,
        hasClaudeKey: !!llmSettings.claudeKey,
        lastUpdated: llmSettings.lastUpdated || 'unknown'
      });
      
      // Format request to match backend's expected structure
      console.log('🔍 Chat: Model processing:', {
        originalModel: llmSettings.model,
        processedModel: getModelName(llmSettings.model)
      });
      
      const requestBody = {
        message: message,
        paper: currentPdfContent, // Send the entire PDF content object as 'paper'
        model: getModelName(llmSettings.model)
      };
      
      // Only add API keys if they have actual content (same pattern as analysis code)
      if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
        requestBody.google_api_key = llmSettings.geminiKey;
      }
      if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
        requestBody.openai_api_key = llmSettings.openaiKey;
      }
      if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
        requestBody.claude_api_key = llmSettings.claudeKey;
      }
      
      console.log("🔍 Chat: API keys added:", {
        google_api_key: !!requestBody.google_api_key,
        openai_api_key: !!requestBody.openai_api_key,
        claude_api_key: !!requestBody.claude_api_key
      });
      console.log("🔍 Chat: Request body prepared:", requestBody);
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
        addMessage(`Error: ${errorData || 'Could not get response from server'}`, false);
      }
    } catch (error) {
      
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

    // Test functions removed - real chat now works with LLM settings

  // Debug function to check current PDF content state
  window.checkPdfContent = function() {
    console.log('🔍 PDF Content Status:', {
      currentPdfContent: !!currentPdfContent,
      currentPdfContentType: typeof currentPdfContent,
      hasTitle: !!(currentPdfContent?.title),
      hasPaperContent: !!(currentPdfContent?.paperContent),
      hasAbstract: !!(currentPdfContent?.abstract),
      chatSectionVisible: document.getElementById('chatSection')?.style.display !== 'none'
    });
    
    if (currentPdfContent) {
      console.log('🔍 PDF Content Details:', {
        title: currentPdfContent.title,
        contentLength: currentPdfContent.paperContent?.length || 0,
        abstractLength: currentPdfContent.abstract?.length || 0
      });
    }
    
    return currentPdfContent;
  };

  // Debug function to check current page state and analysis loading
  window.checkPageState = function() {
    const urlParams = getUrlParams();
    const paperId = urlParams.get('paperID');
    
    console.log('🔍 Page State Check:', {
      currentUrl: window.location.href,
      paperId: paperId,
      viewMode: typeof viewMode !== 'undefined' ? viewMode : 'undefined',
      currentPdfContent: !!currentPdfContent,
      chatSectionVisible: document.getElementById('chatSection')?.style.display !== 'none',
      analysisContentVisible: document.getElementById('analysisContent')?.style.display !== 'none'
    });
    
         return { paperId, currentPdfContent: !!currentPdfContent };
   };

    // Debug functions removed - functionality now works automatically

  // Function to set PDF content from storage data (for papers without full analysis)
  async function setPdfContentFromStorage(paperId) {
    try {
      console.log('🔍 Attempting to set PDF content from storage for paper:', paperId);
      
      const backend = await backendManager.getCurrentBackend();
      const response = await fetch(`${backend.url}/storage/paper/${encodeURIComponent(paperId)}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data?.metadata) {
          // Create PDF content object from storage data
          currentPdfContent = {
            title: data.title,
            paperContent: `This paper has been analyzed. Content available from ${data.chunk_count || 0} text chunks.`,
            abstract: data.metadata.abstract || '',
            authors: data.metadata.authors || [],
            paperUrl: data.metadata.paperUrl || '',
            affiliations: data.metadata.affiliations || [],
            paperId: paperId,
            isFromStorage: true // Flag to indicate this is from storage, not full analysis
          };
          
          console.log('🔍 PDF content set from storage:', {
            title: currentPdfContent.title,
            hasAbstract: !!currentPdfContent.abstract,
            authorCount: currentPdfContent.authors.length,
            isFromStorage: true
          });
          
          // Enable chat section
          if (chatSection) {
            chatSection.style.display = 'block';
            console.log('🔍 Chat section enabled from storage data');
          }
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log('🔍 Error setting PDF content from storage:', error);
      return false;
    }
  }

  // Auto-recovery now handles this automatically

  // // Function to display author analysis results
  // function displayAuthorAnalysis(authorData) {
  //   const summary = authorData.summary;
  //   const authors = authorData.authors;
    
  //   // Create HTML for author analysis display
  //   let html = `
  //     ${viewMode === 'authors' ? '' : '<hr style="margin: 30px 0; border: none; border-top: 2px solid #e9ecef;">'}
  //     <div class="author-analysis-container">
  //       <h2>${viewMode === 'authors' ? 'Author Profiles & Analysis' : 'Author Analysis Results'}</h2>
        
  //       <div class="summary-stats">
  //         <h3>Summary Statistics</h3>
  //         <div class="stats-grid">
  //           <div class="stat-item">
  //             <span class="stat-label">Total Authors:</span>
  //             <span class="stat-value">${summary.total_authors}</span>
  //           </div>
  //           <div class="stat-item">
  //             <span class="stat-label">Total FT50 Publications:</span>
  //             <span class="stat-value">${summary.total_ft50_publications}</span>
  //           </div>
  //           <div class="stat-item">
  //             <span class="stat-label">Total Citations:</span>
  //             <span class="stat-value">${summary.total_citations.toLocaleString()}</span>
  //           </div>
  //           <div class="stat-item">
  //             <span class="stat-label">Highest H-index:</span>
  //             <span class="stat-value">${summary.max_h_index}</span>
  //           </div>
  //         </div>
  //       </div>

  //       <div class="authors-list">
  //         <h3>Individual Author Profiles</h3>
  //   `;

  //   // Add each author's profile
  //   authors.forEach((author, index) => {
  //     html += `
  //       <div class="author-profile">
  //         <h4>${author.name}</h4>
  //         ${author.affiliation ? `<p class="affiliation"><strong>Affiliation:</strong> ${author.affiliation}</p>` : ''}
          
  //         ${author.note ? `
  //           <p class="info-message">${author.note}</p>
  //         ` : ''}
          
  //         ${author.error ? `
  //           <p class="error-message">Error: ${author.error}</p>
  //         ` : `
  //           <div class="author-stats">
  //             <div class="stat-row">
  //               <span class="stat-label">Citations:</span>
  //               <span class="stat-value">${author.citations.toLocaleString()}</span>
  //             </div>
  //             <div class="stat-row">
  //               <span class="stat-label">H-index:</span>
  //               <span class="stat-value">${author.h_index}</span>
  //             </div>
  //             <div class="stat-row">
  //               <span class="stat-label">i10-index:</span>
  //               <span class="stat-value">${author.i10_index}</span>
  //             </div>
  //             <div class="stat-row">
  //               <span class="stat-label">FT50 Publications:</span>
  //               <span class="stat-value">${author.ft50_count}</span>
  //             </div>
  //           </div>

  //           ${author.ft50_journals && author.ft50_journals.length > 0 ? `
  //             <div class="ft50-journals">
  //               <strong>FT50 Journals:</strong>
  //               <ul>
  //                 ${author.ft50_journals.map(journal => `<li>${journal}</li>`).join('')}
  //               </ul>
  //             </div>
  //           ` : ''}

  //           ${author.research_areas && author.research_areas.length > 0 ? `
  //             <div class="research-areas">
  //               <strong>Research Areas:</strong>
  //               <div class="tags">
  //                 ${author.research_areas.map(area => `<span class="tag">${area}</span>`).join('')}
  //               </div>
  //             </div>
  //           ` : ''}

  //           ${author.most_cited_papers && author.most_cited_papers.length > 0 ? `
  //             <div class="most-cited-papers">
  //               <strong>Most Cited Papers:</strong>
  //               <ul>
  //                 ${author.most_cited_papers.slice(0, 3).map(paper => 
  //                   `<li>${paper.title || paper} ${paper.citations ? `(${paper.citations} citations)` : ''}</li>`
  //                 ).join('')}
  //               </ul>
  //             </div>
  //           ` : ''}

  //           ${author.publications && author.publications.length > 0 ? `
  //             <div class="recent-publications">
  //               <strong>Recent Publications (Top ${Math.min(5, author.publications.length)}):</strong>
  //               <ul>
  //                 ${author.publications.slice(0, 5).map(pub => `
  //                   <li>
  //                     <strong>${pub.title}</strong><br>
  //                     ${pub.authors ? `<em>${pub.authors}</em><br>` : ''}
  //                     ${pub.venue ? `${pub.venue}` : ''} ${pub.year ? `(${pub.year})` : ''}
  //                   </li>
  //                 `).join('')}
  //               </ul>
  //             </div>
  //           ` : ''}

  //           ${author.profile_url ? `
  //             <div class="profile-link">
  //               <a href="${author.profile_url}" target="_blank">View Full Profile</a>
  //             </div>
  //           ` : ''}
  //         `}
  //       </div>
  //     `;
  //   });

  //   html += `
  //       </div>

  //       ${summary.unique_ft50_journals && summary.unique_ft50_journals.length > 0 ? `
  //         <div class="unique-journals">
  //           <h3>All FT50 Journals Represented</h3>
  //           <div class="tags">
  //             ${summary.unique_ft50_journals.map(journal => `<span class="tag">${journal}</span>`).join('')}
  //           </div>
  //         </div>
  //       ` : ''}

  //       ${summary.research_areas && summary.research_areas.length > 0 ? `
  //         <div class="all-research-areas">
  //           <h3>Research Areas Covered</h3>
  //           <div class="tags">
  //             ${summary.research_areas.map(area => `<span class="tag">${area}</span>`).join('')}
  //           </div>
  //         </div>
  //       ` : ''}
  //     </div>
  //   `;

  //   // Add CSS styles for author analysis
  //   html += `
  //     <style>
  //       .author-analysis-container {
  //         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  //         line-height: 1.6;
  //       }
  //       .summary-stats {
  //         background-color: #f8f9fa;
  //         padding: 20px;
  //         border-radius: 8px;
  //         margin-bottom: 30px;
  //       }
  //       .stats-grid {
  //         display: grid;
  //         grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  //         gap: 15px;
  //         margin-top: 15px;
  //       }
  //       .stat-item {
  //         background: white;
  //         padding: 15px;
  //         border-radius: 6px;
  //         box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  //       }
  //       .stat-label {
  //         display: block;
  //         font-weight: 600;
  //         color: #495057;
  //         margin-bottom: 5px;
  //       }
  //       .stat-value {
  //         display: block;
  //         font-size: 1.4em;
  //         font-weight: 700;
  //         color: #2c3e50;
  //       }
  //       .author-profile {
  //         background: white;
  //         border: 1px solid #dee2e6;
  //         border-radius: 8px;
  //         padding: 20px;
  //         margin-bottom: 20px;
  //         box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  //       }
  //       .author-profile h4 {
  //         margin: 0 0 10px 0;
  //         color: #2c3e50;
  //         font-size: 1.3em;
  //       }
  //       .affiliation {
  //         color: #6c757d;
  //         margin-bottom: 15px;
  //       }
  //       .info-message {
  //         background-color: #e3f2fd;
  //         color: #1976d2;
  //         padding: 10px;
  //         border-radius: 4px;
  //         margin: 10px 0;
  //         font-style: italic;
  //       }
  //       .author-stats {
  //         display: grid;
  //         grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  //         gap: 10px;
  //         margin-bottom: 15px;
  //       }
  //       .stat-row {
  //         display: flex;
  //         justify-content: space-between;
  //         padding: 8px 12px;
  //         background: #f8f9fa;
  //         border-radius: 4px;
  //       }
  //       .stat-row .stat-label {
  //         font-weight: 500;
  //         color: #495057;
  //       }
  //       .stat-row .stat-value {
  //         font-weight: 600;
  //         color: #2c3e50;
  //       }
  //       .ft50-journals, .research-areas, .most-cited-papers, .recent-publications {
  //         margin: 15px 0;
  //       }
  //       .ft50-journals ul, .most-cited-papers ul, .recent-publications ul {
  //         margin: 8px 0;
  //         padding-left: 20px;
  //       }
  //       .ft50-journals li, .most-cited-papers li, .recent-publications li {
  //         margin-bottom: 5px;
  //       }
  //       .tags {
  //         display: flex;
  //         flex-wrap: wrap;
  //         gap: 8px;
  //         margin-top: 8px;
  //       }
  //       .tag {
  //         background: #e9ecef;
  //         color: #495057;
  //         padding: 4px 8px;
  //         border-radius: 12px;
  //         font-size: 0.9em;
  //         font-weight: 500;
  //       }
  //       .profile-link {
  //         margin-top: 15px;
  //       }
  //       .profile-link a {
  //         color: #007bff;
  //         text-decoration: none;
  //         font-weight: 500;
  //       }
  //       .profile-link a:hover {
  //         text-decoration: underline;
  //       }
  //       .error-message {
  //         color: #dc3545;
  //         font-style: italic;
  //       }
  //       .unique-journals, .all-research-areas {
  //         background: #f8f9fa;
  //         padding: 20px;
  //         border-radius: 8px;
  //         margin-top: 20px;
  //       }
  //       .unique-journals h3, .all-research-areas h3 {
  //         margin-top: 0;
  //         color: #2c3e50;
  //       }
  //     </style>
  //   `;

  //   // Only render author analysis in authors view
  //   console.log('🔍 DEBUG displayAuthorAnalysis - viewMode:', viewMode, 'summaryDiv:', !!summaryDiv);
  //   if (summaryDiv && viewMode === 'authors') {
  //     console.log('✅ Rendering author analysis content in authors view');
  //     summaryDiv.innerHTML = html;
  //     // In authors view, we want to show only author analysis, not paper analysis
  //     return; // Exit early to prevent paper analysis from being displayed
  //   } else {
  //     console.log('⚠️ Not rendering in summaryDiv - viewMode is not "authors" or summaryDiv not found');
  //   }
  // }

  // // Legacy helper function - replaced by buildAnalysisUrlFromPaperId
  // async function buildFullpageUrl(paperId, additionalParams = {}) {
  //   console.warn('buildFullpageUrl is deprecated, use buildAnalysisUrlFromPaperId instead');
  //   return buildAnalysisUrlFromPaperId(paperId, null, additionalParams);
  // }

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
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        console.log('No backend available for fetching analysis');
        return null;
      }
      
      // If we have a scholar URL, try using the generated analysis_id first for better efficiency
      if (requestedScholarUrl) {
        try {
                  // Get LLM settings and user settings
          const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', geminiKey: '', openaiKey: '', claudeKey: '' };
          const userSettings = (await chrome.storage.local.get(['userSettings'])) || {};
          const userScholarUrl = userSettings.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
          const researchInterests = userSettings.researchInterests || '';
      
          const generatedAnalysisId = await generateAnalysisId(paperId, userScholarUrl);
          const analysisIdUrl = `${backend.url}/analysis/${encodeURIComponent(generatedAnalysisId)}`;
          console.log('Trying to fetch analysis by generated analysis_id:', analysisIdUrl);
          
          const analysisIdResponse = await fetch(analysisIdUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (analysisIdResponse.ok) {
            const data = await analysisIdResponse.json();
            console.log('Successfully fetched analysis using generated analysis_id:', data);
            return data;
          }
        } catch (error) {
          console.log('Failed to fetch by generated analysis_id, falling back to paper_id + scholar param:', error);
        }
      }
      
      // Fallback to original method: paper_id with scholar parameter
      let url = `${backend.url}/analysis/${encodeURIComponent(paperId)}`;
      // if (requestedScholarUrl) {
      //   url += `?scholar=${encodeURIComponent(requestedScholarUrl)}`;
      // }
      console.log('Trying to fetch analysis from backend (fallback):', url);
      
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
        // Backend returns analysis data in flat structure with direct 'summary' field
        let summary = '';
        if (typeof data === 'object' && data.summary && typeof data.summary === 'string') {
            summary = data.summary;
          console.log('Found summary in backend response, length:', summary.length);
        } else {
          console.log('No summary found in backend response. Available keys:', Object.keys(data));
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
        
        // Generate consistent analysis_id for storage
        const generatedAnalysisId = requestedScholarUrl ? 
          await generateAnalysisId(paperId, requestedScholarUrl) : paperId;
        
        const analysisResult = {
          timestamp: new Date().toISOString(),
          paperId: paperId,
          analysisId: data.analysis_id || generatedAnalysisId,
          model: data.ai_model || data.model || 'unknown',
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
            author_data: data.author_data || null,  // Handle missing author data
            // Include additional author datapoints for easy access (directly from backend response)
            authors: data.authors || null,
            author_summary: data.author_summary || null,
            total_authors: data.total_authors || 0,
            total_citations: data.total_citations || 0,
            total_ft50_publications: data.total_ft50_publications || 0,
            max_h_index: data.max_h_index || 0,
            unique_ft50_journals: data.unique_ft50_journals || [],
            research_areas: data.research_areas || []
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

  // --- Typewriter effect for Essence Scholar title ---
  function startTitleTypewriter() {
    const titleElement = document.getElementById('mainTitle');
    const cursorElement = document.querySelector('.cursor');
    if (!titleElement || !cursorElement) return;
    
    const fullText = 'Essence Scholar';
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
    // Detect view mode using consistent system
    const detectedViewMode = detectViewMode();
    viewMode = detectedViewMode; // Set global viewMode variable
    
    const urlParams = getUrlParams();
    const paperUrl = urlParams.get('paperUrl');
    // const analysisId = urlParams.get('analysisID');
    const paperId = (paperUrl ? await extractSsrnIdOrUrl(paperUrl) : null) || urlParams.get('paperID');
    // const requestedScholarUrl = urlParams.get('scholar');
    
    console.log('🎯 Fullpage View Mode Detection:', {
      detectedViewMode,
      // analysisId,
      paperId,
      // requestedScholarUrl,
      urlParams: urlParams.toString()
    });

    // SCENARIO 1: Homepage mode
    if (detectedViewMode === VIEW_MODES.HOMEPAGE) {
      isHomepage = true;
      document.body.classList.add('homepage-mode');
      startSubtitleLoop();
      startTitleTypewriter();
      
      await loadHomepageStats();
      await loadSettings();
      await loadModelSettings();
      
      setupModelSelection();
      setupJuniorResearchers();
      
      if (searchInput) {
        searchInput.focus();
      }
      
      console.log('✅ Initialized homepage mode');
      return;
    }

    // SCENARIO 2: Individual Author Profile view
    if (detectedViewMode === VIEW_MODES.AUTHOR_PROFILE) {
      const authorId = urlParams.get('authorID');
      
      console.log('✅ Loading individual author profile view with authorId:', authorId);
      
      // Add specific class for author profile view
      document.body.classList.add('author-profile-view-mode');
      document.body.classList.remove('homepage-mode');
      
      updateStatus(`Loading author profile for ID ${authorId}...`);
      
      try {
        // Fetch individual author data from backend
        const backend = await backendManager.getCurrentBackend();
        if (!backend) {
          throw new Error('No backend available');
        }
        
        const response = await fetch(`${backend.url}/author/${encodeURIComponent(authorId)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch author profile: ${response.status} ${response.statusText}`);
        }
        
        const authorData = await response.json();
        
        console.log('Successfully loaded author profile data:', authorData);
        
        // Add detailed debugging for author metrics
        console.log('🔍 DEBUG Author Profile Data Structure:');
        console.log('  - Author Profile:', authorData.author_profile);
        console.log('  - Metrics:', authorData.metrics);
        console.log('  - Papers:', authorData.papers?.length || 0);
        console.log('  - Publications:', authorData.publications?.length || 0);
        console.log('  - Total Papers:', authorData.total_papers);
        console.log('  - Total Publications:', authorData.total_publications);
        
        clearStatus();
        
        // Set up author profile UI
        setupAuthorProfileUI(authorData);
        setupButtonEventListeners();
        
      } catch (error) {
        console.error('Error loading author profile:', error);
        updateStatus(`Error loading author profile: ${error.message}`, true);
        await setupBasicErrorUI();
        setupButtonEventListeners();
      }
      return;
    }

    // For all non-homepage modes: setup common UI elements
    document.body.classList.remove('homepage-mode');
    isHomepage = false;
    stopSubtitleLoop();
    
    if (uploadSection) uploadSection.style.display = 'none';
    
    // Initialize new two-panel layout for paper analysis (but NOT for authors view or author profile view)
    if ((paperId || analysisId) && detectedViewMode !== VIEW_MODES.AUTHORS && detectedViewMode !== VIEW_MODES.AUTHOR_PROFILE) {
      await initializeNewLayout();
    }
    
    // Always set up button listeners when not in homepage mode
    setupButtonEventListeners();

    // // SCENARIO 3: Authors view
    // if (detectedViewMode === VIEW_MODES.AUTHORS) {
    //   console.log('✅ Loading authors view with paperId:', paperId);
      
    //   // Add specific class for authors view to control layout
    //   document.body.classList.add('authors-view-mode');
    //   document.body.classList.remove('homepage-mode');
      
    //   updateStatus(`Loading author data...`);
      
    //   try {
    //     let authorData = null;
        
    //     // Try to fetch author data directly by paperID first
    //     if (paperId) {
    //       console.log('Attempting to fetch author data by paperId:', paperId);
    //       authorData = await fetchAuthorDataByPaperId(paperId);
    //     }
        
    //     // Fallback: if no paperID or no data found, try analysisID approach
    //     if (!authorData && analysisId) {
    //       console.log('Fallback: fetching author data by analysisId:', analysisId);
    //       authorData = await fetchAuthorDataByAnalysisId(analysisId);
    //     }
        
    //     // Final fallback: generate analysisId from paperId if we have it
    //     if (!authorData && paperId) {
    //       console.log('Final fallback: generating analysisId from paperId');
    //       let authorsScholar = requestedScholarUrl;
    //       if (!authorsScholar) {
    //         const res = await chrome.storage.local.get(['userSettings']);
    //         authorsScholar = res.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
    //       }
    //       const generatedAnalysisId = await generateAnalysisId(paperId, authorsScholar);
    //       authorData = await fetchAuthorDataByAnalysisId(generatedAnalysisId);
    //     }
        
    //     if (authorData && authorData.data?.author_data) {
    //       console.log('Successfully loaded author data');
    //       console.log('🔍 DEBUG Authors View - viewMode:', viewMode, 'authorData:', authorData);
    //       clearStatus();
          
    //       // Ensure viewMode is set correctly for authors view
    //       viewMode = VIEW_MODES.AUTHORS;
    //       console.log('🔍 DEBUG - Set viewMode to AUTHORS:', viewMode);
          
    //       displayAuthorAnalysis(authorData.data.author_data);
    //       setupAuthorsViewUI(authorData);
    //       setupButtonEventListeners();
    //     } else {
    //       console.log('🔍 DEBUG - No author data found:', authorData);
    //       updateStatus('No author analysis data available for this paper. Try running an author analysis first.', true);
    //       await setupAuthorsViewErrorUI(paperId);
    //       setupButtonEventListeners();
    //     }
    //   } catch (error) {
    //     console.error('Error loading author data:', error);
    //     updateStatus(`Error loading author data: ${error.message}`, true);
    //     await setupBasicErrorUI();
    //     setupButtonEventListeners();
    //   }
    //   return;
    // }

    // SCENARIO 4: Analysis view (both analysisID and paperID modes)
    // let effectiveAnalysisId = analysisId;
    // Get user settings and LLM settings
    const userSettings = await chrome.storage.local.get(['userSettings', 'llmSettings']);
    const requestedScholarUrl = userSettings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
    const researchInterests = userSettings.userSettings?.researchInterests || '';
    let effectivePaperId = paperId;
    let effectiveScholar = requestedScholarUrl;
    
    // For ANALYSIS_WITH_PAPER_ID mode, generate analysisId
    if (detectedViewMode === VIEW_MODES.ANALYSIS_WITH_PAPER_ID && effectivePaperId) {
      if (!effectiveScholar) {
        const res = await chrome.storage.local.get(['userSettings']);
        effectiveScholar = res.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      }
      effectiveAnalysisId = await generateAnalysisId(effectivePaperId, effectiveScholar);
      console.log('Generated analysisId from paperId + scholar:', effectiveAnalysisId);
    }
    
    console.log('✅ Loading analysis view with analysisId:', effectiveAnalysisId);
    updateStatus(`Loading analysis...`);
    
    try {
      // Try to fetch analysis from backend using analysisID directly
      const analysis = await fetchAnalysisByAnalysisId(effectiveAnalysisId);
      if (analysis && analysis.summary) {
        console.log('Successfully loaded analysis from backend');
        clearStatus();
        displayAnalysisResults(analysis);
        setupAnalysisViewUI(analysis);
        setupButtonEventListeners();
      } else {
        // Analysis not found - try to set PDF content from storage data instead
        console.log('🔍 Main analysis not found, trying to load from storage data...');
        
        if (effectivePaperId && await setPdfContentFromStorage(effectivePaperId)) {
          console.log('✅ Successfully loaded paper content from storage - enabling basic functionality');
          clearStatus();
          
          // Set up basic UI for storage-based paper
          if (analysisContent) analysisContent.style.display = 'block';
          if (paperInfo) paperInfo.style.display = 'block';
          if (summaryDiv) {
            summaryDiv.style.display = 'block';
            summaryDiv.innerHTML = `
              <div style="padding: 20px; text-align: center; background: #f8f9fa; border-radius: 5px; margin: 20px 0;">
                <h3>Paper Available</h3>
                <p>This paper has been processed and is available for chat. You can ask questions about the content below.</p>
                <p><strong>Title:</strong> ${currentPdfContent?.title || 'Unknown'}</p>
                <p><strong>Authors:</strong> ${currentPdfContent?.authors?.join(', ') || 'Unknown'}</p>
              </div>
            `;
          }
          
          setupButtonEventListeners();
        } else {
          const scholarInfo = requestedScholarUrl ? ` for scholar ${requestedScholarUrl}` : '';
          updateStatus(`No analysis found for this paper${scholarInfo}.`, true);
          await setupBasicErrorUI();
          setupButtonEventListeners();
        }
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
      
      // Try storage fallback on error too
      if (effectivePaperId && await setPdfContentFromStorage(effectivePaperId)) {
        console.log('✅ Recovered from error using storage data');
        clearStatus();
        updateStatus('Paper loaded from storage - chat functionality available');
        setupButtonEventListeners();
      } else {
        updateStatus(`Error loading analysis: ${error.message}`, true);
        await setupBasicErrorUI();
        setupButtonEventListeners();
      }
    }

  // Helper function to setup Authors view UI
  function setupAuthorsViewUI(authorData) {
    console.log('🔧 Setting up Authors view UI');
    const header = document.querySelector('.header');
    
    // Hide status and upload sections
    if (statusDiv) statusDiv.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'none';
    
    // Layout switching is now handled by CSS classes, but ensure elements are visible
    if (analysisContent) analysisContent.style.display = 'block';
    if (paperInfo) paperInfo.style.display = 'block';
    if (summaryDiv) summaryDiv.style.display = 'block';
    if (chatSection) chatSection.style.display = 'none'; // No chat in authors view
    if (header) header.style.display = 'flex';
    
    // Configure buttons for authors view
    if (backBtn) {
      backBtn.style.display = 'inline-block';
      backBtn.textContent = 'Back to Analysis';
    }
    if (clearBtn) {
      clearBtn.style.display = 'inline-block';
      clearBtn.textContent = 'Go to Homepage';
    }
    // viewAuthorsBtn removed from UI
    
    // Set paper title and meta if available
    if (authorData.content || authorData.paper_metadata) {
      const paperTitle = document.getElementById('paperTitle');
      const paperMeta = document.getElementById('paperMeta');
      
      const metadata = authorData.content || authorData.paper_metadata;
      
      if (paperTitle) {
        paperTitle.textContent = metadata.title || 'Author Analysis';
      }
      if (paperMeta) {
        const authors = (metadata.authors || []).join(', ');
        const analyzed = authorData.timestamp ? new Date(authorData.timestamp).toLocaleDateString() : '';
        const metaInfo = `Paper ID: ${metadata.paperId || metadata.paper_id || ''} | Authors: ${authors} | Analyzed: ${analyzed}`;
        paperMeta.textContent = metaInfo;
      }
    }
    
    console.log('✅ Authors view UI setup complete - using old layout for authors');
  }

  // Helper function to display analysis results
  function displayAnalysisResults(analysis) {
    let summary = '';
    
    // Handle both backend response format (flat) and stored format (nested)
    if (analysis) {
      if (analysis.data && typeof analysis.data === 'object' && analysis.data.summary) {
        // Nested format (from local storage)
        summary = analysis.data.summary;
        console.log('Using nested summary from analysis.data.summary');
      } else if (analysis.summary) {
        // Flat format (from backend) or fallback
        summary = analysis.summary;
        console.log('Using direct summary from analysis.summary');
      }
    }
    
    if (summary && typeof summary === 'string' && summary.trim()) {
      // Remove script tags for security, preserve markdown content
      summary = summary.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      const html = markdownToHtml(summary);
      
      if (html && summaryDiv) {
        summaryDiv.innerHTML = html;
        summaryDiv.style.display = 'block';
        console.log('Summary displayed successfully, length:', summary.length);
        }
      } else {
      console.log('No valid summary found to display');
    }
  }

  // Helper function to setup Analysis view UI
  function setupAnalysisViewUI(analysis) {
    const header = document.querySelector('.header');
    
    // Show analysis content structure
    if (analysisContent) analysisContent.style.display = 'block';
    if (paperInfo) paperInfo.style.display = 'block';
    if (header) header.style.display = 'flex';
    
    // Configure buttons for analysis view
    if (backBtn) backBtn.style.display = 'none'; // No back button for analysis view
    // analyzeBtn removed
    if (clearBtn) {
      clearBtn.style.display = 'inline-block';
      clearBtn.textContent = 'Go to Homepage';
    }
    
    // Enable chat section if we have content
    console.log('🔍 PDF Content Check: Analysis content available:', !!analysis.content);
    if (analysis.content) {
              const hasContent = analysis.content.paperContent || 
                                analysis.content.abstract || 
                                analysis.content.file_content ||
                        analysis.content.title;
              
              console.log('🔍 PDF Content Check: Content types found:', {
                paperContent: !!analysis.content.paperContent,
                abstract: !!analysis.content.abstract,
                file_content: !!analysis.content.file_content,
                title: !!analysis.content.title,
                hasContent: hasContent
              });
              
              if (hasContent) {
              currentPdfContent = analysis.content;
              console.log('🔍 PDF Content Check: currentPdfContent set successfully!');
        if (chatSection) {
          chatSection.style.display = 'block';
          console.log('🔍 PDF Content Check: Chat section enabled');
        }
      } else {
        console.log('🔍 PDF Content Check: No valid content found');
      }
    } else {
      console.log('🔍 PDF Content Check: No analysis.content available');
    }
    
    // Set paper information
            if (analysis.content) {
              if (paperTitle && analysis.content.title) {
                paperTitle.textContent = analysis.content.title;
              }
              if (paperMeta) {
                const authorsArray = analysis.content.authors || [];
                const authors = authorsArray.join(', ');
                const analyzed = analysis.timestamp ? new Date(analysis.timestamp).toLocaleDateString() : '';
                const modelInfo = analysis.model ? ` | Model: ${analysis.model}` : '';
                let metaInfo = `Paper ID: ${analysis.content.paperId || ''} | Authors: ${authors} | Analyzed: ${analyzed}${modelInfo}`;
                
                // Create a temporary element to set the content, then make authors clickable
                paperMeta.innerHTML = metaInfo;
                if (authorsArray.length > 0) {
                  // Update with clickable authors
                  const authorLinks = authorsArray.map(author => {
                    const authorId = author.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
                    return `<a href="#" 
                               style="color: #007bff; text-decoration: none;"
                               onmouseover="this.style.textDecoration='underline'"
                               onmouseout="this.style.textDecoration='none'"
                               onclick="event.preventDefault(); navigateToAuthorProfile('${authorId}', '${author}')">
                              ${author}
                            </a>`;
                  }).join(', ');
                  paperMeta.innerHTML = `Paper ID: ${analysis.content.paperId || ''} | Authors: ${authorLinks} | Analyzed: ${analyzed}${modelInfo}`;
                }
              }
            }
            
    // Show View Author Analysis button if author data is available
    // Handle both backend format (flat) and stored format (nested)
    const hasAuthorData = (analysis.data && analysis.data.author_data) || analysis.author_data;
    if (hasAuthorData && viewAuthorsBtn) {
      viewAuthorsBtn.style.display = 'inline-block';
      viewAuthorsBtn.style.backgroundColor = '#4CAF50';
      }
    }

  // Function to set up UI specifically for authors view error states
  async function setupAuthorsViewErrorUI(paperId) {
    console.log('🔧 Setting up authors view error UI for paperId:', paperId);
    const header = document.querySelector('.header');
    
    // Ensure header is visible
    if (header) header.style.display = 'flex';
    
    // Hide status and upload sections
    if (statusDiv) statusDiv.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'none';
    
    // Show the main content areas but with error message
    if (analysisContent) analysisContent.style.display = 'block';
    if (paperInfo) paperInfo.style.display = 'block';
    if (summaryDiv) {
      summaryDiv.style.display = 'block';
      summaryDiv.innerHTML = `
        <div style="text-align: center; padding: 40px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #ffc107;">
          <h3 style="color: #856404; margin-bottom: 16px;">📊 No Author Analysis Available</h3>
          <p style="color: #6c757d; margin-bottom: 24px;">
            This paper hasn't been analyzed for author information yet. 
            To view author details, you need to run an analysis first.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button onclick="window.location.href = '/?paperID=${paperId}'" 
                    style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
              🔍 Run Analysis
            </button>
            <button onclick="window.location.href = '/fullpage.html?paperID=${paperId}'" 
                    style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
              📄 View Paper Analysis
            </button>
          </div>
        </div>
      `;
    }
    if (chatSection) chatSection.style.display = 'none'; // No chat in authors view
    
    // Configure buttons for authors view error
    if (backBtn) {
      backBtn.style.display = 'inline-block';
      backBtn.textContent = 'Back to Analysis';
      backBtn.onclick = () => {
        window.location.href = `/fullpage.html?paperID=${paperId}`;
      };
    }
    if (clearBtn) {
      clearBtn.style.display = 'inline-block';
      clearBtn.textContent = 'Go to Homepage';
    }
    if (viewAuthorsBtn) viewAuthorsBtn.style.display = 'none'; // Hide since we're already trying authors view
    
    console.log('✅ Authors view error UI setup complete');
  }

  // Function to set up basic UI for error states
  async function setupBasicErrorUI() {
    console.log('🔧 Setting up basic error UI');
    const header = document.querySelector('.header');
    
    // Check if we have an analysisID
    const analysisId = await getCurrentAnalysisId();
    
    console.log('🔍 DEBUG: Elements found in setupBasicErrorUI:', {
      header: !!header,
      clearBtn: !!clearBtn,
      viewAuthorsBtn: !!viewAuthorsBtn,
      backBtn: !!backBtn,
      analysisID: analysisId
    });
    
    // Ensure header is visible
    if (header) header.style.display = 'flex';
    
    // Show and configure "Go to Homepage" button
    if (clearBtn) {
      clearBtn.style.display = 'inline-block';
      clearBtn.textContent = 'Go to Homepage';
    }
    
    // Only show "View Author Analysis" button if we have an analysisID
    if (viewAuthorsBtn) {
      if (analysisId) {
        viewAuthorsBtn.style.display = 'inline-block';
      } else {
        viewAuthorsBtn.style.display = 'none';
        console.log('🔍 Hiding View Author Analysis button - no analysisID found');
      }
    }
    
    // Hide back button for error states
    if (backBtn) {
      backBtn.style.display = 'none';
    }
    
    console.log('🔍 DEBUG: Button states after setupBasicErrorUI:', {
      clearBtnDisplay: clearBtn ? clearBtn.style.display : 'not found',
      clearBtnVisible: clearBtn ? (clearBtn.offsetWidth > 0 && clearBtn.offsetHeight > 0) : false,
      viewAuthorsBtnDisplay: viewAuthorsBtn ? viewAuthorsBtn.style.display : 'not found',
      viewAuthorsBtnVisible: viewAuthorsBtn ? (viewAuthorsBtn.offsetWidth > 0 && viewAuthorsBtn.offsetHeight > 0) : false,
      headerDisplay: header ? header.style.display : 'not found'
    });
  }

  // Function to set up all event listeners after view setup is complete
  function setupButtonEventListeners() {
    console.log('🔧 Setting up button event listeners for view mode:', viewMode);
    console.log('🔧 DOM Ready State:', document.readyState);

    // Also setup new layout buttons
    setupNewLayoutButtons();
    
    console.log('🔍 Button elements found:', {
      viewAuthorsBtn: !!viewAuthorsBtn,
      backBtn: !!backBtn,
      clearBtn: !!clearBtn,
      sendBtn: !!sendBtn,
      chatInput: !!chatInput
    });

    // Debug: Check button visibility and display
    if (backBtn) {
      console.log('📍 Back button display:', backBtn.style.display, 'visible:', backBtn.offsetWidth > 0 && backBtn.offsetHeight > 0);
    }
    if (clearBtn) {
      console.log('📍 Clear button display:', clearBtn.style.display, 'visible:', clearBtn.offsetWidth > 0 && clearBtn.offsetHeight > 0);
    }

    // View Authors button removed from UI - no longer needed
    console.log('ℹ️  View Authors button has been removed from the interface');

    if (backBtn && !backBtn.hasAttribute('data-listener-attached')) {
      console.log('Setting up back button event listener');
      backBtn.setAttribute('data-listener-attached', 'true');
      backBtn.addEventListener('click', async function() {
        console.log('Back button clicked! Current view mode:', viewMode);
        const paperId = getCurrentPaperId();
        
        // Back button is only shown in authors view, so always go back to analysis view
        if (viewMode === VIEW_MODES.AUTHORS && paperId) {
          console.log('Navigating back to analysis view with paperId:', paperId);
          const mainUrl = buildPaperIdUrl(paperId);
          window.location.href = mainUrl;
        } else {
          console.warn('Back button clicked outside of authors view');
          window.location.href = buildHomepageUrl();
        }
      });
    }

    if (clearBtn && !clearBtn.hasAttribute('data-listener-attached')) {
      console.log('✅ Setting up clear/homepage button event listener');
      clearBtn.setAttribute('data-listener-attached', 'true');
      clearBtn.addEventListener('click', async function(event) {
        console.log('🎯 Clear/Homepage button clicked! Event:', event);
        console.log('🎯 Button element:', clearBtn);
        console.log('🎯 Current URL:', window.location.href);
        
        try {
          // "Go to Homepage" - redirect to clean fullpage without any parameters
          const newUrl = buildHomepageUrl();
          console.log('🎯 Redirecting to clean homepage:', newUrl);
          
          // Force a clean page load (not just navigation)
          window.location.replace(newUrl);
        } catch (error) {
          console.error('❌ Error during navigation:', error);
          // Fallback: try window.location.href
          try {
            window.location.href = buildHomepageUrl();
          } catch (fallbackError) {
            console.error('❌ Fallback navigation also failed:', fallbackError);
            alert('Error navigating to homepage. Please refresh the page.');
          }
        }
      });
      console.log('✅ Clear button listener attached successfully');
    } else if (clearBtn && clearBtn.hasAttribute('data-listener-attached')) {
      console.log('⚠️  Clear button already has listener attached');
    } else {
      console.log('❌ Clear button not found');
    }

    // Onboarding button
    const onboardingBtn = document.getElementById('onboardingBtn');
    if (onboardingBtn && !onboardingBtn.hasAttribute('data-listener-attached')) {
      console.log('✅ Setting up onboarding button event listener');
      onboardingBtn.setAttribute('data-listener-attached', 'true');
      onboardingBtn.addEventListener('click', function() {
        console.log('📋 Onboarding button clicked!');
        chrome.tabs.create({
          url: chrome.runtime.getURL('onboarding.html')
        });
      });
      console.log('✅ Onboarding button listener attached successfully');
    } else if (onboardingBtn && onboardingBtn.hasAttribute('data-listener-attached')) {
      console.log('⚠️  Onboarding button already has listener attached');
    } else {
      console.log('❌ Onboarding button not found');
    }

    // Chat functionality event listeners
    console.log('🔍 Chat Setup: Checking chat elements...', {
      sendBtn: !!sendBtn,
      chatInput: !!chatInput,
      sendBtnId: sendBtn?.id,
      chatInputId: chatInput?.id
    });
    
    if (sendBtn && chatInput) {
      console.log('🔍 Chat Setup: Setting up chat event listeners...');
      sendBtn.addEventListener('click', async function() {
        console.log('🔍 Chat Setup: Send button clicked!');
        const message = chatInput.value.trim();
        console.log('🔍 Chat Setup: Message to send:', message);
        if (message) {
          chatInput.value = '';
          await handleChat(message);
        } else {
          console.log('🔍 Chat Setup: No message to send (empty)');
        }
      });
      
      chatInput.addEventListener('keypress', async function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          console.log('🔍 Chat Setup: Enter key pressed!');
          event.preventDefault();
          const message = chatInput.value.trim();
          console.log('🔍 Chat Setup: Message from Enter key:', message);
          if (message) {
            chatInput.value = '';
            await handleChat(message);
          } else {
            console.log('🔍 Chat Setup: No message to send via Enter (empty)');
          }
        }
      });
      console.log('🔍 Chat Setup: Chat event listeners attached successfully!');
    } else {
      console.warn('🔍 Chat Setup: sendBtn or chatInput not found - chat functionality disabled');
    }
  }

  // Global debug function to test buttons from console
  window.testButtons = function() {
    console.log('🧪 Testing button functionality...');
    console.log('Current view mode:', viewMode);
    
    const backBtn = document.getElementById('backBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    if (backBtn && backBtn.style.display !== 'none') {
      console.log('🔙 Back button is visible, testing click...');
      backBtn.click();
    } else {
      console.log('🔙 Back button is hidden or not found');
    }
    
    setTimeout(() => {
      if (clearBtn && clearBtn.style.display !== 'none') {
        console.log('🏠 Clear/Homepage button is visible, testing click...');
        clearBtn.click();
      } else {
        console.log('🏠 Clear/Homepage button is hidden or not found');
      }
    }, 1000);
  };

  // Global debug function to test junior researcher buttons
  window.testJuniorResearcherButtons = function() {
    console.log('🧪 Testing junior researcher button functionality...');
    
    const saveBtn = document.getElementById('saveResearcherSelection');
    const resetBtn = document.getElementById('resetResearcherSelection');
    
    console.log('🔍 Junior researcher button elements:', {
      saveBtn: !!saveBtn,
      resetBtn: !!resetBtn,
      saveBtnVisible: saveBtn ? (saveBtn.offsetWidth > 0 && saveBtn.offsetHeight > 0) : false,
      resetBtnVisible: resetBtn ? (resetBtn.offsetWidth > 0 && resetBtn.offsetHeight > 0) : false,
      saveBtnText: saveBtn ? saveBtn.textContent : 'not found',
      resetBtnText: resetBtn ? resetBtn.textContent : 'not found'
    });
    
    if (saveBtn) {
      console.log('🎯 Testing save button click...');
      saveBtn.click();
    }
    
    setTimeout(() => {
      if (resetBtn) {
        console.log('🎯 Testing reset button click...');
        resetBtn.click();
      }
    }, 2000);
  };


  
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
        settings.lastUpdated = new Date().toISOString();
        
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
  
  // Add function to fetch author data using the new author endpoints
  async function fetchAuthorDataFromBackend(paperId, requestedScholarUrl = null) {
    try {
      // Use smart backend detection to get the correct backend URL
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching author data');
        return null;
      }
      
      // Build URL with scholar parameter if specified
      let url = `${backend.url}${CONFIG.AUTHOR_DATA_ENDPOINT}/${encodeURIComponent(paperId)}`;
      // if (requestedScholarUrl) {
      //   url += `?scholar=${encodeURIComponent(requestedScholarUrl)}`;
      // }
      console.log('Trying to fetch author data from backend:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log('Backend returned non-OK for author data:', response.status, response.statusText);
        
        if (response.status === 404) {
          console.log('Author data not found on backend for paper:', paperId);
          return null;
        } else if (response.status >= 500) {
          throw new Error(`Backend server error: ${response.status} - ${response.statusText}`);
        } else {
          throw new Error(`Backend error: ${response.status} - ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      console.log('Received author data from backend:', data);
      
      if (data && data.author_data) {
        // Store in local storage for future use
        const storageKey = `analysis_${paperId}`;
        
        const authorDataResult = {
          timestamp: new Date().toISOString(),
          paperId: paperId,
          content: data.paper_metadata || {
            title: 'Unknown Title',
            paperContent: '',
            paperUrl: '',
            paperId: paperId,
            abstract: '',
            authors: []
          },
          data: {
            author_data: data.author_data
          },
          autoAnalyzed: true
        };
        
        console.log('Storing author data result:', authorDataResult);
        const storageData = {};
        storageData[storageKey] = authorDataResult;
        await chrome.storage.local.set(storageData);
        return authorDataResult;
      }
      return null;
    } catch (err) {
      console.error('Error fetching author data from backend:', err);
      return null;
    }
  }

  // Add function to get all author data configurations for a paper
  async function getAllAuthorDataConfigurations(paperId) {
    try {
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching author configurations');
        return [];
      }
      
      const url = `${backend.url}${CONFIG.ALL_AUTHOR_DATA_ENDPOINT}/${encodeURIComponent(paperId)}`;
      console.log('Trying to fetch all author configurations for paper:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log('Backend returned non-OK for author configurations:', response.status, response.statusText);
        return [];
      }
      
      const data = await response.json();
      console.log('Received author configurations from backend:', data);
      
      return data.configurations || [];
    } catch (err) {
      console.error('Error fetching author configurations:', err);
      return [];
    }
  }

  // Function to generate analysis_id consistently with backend
  async function generateAnalysisId(paperId, userScholarUrl) {
    const combined = `${paperId}_${userScholarUrl}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 32);
  }

  function getScholarUrlFromSettingsSync() {
    const stored = window.localScholarUrlCache;
    if (stored) return stored;
    return 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
  }

  // Function to fetch analysis from backend by analysisID directly
  async function fetchAnalysisByAnalysisId(analysisId) {
    try {
      // Use smart backend detection to get the correct backend URL
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        console.log('No backend available for fetching analysis');
        return null;
      }
      
      const url = `${backend.url}/analysis/${encodeURIComponent(analysisId)}`;
      console.log('Fetching analysis by analysisId:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.log('Backend returned non-OK for analysis:', response.status, response.statusText);
        
        if (response.status === 404) {
          console.log('Analysis not found on backend for analysisId:', analysisId);
          return null;
        } else if (response.status >= 500) {
          throw new Error(`Backend server error: ${response.status} - ${response.statusText}`);
        } else {
          throw new Error(`Backend error: ${response.status} - ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      console.log('Successfully fetched analysis by analysisId:', data);
      
      if (data) {
        // Store in local storage for future use using paper_id as key for compatibility
        if (data.paper_id) {
          const storageKey = `analysis_${data.paper_id}`;
          const analysisResult = {
            timestamp: new Date().toISOString(),
            paperId: data.paper_id,
            analysisId: data.analysis_id || analysisId,
            model: data.ai_model || data.model || 'unknown',
            content: data.content || {
              paperUrl: `https://papers.ssrn.com/sol3/papers.cfm?abstract_id=${data.paper_id}`,
              paperId: data.paper_id,
              title: data.title || 'Paper Analysis',
              abstract: data.abstract || 'Analysis loaded from backend',
              paperContent: data.content || 'Content processed by backend'
            },
            summary: data.summary,
            data: data,
            autoAnalyzed: false
          };
          
          const storageData = {};
          storageData[storageKey] = analysisResult;
          await chrome.storage.local.set(storageData);
          console.log('Stored analysis result with analysisId in local storage');
        }
        
        return data;
      }
      
      return null;
      
    } catch (error) {
      console.error('Error fetching analysis by analysisId:', error);
      throw error;
    }
  }

  // Function to fetch author data directly by paperID
  async function fetchAuthorDataByPaperId(paperId) {
    try {
      console.log('Fetching author data for paperId:', paperId);
      
      // Get backend
      const backend = await BackendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // Try to fetch directly from author data endpoint by paper ID
      const authorUrl = `${backend.url}/authors/${encodeURIComponent(paperId)}`;
      console.log('Fetching from author endpoint:', authorUrl);
      
      const response = await fetch(authorUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Successfully fetched author data by paperId:', data);
        return data;
      } else {
        console.log('No author data found by paperId:', response.status);
        return null;
      }
    } catch (error) {
      console.error('Error fetching author data by paperId:', error);
      return null; // Don't throw, let fallback methods try
    }
  }

  // Function to fetch author data by analysisId (gets author data from the analysis itself)
  async function fetchAuthorDataByAnalysisId(analysisId) {
    try {
      // First try to get the full analysis which includes author data
      const analysis = await fetchAnalysisByAnalysisId(analysisId);
      
      if (analysis && analysis.author_data) {
        // Return in the same format as the old fetchAuthorDataFromBackend
        return {
          paper_id: analysis.paper_id,
          data: {
            author_data: analysis.author_data
          },
          paper_metadata: {
            title: analysis.content?.title || analysis.title || '',
            paperUrl: analysis.content?.paperUrl || '',
            paperId: analysis.paper_id,
            abstract: analysis.content?.abstract || analysis.abstract || '',
            authors: analysis.content?.authors || [],
            affiliations: analysis.content?.affiliations || []
          }
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching author data by analysisId:', error);
      throw error;
    }
  }


  // Helper function to get current paper ID from URL
  function getCurrentPaperId() {
    const urlParams = getUrlParams();
    return urlParams.get('paperID');
  }

  // Helper function to get current scholar URL from URL params or settings
  async function getCurrentScholarUrl() {
    const urlParams = getUrlParams();
    const requestedScholar = urlParams.get('scholar');
    
    if (requestedScholar) {
      return requestedScholar;
    }
    
    // Fallback to user settings
    const res = await chrome.storage.local.get(['userSettings']);
    return res.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
  }

  // Build paperID-based URLs (no longer includes deprecated scholar parameter)
  function buildPaperIdUrl(paperId, additionalParams = {}) {
    const baseUrl = chrome.runtime.getURL('fullpage.html');
    const params = new URLSearchParams();
    
    if (paperId) {
      params.set('paperID', paperId);
    }
    
    // Add any additional parameters (scholar parameter is deprecated)
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.set(key, value);
      }
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  // Legacy function - kept for backward compatibility with analysisID
  async function getCurrentAnalysisId() {
    const urlParams = getUrlParams();
    const analysisId = urlParams.get('analysisID');
    
    if (analysisId) {
      return analysisId;
    }
    
    // Fallback: generate from paperId + scholar (for legacy URLs)
    const paperId = urlParams.get('paperID');
    const requestedScholar = urlParams.get('scholar');
    
    if (paperId) {
      let effectiveScholar = requestedScholar;
      if (!effectiveScholar) {
        const res = await chrome.storage.local.get(['userSettings']);
        effectiveScholar = res.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      }
      return await generateAnalysisId(paperId, effectiveScholar);
    }
    
    return null;
  }

  // Setup generate profile button
  const generateProfileBtn = document.getElementById('generateProfileBtn');
  if (generateProfileBtn) {
    generateProfileBtn.addEventListener('click', generateResearchProfile);
  }
  
  // Setup upload functionality
  setupHomepageUpload();

  // === NEW TWO-PANEL LAYOUT FUNCTIONALITY ===
  
  // Initialize new layout functionality
  async function initializeNewLayout() {
    console.log('🆕 Initializing new two-panel layout');
    
    // Setup junior researchers grid
    console.log('🔧 Setting up junior researchers grid...');
    await setupJuniorResearchersGrid();
    
    // Setup chat functionality
    console.log('🔧 Setting up chat functionality...');
    setupNewChatFunctionality();
    
    // Setup header buttons for new layout
    console.log('🔧 Setting up header buttons...');
    setupNewLayoutButtons();
    
    // Load paper metadata and analysis content
    console.log('🔧 Loading paper metadata and content...');
    await loadPaperMetadataAndContent();
  }
  
  // Setup header buttons for new layout
  function setupNewLayoutButtons() {
    console.log('🔧 setupNewLayoutButtons called');
    const clearBtn2 = document.getElementById('clearBtn2');
    const backBtn2 = document.getElementById('backBtn2');
    
    console.log('🔍 New layout button elements found:', {
      clearBtn2: !!clearBtn2,
      viewAuthorsBtn2: false, // Button removed from UI
      backBtn2: !!backBtn2
    });
    
    if (clearBtn2 && !clearBtn2.hasAttribute('data-listener-attached')) {
      console.log('✅ Setting up clearBtn2 event listener');
      clearBtn2.setAttribute('data-listener-attached', 'true');
      clearBtn2.addEventListener('click', () => {
        console.log('🎯 clearBtn2 clicked! Navigating to homepage');
        window.location.href = getHomepageUrl();
      });
    }

    // Onboarding button for new layout
    const onboardingBtn2 = document.getElementById('onboardingBtn2');
    if (onboardingBtn2 && !onboardingBtn2.hasAttribute('data-listener-attached')) {
      console.log('✅ Setting up onboardingBtn2 event listener');
      onboardingBtn2.setAttribute('data-listener-attached', 'true');
      onboardingBtn2.addEventListener('click', () => {
        console.log('📋 onboardingBtn2 clicked!');
        chrome.tabs.create({
          url: chrome.runtime.getURL('onboarding.html')
        });
      });
    }
    
    // viewAuthorsBtn2 functionality removed - button no longer exists in UI
    
    if (backBtn2 && !backBtn2.hasAttribute('data-listener-attached')) {
      console.log('✅ Setting up backBtn2 event listener');
      backBtn2.setAttribute('data-listener-attached', 'true');
      backBtn2.addEventListener('click', async () => {
        console.log('🎯 backBtn2 clicked!');
        const paperId = getCurrentPaperId();
        if (paperId) {
          const mainUrl = buildPaperIdUrl(paperId);
          console.log('🎯 Navigating to analysis view:', mainUrl);
          window.location.href = mainUrl;
        } else {
          console.log('🎯 No paper ID, navigating to homepage');
          window.location.href = getHomepageUrl();
        }
      });
    }
  }
  
  // Setup junior researchers selection grid
  async function setupJuniorResearchersGrid() {
    console.log('🔧 setupJuniorResearchersGrid called');
    const grid = document.getElementById('newResearchersGrid');
    
    if (!grid) {
      console.error('❌ newResearchersGrid element not found!');
      return;
    }
    
    console.log('✅ Grid element found:', grid);
    grid.innerHTML = '';
    
    // Get saved junior researchers settings
    const savedSettings = await getCurrentJuniorResearchersSelection();
    console.log('🔧 Using saved junior researchers settings:', savedSettings);
    
    // Get paper ID to check for existing analyses
    const urlParams = getUrlParams();
    const paperId = urlParams.get('paperID');
    let existingAnalyses = new Set();
    
    if (paperId) {
      try {
        // Check what analyses exist for this paper
        const backend = await backendManager.getCurrentBackend();
        if (backend) {
          const userSettings = await chrome.storage.local.get(['userSettings']);
          const scholarUrl = userSettings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
          const researchInterests = userSettings.userSettings?.researchInterests || '';
          
          // Get current LLM settings
          const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
          
          // Check each researcher type for existing analysis
          for (const researcher of juniorResearchers) {
            try {
              const response = await fetch(`${backend.url}/junior-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  paper_id: paperId,
                  user_scholar_url: scholarUrl,
                  researcher_type: researcher.id,
                  model: getModelName(llmSettings.model),
                  research_interests: researchInterests
                })
              });
              
              if (response.ok) {
                existingAnalyses.add(researcher.id);
              }
            } catch (error) {
              console.log(`No existing analysis for ${researcher.id}`);
            }
          }
        }
      } catch (error) {
        console.log('Error checking existing analyses:', error);
      }
    }
    
    console.log('📊 Existing analyses found:', Array.from(existingAnalyses));
    
    juniorResearchers.forEach((researcher, index) => {
      const chip = document.createElement('label');
      chip.className = 'researcher-chip';
      
      // Use saved settings to determine if researcher should be checked
      // Only check if it's enabled in saved settings
      const isChecked = savedSettings[researcher.id] === true;
      
      // Check if analysis exists for this researcher
      const hasExistingAnalysis = existingAnalyses.has(researcher.id);
      
      chip.innerHTML = `
        <input type="checkbox" id="new_${researcher.id}" value="${researcher.id}" ${isChecked ? 'checked' : ''}>
        <span class="researcher-name-compact">${researcher.name}</span>
        ${hasExistingAnalysis ? `<button class="refresh-btn" id="refresh_${researcher.id}" title="Refresh this analysis">🔄</button>` : ''}
      `;
      
      console.log(`🔬 Creating chip for ${researcher.name} (${researcher.id}): ${isChecked ? 'checked' : 'unchecked'} (saved: ${savedSettings[researcher.id]}) (existing: ${hasExistingAnalysis})`);
      
      // Debug: log the actual HTML that was created
      console.log(`🔬 CHIP HTML for ${researcher.id}:`, chip.innerHTML);
      
      // Add click handler for checkbox
      const checkbox = chip.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          chip.classList.add('selected');
        } else {
          chip.classList.remove('selected');
        }
        updateSelectedCount();
        updateAnalysisContent();
      });
      
      // Add click handler for refresh button if it exists
      if (hasExistingAnalysis) {
        const refreshBtn = chip.querySelector('.refresh-btn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            console.log(`🔄 REFRESH CLICK - Button clicked for ${researcher.id}`);
            window.refreshAnalysis(researcher.id, event);
          });
          console.log(`✅ REFRESH SETUP - Event listener added for ${researcher.id}`);
        } else {
          console.error(`❌ REFRESH ERROR - Refresh button not found for ${researcher.id}`);
        }
      }
      
      // Initialize visual state
      if (isChecked) {
        chip.classList.add('selected');
      }
      
      grid.appendChild(chip);
    });
    
    console.log(`✅ Added ${juniorResearchers.length} researcher chips to grid`);
    updateSelectedCount();
  }
  
  // Global function to refresh individual analysis
  window.refreshAnalysis = async function(researcherType, event) {
    // Prevent checkbox from toggling when refresh button is clicked
    event.stopPropagation();
    event.preventDefault();
    
    console.log(`🔄 REFRESH START - Refreshing analysis for ${researcherType}`);
    
    const refreshBtn = document.getElementById(`refresh_${researcherType}`);
    if (!refreshBtn) {
      console.error(`❌ REFRESH ERROR - Button not found: refresh_${researcherType}`);
      return;
    }
    
    const originalText = refreshBtn.innerHTML;
    console.log(`🔄 REFRESH DEBUG - Original button text: ${originalText}`);
    
    try {
      // Show loading state
      refreshBtn.innerHTML = '⏳';
      refreshBtn.disabled = true;
      console.log(`🔄 REFRESH DEBUG - Button state set to loading`);
      
      // Get current parameters
      const urlParams = getUrlParams();
      const paperId = urlParams.get('paperID');
      console.log(`🔄 REFRESH DEBUG - Paper ID from URL: ${paperId}`);
      
      if (!paperId) {
        throw new Error('No paper ID found');
      }
      
      // Get user settings and LLM settings
      const userSettings = await chrome.storage.local.get(['userSettings', 'llmSettings']);
      const scholarUrl = userSettings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const researchInterests = userSettings.userSettings?.researchInterests || '';
      const llmSettings = userSettings.llmSettings || { model: 'gemini-2.5-flash' };
      
      console.log(`🔄 REFRESH DEBUG - User settings loaded:`, {
        scholarUrl: scholarUrl.substring(0, 50) + '...',
        researchInterests: researchInterests.substring(0, 50) + '...',
        model: llmSettings.model,
        hasGeminiKey: !!llmSettings.geminiKey,
        hasOpenAIKey: !!llmSettings.openaiKey,
        hasClaudeKey: !!llmSettings.claudeKey
      });
      
      // Get backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      console.log(`🔄 REFRESH DEBUG - Backend selected: ${backend.name} at ${backend.url}`);
      
      // Prepare request body with API keys
      const requestBody = {
        paper_id: paperId,
        user_scholar_url: scholarUrl,
        researcher_type: researcherType,
        model: llmSettings.model || 'gemini-2.5-flash',
        research_interests: researchInterests
      };
      
      // Add API keys if available
      if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
        requestBody.google_api_key = llmSettings.geminiKey;
        console.log(`🔄 REFRESH DEBUG - Added Gemini API key`);
      }
      if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
        requestBody.openai_api_key = llmSettings.openaiKey;
        console.log(`🔄 REFRESH DEBUG - Added OpenAI API key`);
      }
      if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
        requestBody.claude_api_key = llmSettings.claudeKey;
        console.log(`🔄 REFRESH DEBUG - Added Claude API key`);
      }
      
      console.log(`🔄 REFRESH DEBUG - Request body prepared:`, {
        ...requestBody,
        google_api_key: requestBody.google_api_key ? 'PRESENT' : 'MISSING',
        openai_api_key: requestBody.openai_api_key ? 'PRESENT' : 'MISSING',
        claude_api_key: requestBody.claude_api_key ? 'PRESENT' : 'MISSING'
      });
      
      const refreshUrl = `${backend.url}/junior-analysis-refresh`;
      console.log(`🔄 REFRESH DEBUG - Making request to: ${refreshUrl}`);
      
      // Call the refresh endpoint
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`🔄 REFRESH DEBUG - Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🔄 REFRESH ERROR - Response not OK: ${response.status} - ${errorText}`);
        throw new Error(`Failed to refresh analysis: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log(`✅ REFRESH SUCCESS - Successfully refreshed ${researcherType} analysis:`, result);
      
      // Update the display if this researcher is currently selected
      const checkbox = document.getElementById(`new_${researcherType}`);
      if (checkbox && checkbox.checked) {
        console.log(`🔄 REFRESH DEBUG - Updating display for refreshed ${researcherType}`);
        await updateAnalysisContent();
        console.log(`🔄 REFRESH DEBUG - Display updated`);
      } else {
        console.log(`🔄 REFRESH DEBUG - Not updating display (checkbox not checked or not found)`);
      }
      
      // Show success feedback
      refreshBtn.innerHTML = '✅';
      console.log(`🔄 REFRESH DEBUG - Success feedback shown`);
      setTimeout(() => {
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
        console.log(`🔄 REFRESH DEBUG - Button reset to original state`);
      }, 2000);
      
    } catch (error) {
      console.error(`❌ REFRESH ERROR - Error refreshing ${researcherType}:`, error);
      console.error(`❌ REFRESH ERROR - Full error details:`, {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Show error feedback
      refreshBtn.innerHTML = '❌';
      setTimeout(() => {
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
        console.log(`🔄 REFRESH DEBUG - Button reset after error`);
      }, 3000);
      
      // You could also show a toast notification here
      alert(`Failed to refresh ${researcherType} analysis: ${error.message}`);
    }
  };
  
  // Update selected count display
  function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('#newResearchersGrid input:checked').length;
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
      countElement.textContent = `${selectedCount} selected`;
    }
    
    // Dynamically adjust content area height based on selection
    const contentArea = document.getElementById('newAnalysisContent');
    if (contentArea) {
      // Set minimum height based on number of selected researchers
      const minHeight = Math.max(400, selectedCount * 200); // 200px per researcher minimum
      contentArea.parentElement.style.minHeight = `${minHeight}px`;
    }
  }
  
  // Get selected researchers
  function getSelectedResearchers() {
    const selectedInputs = document.querySelectorAll('#newResearchersGrid input:checked');
    return Array.from(selectedInputs).map(input => input.value);
  }
  
  // Update analysis content based on selection
  async function updateAnalysisContent() {
    const selectedResearchers = getSelectedResearchers();
    const contentArea = document.getElementById('newAnalysisContent');
    
    if (!contentArea) return;
    
    if (selectedResearchers.length === 0) {
      contentArea.innerHTML = `
        <div class="loading-content">
          <div style="color: #6c757d; font-style: italic;">
            Select researchers above to view analysis sections
          </div>
        </div>
      `;
      return;
    }
    
    // Show loading state
    contentArea.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        Loading analysis for selected researchers...
      </div>
    `;
    
    try {
      // Get paper ID from URL
      const urlParams = getUrlParams();
      const paperId = urlParams.get('paperID');
      
      if (!paperId) {
        throw new Error('No paper ID found');
      }
      
      // Get user scholar URL and research interests
      const userSettings = await chrome.storage.local.get(['userSettings']);
      const scholarUrl = userSettings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
      const researchInterests = userSettings.userSettings?.researchInterests || '';
      
      // Get current LLM settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      // Get backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // First, check which analyses exist and which need to be generated
      const analysisStatusPromises = selectedResearchers.map(async (researcherType) => {
        try {
          const response = await fetch(`${backend.url}/junior-analysis`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              paper_id: paperId,
              user_scholar_url: scholarUrl,
              researcher_type: researcherType,
              model: getModelName(llmSettings.model),
              research_interests: researchInterests
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            return {
              type: researcherType,
              content: data.content,
              researcher: juniorResearchers.find(r => r.id === researcherType),
              status: 'exists'
            };
          } else {
            // Analysis doesn't exist, needs to be generated
            return {
              type: researcherType,
              researcher: juniorResearchers.find(r => r.id === researcherType),
              status: 'needs_generation'
            };
          }
        } catch (error) {
          console.error(`Error checking ${researcherType} analysis:`, error);
          return {
            type: researcherType,
            researcher: juniorResearchers.find(r => r.id === researcherType),
            status: 'error'
          };
        }
      });
      
      const analysisStatuses = await Promise.all(analysisStatusPromises);
      const existingAnalyses = analysisStatuses.filter(a => a.status === 'exists');
      const needsGeneration = analysisStatuses.filter(a => a.status === 'needs_generation');
      
      console.log(`📊 Analysis status: ${existingAnalyses.length} exist, ${needsGeneration.length} need generation`);
      
      // If we have some existing analyses, show them first
      if (existingAnalyses.length > 0) {
        renderAnalysisContent(existingAnalyses);
      }
      
      // If some analyses need to be generated, show loading state and trigger generation
      if (needsGeneration.length > 0) {
        // Add loading indicators for analyses being generated
        addLoadingIndicators(needsGeneration);
        
        // Trigger generation for missing analyses
        const generationPromises = needsGeneration.map(async (analysisInfo) => {
          return await generateNewAnalysis(paperId, scholarUrl, analysisInfo.type, analysisInfo.researcher);
        });
        
        // Wait for all generations to complete and update display
        const generatedResults = await Promise.all(generationPromises);
        const validGenerated = generatedResults.filter(r => r !== null);
        
        // Update the display with generated content
        if (validGenerated.length > 0) {
          const allResults = [...existingAnalyses, ...validGenerated];
          renderAnalysisContent(allResults);
        }
      }
      

      
    } catch (error) {
      console.error('Error updating analysis content:', error);
      contentArea.innerHTML = `
        <div class="loading-content">
          <div style="color: #dc3545; font-style: italic;">
            Error loading analysis content: ${error.message}
          </div>
        </div>
      `;
    }
  }
  
  // Helper function to render analysis content
  function renderAnalysisContent(results) {
    const contentArea = document.getElementById('newAnalysisContent');
    if (!contentArea) return;
    
    if (results.length === 0) {
      contentArea.innerHTML = `
        <div class="loading-content">
          <div style="color: #6c757d; font-style: italic;">
            Select researchers above to view analysis sections
          </div>
        </div>
      `;
      return;
    }
    
    let contentHtml = '';
    results.forEach((result, index) => {
      contentHtml += `
        <div class="analysis-section" id="section-${result.type}">
          <h3 style="color: #2c3e50; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600;">
            <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 500; min-width: max-content;">
              ${result.researcher.name}
            </span>
            <span style="font-size: 14px; color: #6c757d; font-weight: 400;">${result.researcher.description}</span>
          </h3>
          <div class="section-content markdown-content">
            ${marked.parse(result.content)}
          </div>
        </div>
      `;
    });
    
    // Add some breathing room at the bottom
    contentHtml += '<div style="height: 40px;"></div>';
    contentArea.innerHTML = contentHtml;
  }
  
  // Helper function to add loading indicators for analyses being generated
  function addLoadingIndicators(needsGeneration) {
    const contentArea = document.getElementById('newAnalysisContent');
    if (!contentArea) return;
    
    // Get existing content or create new
    let existingContent = contentArea.innerHTML;
    if (existingContent.includes('Select researchers above')) {
      existingContent = '';
    }
    
    let loadingHtml = existingContent;
    
    needsGeneration.forEach(analysisInfo => {
      loadingHtml += `
        <div class="analysis-section" id="section-${analysisInfo.type}">
          <h3 style="color: #2c3e50; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 600;">
            <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 500; min-width: max-content;">
              ${analysisInfo.researcher.name}
            </span>
            <span style="font-size: 14px; color: #6c757d; font-weight: 400;">${analysisInfo.researcher.description}</span>
          </h3>
          <div class="section-content">
            <div class="loading-content" style="padding: 20px; text-align: center;">
              <div class="loading-spinner"></div>
              <div style="margin-top: 10px; color: #667eea; font-weight: 500;">
                Generating ${analysisInfo.researcher.name.toLowerCase()} analysis...
              </div>
              <div style="margin-top: 5px; color: #6c757d; font-size: 13px;">
                This may take a few moments
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    contentArea.innerHTML = loadingHtml;
  }
  
  // Helper function to generate new analysis
  async function generateNewAnalysis(paperId, scholarUrl, researcherType, researcher) {
    try {
      console.log(`🔄 Generating new analysis for ${researcherType}...`);
      
      // Get user settings for analysis generation
      const userSettings = await chrome.storage.local.get(['userSettings', 'llmSettings']);
      const researchInterests = userSettings.userSettings?.researchInterests || '';
      const llmSettings = userSettings.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      // Get backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // Get paper data for analysis
      const paperResponse = await fetch(`${backend.url}/storage/paper/${encodeURIComponent(paperId)}`);
      if (!paperResponse.ok) {
        throw new Error('Failed to get paper data');
      }
      
      const paperStorageData = await paperResponse.json();
      
      // Prepare analysis request
      const analysisRequest = {
        paper_id: paperId,
        user_scholar_url: scholarUrl,
        research_interests: researchInterests,
        model: llmSettings.model || 'gemini-2.5-flash',
        researcher_type: researcherType,
        paper_title: paperStorageData.title,
        paper_abstract: paperStorageData.metadata?.abstract || '',
        paper_authors: paperStorageData.metadata?.authors || []
      };
      
      // Add API keys if available
      if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
        analysisRequest.google_api_key = llmSettings.geminiKey;
      }
      if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
        analysisRequest.openai_api_key = llmSettings.openaiKey;
      }
      if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
        analysisRequest.claude_api_key = llmSettings.claudeKey;
      }
      
      // Call the dedicated junior-analysis-generate endpoint
      const generateRequest = {
        paper_id: paperId,
        user_scholar_url: scholarUrl,
        researcher_type: researcherType,
        research_interests: researchInterests,
        model: llmSettings.model || 'gemini-2.5-flash'
      };
      
      // Add API keys if available
      if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
        generateRequest.google_api_key = llmSettings.geminiKey;
      }
      if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
        generateRequest.openai_api_key = llmSettings.openaiKey;
      }
      if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
        generateRequest.claude_api_key = llmSettings.claudeKey;
      }
      
      console.log(`🔄 Generating analysis for ${researcherType}...`);
      
      const response = await fetch(`${backend.url}/junior-analysis-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generateRequest)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate analysis: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      
      console.log(`✅ Generated analysis for ${researcherType} (cached: ${result.was_cached || false})`);
      
      return {
        type: researcherType,
        content: result.content,
        researcher: researcher,
        status: result.was_cached ? 'cached' : 'generated'
      };
      
    } catch (error) {
      console.error(`❌ Error generating analysis for ${researcherType}:`, error);
      
      // Return error result to display to user
      return {
        type: researcherType,
        content: `**Error generating analysis**: ${error.message}\n\nPlease try again or check your API key configuration.`,
        researcher: researcher,
        status: 'error'
      };
    }
  }
  
  // Setup new chat functionality
  function setupNewChatFunctionality() {
    const chatInput = document.getElementById('newChatInput');
    const chatSend = document.getElementById('newChatSend');
    const chatMessages = document.getElementById('newChatMessages');
    
    if (!chatInput || !chatSend || !chatMessages) return;
    
    // Send button click handler
    chatSend.addEventListener('click', sendNewChatMessage);
    
    // Enter key handler
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendNewChatMessage();
      }
    });
  }
  
  // Send chat message
  async function sendNewChatMessage() {
    const chatInput = document.getElementById('newChatInput');
    const chatMessages = document.getElementById('newChatMessages');
    const chatSend = document.getElementById('newChatSend');
    
    if (!chatInput || !chatMessages || !chatSend) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Clear input and disable send button
    chatInput.value = '';
    chatSend.disabled = true;
    chatInput.disabled = true;
    
    // Add user message
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'message-panel user-message-panel';
    userMessageDiv.innerHTML = `<strong>You:</strong> ${message}`;
    chatMessages.appendChild(userMessageDiv);
    
    // Add typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message-panel assistant-message-panel';
    typingDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    chatMessages.appendChild(typingDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
      // Get paper info for chat context
      const urlParams = getUrlParams();
      const paperId = urlParams.get('paperID');
      
      if (!paperId) {
        throw new Error('No paper ID found for chat');
      }
      
      // Get backend and paper data for chat context
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available for chat');
      }
      
      const paperResponse = await fetch(`${backend.url}/storage/paper/${encodeURIComponent(paperId)}`);
      if (!paperResponse.ok) {
        throw new Error('Failed to get paper data for chat');
      }
      
      const paperStorageData = await paperResponse.json();
      
      // Convert storage format to chat format
      const paperData = {
        title: paperStorageData.title,
        abstract: paperStorageData.metadata?.abstract || '',
        authors: paperStorageData.metadata?.authors || [],
        paperUrl: paperStorageData.metadata?.paperUrl || '',
        paperId: paperStorageData.paper_id,
        paperContent: '', // Chat will work with knowledge base chunks
        metadata: paperStorageData.metadata
      };
      
      // Get LLM settings for chat
      const storageResult = await chrome.storage.local.get(['llmSettings']);
      const llmSettings = storageResult.llmSettings || { model: 'gemini-2.5-flash', geminiKey: '', openaiKey: '', claudeKey: '' };
      
      console.log('🔍 New Chat: LLM settings loaded:', {
        model: llmSettings.model,
        hasGeminiKey: !!llmSettings.geminiKey,
        hasOpenaiKey: !!llmSettings.openaiKey,
        hasClaudeKey: !!llmSettings.claudeKey
      });
      
      // Prepare request body with model and API keys
      const requestBody = {
        message: message,
        paper: paperData,
        model: getModelName(llmSettings.model)
      };
      
      // Add API keys if available
      if (llmSettings.geminiKey && llmSettings.geminiKey.trim()) {
        requestBody.google_api_key = llmSettings.geminiKey;
      }
      if (llmSettings.openaiKey && llmSettings.openaiKey.trim()) {
        requestBody.openai_api_key = llmSettings.openaiKey;
      }
      if (llmSettings.claudeKey && llmSettings.claudeKey.trim()) {
        requestBody.claude_api_key = llmSettings.claudeKey;
      }
      
      console.log('🔍 New Chat: Sending request with model:', requestBody.model);

      // Send chat message to backend
      const chatResponse = await fetch(`${backend.url}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!chatResponse.ok) {
        throw new Error('Failed to get chat response');
      }
      
      const responseData = await chatResponse.json();
      
      // Remove typing indicator
      chatMessages.removeChild(typingDiv);
      
      // Add assistant response
      const assistantMessageDiv = document.createElement('div');
      assistantMessageDiv.className = 'message-panel assistant-message-panel';
      assistantMessageDiv.innerHTML = `<div class="markdown-content">${marked.parse(responseData.response)}</div>`;
      chatMessages.appendChild(assistantMessageDiv);
      
    } catch (error) {
      console.error('Error sending chat message:', error);
      
      // Remove typing indicator
      if (typingDiv.parentNode) {
        chatMessages.removeChild(typingDiv);
      }
      
      // Add error message
      const errorMessageDiv = document.createElement('div');
      errorMessageDiv.className = 'message-panel assistant-message-panel';
      errorMessageDiv.innerHTML = `<div style="color: #dc3545;"><strong>Error:</strong> Failed to get response. Please try again.</div>`;
      chatMessages.appendChild(errorMessageDiv);
    }
    
    // Re-enable input and send button
    chatSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Load paper metadata and initial content
  async function loadPaperMetadataAndContent() {
    console.log('🔧 loadPaperMetadataAndContent called');
    const urlParams = getUrlParams();
    const paperId = urlParams.get('paperID');
    
    console.log('📄 Paper ID from URL:', paperId);
    
    if (!paperId) {
      console.log('No paper ID found, staying on homepage');
      return;
    }
    
    try {
      // Get backend URL using the same smart detection as other functions
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // Fetch paper data from knowledge base endpoint
      const response = await fetch(`${backend.url}/storage/paper/${encodeURIComponent(paperId)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch paper data: ${response.status} ${response.statusText}`);
      }
      
      const paperData = await response.json();
      
      // Update paper metadata
      const titleElement = document.getElementById('newPaperTitle');
      const authorsElement = document.getElementById('newPaperAuthors');
      const abstractElement = document.getElementById('newPaperAbstract');
      
      console.log('📊 Paper data received:', paperData);
      
      if (titleElement) {
        titleElement.textContent = paperData.title || 'Unknown Paper';
      }
      
      if (authorsElement) {
        // Check both direct authors field and metadata.authors
        const authors = paperData.metadata?.authors || paperData.authors || [];
        if (authors.length > 0) {
          await makeAuthorsClickable(authors, 'newPaperAuthors', paperData.paper_id);
        } else {
          authorsElement.innerHTML = `<strong>Authors:</strong> Unknown authors`;
        }
      }
      
      if (abstractElement) {
        // Check both direct abstract field and metadata.abstract
        const abstract = paperData.metadata?.abstract || paperData.abstract || 'No abstract available';
        abstractElement.innerHTML = `<strong>Abstract:</strong> ${abstract}`;
      }
      
      // Load initial analysis content
      await updateAnalysisContent();
      
    } catch (error) {
      console.error('❌ Error loading paper metadata:', error);
      
      // Show error in metadata
      const titleElement = document.getElementById('newPaperTitle');
      const authorsElement = document.getElementById('newPaperAuthors');
      const abstractElement = document.getElementById('newPaperAbstract');
      
      if (titleElement) {
        titleElement.textContent = `Error loading paper: ${error.message}`;
        titleElement.style.color = '#dc3545';
      }
      
      if (authorsElement) {
        authorsElement.innerHTML = `<span style="color: #dc3545;">Error: ${error.message}</span>`;
      }
      
      if (abstractElement) {
        abstractElement.innerHTML = `<span style="color: #dc3545;"><strong>Error:</strong> Failed to load paper data. Please check if the paper exists in the system.</span>`;
      }
    }
  }
  
  })(); // End of initializePage async IIFE

  // Global debug functions
  window.debugNewLayout = function() {
    console.log('🔍 Debug: Checking new layout elements...');
    const grid = document.getElementById('newResearchersGrid');
    const titleEl = document.getElementById('newPaperTitle');
    const authorsEl = document.getElementById('newPaperAuthors');
    const abstractEl = document.getElementById('newPaperAbstract');
    const contentEl = document.getElementById('newAnalysisContent');
    
    console.log('Elements found:', {
      grid: !!grid,
      title: !!titleEl,
      authors: !!authorsEl,
      abstract: !!abstractEl,
      content: !!contentEl
    });
    
    if (grid) {
      console.log('Grid innerHTML:', grid.innerHTML);
      console.log('Grid children count:', grid.children.length);
    }
    
    return { grid, titleEl, authorsEl, abstractEl, contentEl };
  };
  
  window.debugSetupGrid = async function() {
    console.log('🔧 Debug: Manually setting up grid...');
    await setupJuniorResearchersGrid();
  };
  
  window.debugSetupGridSimple = function() {
    console.log('🔧 Debug: Setting up grid with simple approach...');
    const grid = document.getElementById('newResearchersGrid');
    
    if (!grid) {
      console.error('❌ Grid not found!');
      return;
    }
    
    grid.innerHTML = '';
    
    juniorResearchers.forEach(researcher => {
      const chip = document.createElement('label');
      chip.className = 'researcher-chip selected';
      chip.innerHTML = `
        <input type="checkbox" id="new_${researcher.id}" value="${researcher.id}" checked>
        <span class="researcher-name-compact">${researcher.name}</span>
      `;
      grid.appendChild(chip);
    });
    
    console.log(`✅ Added ${juniorResearchers.length} chips (simple approach)`);
  };
  
  // Debug function to test refresh functionality
  window.debugTestRefresh = function(researcherType = 'key_message') {
    console.log(`🧪 DEBUG TEST - Testing refresh for ${researcherType}`);
    
    const urlParams = getUrlParams();
    const paperId = urlParams.get('paperID');
    console.log(`🧪 DEBUG TEST - Paper ID: ${paperId}`);
    
    if (!paperId) {
      console.error('🧪 DEBUG TEST - No paper ID found!');
      return;
    }
    
    // Create a fake event object
    const fakeEvent = {
      stopPropagation: () => console.log('🧪 DEBUG TEST - stopPropagation called'),
      preventDefault: () => console.log('🧪 DEBUG TEST - preventDefault called')
    };
    
    console.log(`🧪 DEBUG TEST - Calling refreshAnalysis directly`);
    window.refreshAnalysis(researcherType, fakeEvent);
  };
  
  // Debug function to check if refresh buttons exist
  window.debugCheckRefreshButtons = function() {
    console.log(`🧪 DEBUG CHECK - Checking for refresh buttons`);
    
    juniorResearchers.forEach(researcher => {
      const refreshBtn = document.getElementById(`refresh_${researcher.id}`);
      const chip = document.querySelector(`label:has(#new_${researcher.id})`);
      
      console.log(`🧪 DEBUG CHECK - ${researcher.id}:`, {
        refreshButtonExists: !!refreshBtn,
        refreshButtonVisible: refreshBtn ? (refreshBtn.offsetWidth > 0 && refreshBtn.offsetHeight > 0) : false,
        chipExists: !!chip,
        chipHTML: chip ? chip.innerHTML : 'N/A'
      });
    });
  };

  // Function to build author profile URL
  function buildAuthorProfileUrl(authorId) {
    const params = new URLSearchParams({
      authorID: authorId
    });
    return `${chrome.runtime.getURL('fullpage.html')}?${params.toString()}`;
  }

  // Function to make authors clickable in paper metadata
  async function makeAuthorsClickable(authorsArray, containerId, paperId = null) {
    const authorsElement = document.getElementById(containerId);
    if (!authorsElement || !authorsArray || authorsArray.length === 0) {
      return;
    }
    
    try {
      let authorLinks = [];
      
      // If we have a paperId, fetch the real database author IDs
      if (paperId) {
        console.log(`🔍 Fetching real author IDs for paper: ${paperId}`);
        
        const backend = await backendManager.getCurrentBackend();
        console.log('🔧 Backend received:', backend);
        if (backend) {
          try {
            const authorUrl = `${backend.url}/paper/${paperId}/authors`;
            console.log(`🌐 Fetching from: ${authorUrl}`);
            const response = await fetch(authorUrl);
            if (response.ok) {
              const data = await response.json();
              const authorsWithIds = data.authors || [];
              
              // Create clickable links with real database IDs
              authorLinks = authorsWithIds.map(author => {
                const authorUrl = buildAuthorProfileUrl(author.id);
                return `<a href="${authorUrl}" class="author-link" data-author-id="${author.id}">${author.name}</a>`;
              });
              
              console.log(`✅ Found ${authorsWithIds.length} authors with database IDs`);
            } else {
              console.warn('Failed to fetch author IDs, falling back to string-based IDs');
              throw new Error('Failed to fetch author IDs');
            }
          } catch (error) {
            console.warn('Error fetching author IDs:', error);
            throw error;
          }
        } else {
          throw new Error('No backend available');
        }
      } else {
        throw new Error('No paper ID provided');
      }
      
      // If we couldn't get real IDs, fall back to string-based conversion
      if (authorLinks.length === 0) {
        console.log('📝 Falling back to string-based author IDs');
        authorLinks = authorsArray.map(author => {
          const authorId = author.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
          const authorUrl = buildAuthorProfileUrl(authorId);
          return `<a href="${authorUrl}" class="author-link" data-author-name="${author}">${author}</a>`;
        });
      }
      
      // Update the element with clickable authors
      authorsElement.innerHTML = `<strong>Authors:</strong> ${authorLinks.join(', ')}`;
      
      // Add click event listeners for the author links
      const authorLinkElements = authorsElement.querySelectorAll('.author-link');
      authorLinkElements.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const authorId = link.dataset.authorId || link.dataset.authorName?.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '');
          const authorName = link.dataset.authorName || link.textContent;
          
          console.log(`🔗 Opening author profile: ID=${authorId}, Name=${authorName}`);
          
          // Navigate to author profile page
          const authorUrl = buildAuthorProfileUrl(authorId);
          window.location.href = authorUrl;
        });
      });
      
    } catch (error) {
      console.error('Error making authors clickable:', error);
      
      // Fallback: display authors as plain text
      authorsElement.innerHTML = `<strong>Authors:</strong> ${authorsArray.join(', ')}`;
    }
  }

  // Function to navigate to author profile
  window.navigateToAuthorProfile = function(authorId, authorName) {
    console.log('🎯 Navigating to author profile:', authorName, 'ID:', authorId);
    const authorUrl = buildAuthorProfileUrl(authorId, { name: authorName });
    window.location.href = authorUrl;
  };

  // Function to create refresh button for author profile
  function createAuthorRefreshButton(authorId) {
    const refreshBtn = document.createElement('button');
    refreshBtn.id = 'authorRefreshBtn';
    refreshBtn.className = 'button refresh-button';
    refreshBtn.innerHTML = '🔄 Refresh Author Data';
    refreshBtn.style.cssText = `
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      margin-right: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
    `;
    
    // Add hover effect
    refreshBtn.addEventListener('mouseenter', () => {
      refreshBtn.style.transform = 'translateY(-2px)';
      refreshBtn.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.4)';
    });
    
    refreshBtn.addEventListener('mouseleave', () => {
      refreshBtn.style.transform = 'translateY(0)';
      refreshBtn.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
    });
    
    // Add click handler
    refreshBtn.addEventListener('click', async () => {
      await refreshAuthorData(authorId, refreshBtn);
    });
    
    return refreshBtn;
  }

  // Function to refresh author data
  async function refreshAuthorData(authorId, buttonElement) {
    const originalText = buttonElement.innerHTML;
    const originalStyle = buttonElement.style.cssText;
    
    try {
      // Update button to loading state
      buttonElement.innerHTML = '⏳ Refreshing...';
      buttonElement.style.background = 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)';
      buttonElement.disabled = true;
      buttonElement.style.cursor = 'not-allowed';
      
      console.log('🔄 Refreshing author data for ID:', authorId);
      
      // Get backend
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        throw new Error('No backend available');
      }
      
      // First, trigger author enrichment
      const enrichResponse = await fetch(`${backend.url}/author/${encodeURIComponent(authorId)}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!enrichResponse.ok) {
        console.warn('Author enrichment failed, proceeding with current data');
      } else {
        console.log('✅ Author enrichment triggered successfully');
      }
      
      // Fetch fresh author data
      const response = await fetch(`${backend.url}/author/${encodeURIComponent(authorId)}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch author data: ${response.status} ${response.statusText}`);
      }
      
      const freshAuthorData = await response.json();
      console.log('✅ Fresh author data loaded:', freshAuthorData);
      
      // Success feedback
      buttonElement.innerHTML = '✅ Refreshed!';
      buttonElement.style.background = 'linear-gradient(135deg, #10b981 0%, #34d399 100%)';
      
      // Reload the page with fresh data after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Error refreshing author data:', error);
      
      // Error feedback
      buttonElement.innerHTML = '❌ Error';
      buttonElement.style.background = 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)';
      
      // Reset button after delay
      setTimeout(() => {
        buttonElement.innerHTML = originalText;
        buttonElement.style.cssText = originalStyle;
        buttonElement.disabled = false;
      }, 2000);
    }
  }

  // Helper function to setup Individual Author Profile view UI
  function setupAuthorProfileUI(authorData) {
    console.log('🔧 Setting up Individual Author Profile UI');
    const header = document.querySelector('.header');
    
    // Hide status and upload sections
    if (statusDiv) statusDiv.style.display = 'none';
    if (uploadSection) uploadSection.style.display = 'none';
    
    // Show analysis content structure for author profile
    if (analysisContent) analysisContent.style.display = 'block';
    if (paperInfo) paperInfo.style.display = 'block';
    if (summaryDiv) summaryDiv.style.display = 'block';
    if (chatSection) chatSection.style.display = 'none'; // No chat in author profile view
    if (header) header.style.display = 'flex';
    
    // Configure buttons for author profile view
    if (backBtn) {
      backBtn.style.display = 'none'; // Disable back button in author profile view
    }
    if (clearBtn) {
      clearBtn.style.display = 'inline-block';
      clearBtn.textContent = 'Go to Homepage';
    }
    
    // Add refresh button for author profile
    const refreshBtn = createAuthorRefreshButton(authorData.author_id);
    if (clearBtn && clearBtn.parentNode) {
      clearBtn.parentNode.insertBefore(refreshBtn, clearBtn);
    }
    
    // Also disable the second back button if it exists
    const backBtn2 = document.getElementById('backBtn2');
    if (backBtn2) {
      backBtn2.style.display = 'none'; // Disable back button 2 in author profile view
    }
    // viewAuthorsBtn removed from UI
    
    // Set author profile title and information
    const paperTitle = document.getElementById('paperTitle');
    const paperMeta = document.getElementById('paperMeta');
    
    const profile = authorData.author_profile || {};
    const publications = authorData.publications || [];
    const papers = authorData.papers || [];
    const metrics = authorData.metrics || {};
    
    if (paperTitle) {
      paperTitle.textContent = `${profile.name || 'Unknown Author'}`;
    }
    
    if (paperMeta) {
      const metaInfo = `Author ID: ${authorData.author_id} | Papers in System: ${authorData.total_papers} | Total Publications: ${authorData.total_publications}`;
      paperMeta.textContent = metaInfo;
    }
    
    // Create comprehensive author profile HTML
    if (summaryDiv) {
      // Get author profile data
      const profile = authorData.author_profile || {};
      const publications = authorData.publications || [];
      const metrics = authorData.metrics || {};
      
      // Helper function to get the best value from either profile or metrics
      const getBestValue = (field, defaultVal = 0) => {
        return profile[field] || metrics[field] || defaultVal;
      };
      
             // Get affiliation - try paper metadata first as it's most current
       let affiliation = "Unknown";
       if (authorData.papers && authorData.papers.length > 0) {
         // Try to find affiliation from paper metadata
         const paper = authorData.papers[0];
         if (paper.metadata && paper.metadata.authors && paper.metadata.affiliations) {
           const authorIndex = paper.metadata.authors.findIndex(name => name === profile.name);
           if (authorIndex >= 0 && authorIndex < paper.metadata.affiliations.length) {
             affiliation = paper.metadata.affiliations[authorIndex] || "Unknown";
           }
         }
       }
       
       // If still unknown, try to get a reasonable default
       if (affiliation === "Unknown" && profile.google_scholar_url) {
         affiliation = "University (see Google Scholar profile)";
       }
      
      // Use Google Scholar URL from database if available
      const profileUrl = profile.google_scholar_url || 'Not available';
      
      const profileHtml = `
        <div class="author-profile-comprehensive">
          <div style="max-width: 1000px; margin: 0 auto; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- Author Header -->
            <div style="margin-bottom: 30px; padding: 25px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white;">
              <h1 style="margin: 0 0 10px 0; font-size: 2.2em; font-weight: 600;">Author ${authorData.author_id}: ${profile.name || 'Unknown Author'}</h1>
              <p style="margin: 0; font-size: 1.1em; opacity: 0.9;"><strong>Affiliation:</strong> ${affiliation}</p>
            </div>
            
            <!-- Google Scholar Profile Section -->
            <div style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff;">
              <h2 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.5em;">Google Scholar Profile</h2>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
                <div>
                  <strong>Total Citations:</strong> <span style="color: #28a745; font-weight: 600; font-size: 1.1em;">${getBestValue('total_citations').toLocaleString()}</span>
                </div>
                <div>
                  <strong>H-index:</strong> <span style="color: #007bff; font-weight: 600; font-size: 1.1em;">${getBestValue('h_index')}</span>
                </div>
                <div>
                  <strong>i10-index:</strong> <span style="color: #6f42c1; font-weight: 600; font-size: 1.1em;">${getBestValue('i10_index')}</span>
                </div>
              </div>
              ${profileUrl !== 'Not available' ? `
                <div>
                  <strong>Profile URL:</strong> <a href="${profileUrl}" target="_blank" style="color: #007bff; text-decoration: none;">${profileUrl}</a>
                </div>
              ` : ''}
            </div>
            
            <!-- Mini-bio Section -->
            <div style="margin-bottom: 30px; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #dee2e6;">
              <h2 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.5em;">Mini-bio</h2>
              
              <div style="margin-bottom: 20px;">
                <strong>FT50 Publications:</strong> <span style="color: #dc3545; font-weight: 600;">${getBestValue('ft50_count')}</span>
                ${profile.ft50_journals && profile.ft50_journals.length > 0 ? `
                  <br><strong>FT50 Journals:</strong> <span style="color: #6c757d;">${profile.ft50_journals.join(', ')}</span>
                ` : ''}
              </div>
              
              ${profile.ft50_journals && profile.ft50_journals.length > 0 ? `
                <div style="margin-bottom: 20px;">
                  <strong>Top FT50 Publications:</strong>
                  <ul style="margin: 10px 0 0 20px; padding: 0;">
                    ${publications.filter(pub => {
                      const venue = pub.venue ? pub.venue.toLowerCase() : '';
                      return profile.ft50_journals.some(journal => venue.includes(journal.toLowerCase()));
                    }).slice(0, 3).map(pub => `
                      <li style="margin-bottom: 8px; color: #495057;">
                        <em>${pub.title}</em> (${pub.year}, ${pub.venue})
                        ${pub.citations ? ` - ${pub.citations} citations` : ''}
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
              
              ${profile.most_cited_papers && profile.most_cited_papers.length > 0 ? `
                <div style="margin-bottom: 20px;">
                  <strong>Most Cited Papers:</strong>
                  <ul style="margin: 10px 0 0 20px; padding: 0;">
                    ${profile.most_cited_papers.slice(0, 5).map(paper => `
                      <li style="margin-bottom: 8px; color: #495057;">
                        <em>${paper.title}</em> (${paper.year}) - <strong>${paper.citations} citations</strong>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : publications.length > 0 ? `
                <div style="margin-bottom: 20px;">
                  <strong>Most Cited Papers:</strong>
                  <ul style="margin: 10px 0 0 20px; padding: 0;">
                    ${publications.sort((a, b) => (b.citations || 0) - (a.citations || 0)).slice(0, 5).map(pub => `
                      <li style="margin-bottom: 8px; color: #495057;">
                        <em>${pub.title}</em> (${pub.year}) - <strong>${pub.citations || 0} citations</strong>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              ` : ''}
              
              ${profile.research_areas && profile.research_areas.length > 0 ? `
                <div>
                  <strong>Research Areas:</strong> <span style="color: #6c757d;">${profile.research_areas.join(', ')}</span>
                </div>
              ` : ''}
            </div>
            
            <!-- Topic Overlap Section -->
            <div style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #17a2b8;">
              <h2 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.5em;">Topic Overlap</h2>
              <div style="color: #6c757d;">
                <p><strong>No direct overlap with target topics found</strong></p>
                <p><strong>Main research focus:</strong> ${profile.research_areas ? profile.research_areas.join(', ') : 'Not specified'}</p>
              </div>
            </div>
            
            <!-- Publications Section -->
            ${publications.length > 0 ? `
              <div style="margin-bottom: 30px; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #dee2e6;">
                <h2 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.5em;">Recent Publications (${publications.length} total)</h2>
                <div style="max-height: 400px; overflow-y: auto;">
                  ${publications.slice(0, 10).map((pub, index) => `
                    <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 3px solid #007bff;">
                      <div style="font-weight: 600; color: #2c3e50; margin-bottom: 5px;">${index + 1}. ${pub.title}</div>
                      <div style="color: #6c757d; font-size: 0.9em; margin-bottom: 5px;">
                        <strong>Authors:</strong> ${pub.authors || 'Not specified'} | 
                        <strong>Year:</strong> ${pub.year || 'N/A'} | 
                        <strong>Venue:</strong> ${pub.venue || 'Not specified'}
                      </div>
                      ${pub.citations ? `<div style="color: #28a745; font-weight: 600;">Citations: ${pub.citations}</div>` : ''}
                    </div>
                  `).join('')}
                  ${publications.length > 10 ? `
                    <div style="text-align: center; margin-top: 15px; color: #6c757d;">
                      ... and ${publications.length - 10} more publications
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : ''}
            
            <!-- Papers in System Section -->
            ${authorData.papers && authorData.papers.length > 0 ? `
              <div style="margin-bottom: 30px; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #dee2e6;">
                <h2 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 1.5em;">Papers in System (${authorData.papers.length})</h2>
                ${authorData.papers.map((paper, index) => `
                  <div style="margin-bottom: 15px; padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 3px solid #28a745;">
                    <div style="font-weight: 600; color: #2c3e50; margin-bottom: 5px;">
                      <a href="?paperID=${paper.paper_id}" style="color: #007bff; text-decoration: none;">
                        ${index + 1}. ${paper.title}
                      </a>
                    </div>
                    <div style="color: #6c757d; font-size: 0.9em;">
                      Paper ID: ${paper.paper_id} | Added: ${new Date(paper.created_at).toLocaleDateString()}
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            
          </div>
        </div>
      `;
      
      summaryDiv.innerHTML = profileHtml;
    }
    
    console.log('✅ Individual Author Profile UI setup complete');
  }

});
