document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
  async function setAnalysisStatus(url, status, errorMessage = null) {
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
  }
  
  async function getAnalysisStatus(url) {
    const storage = await chrome.storage.local.get([STATUS_KEY]);
    const allStatus = storage[STATUS_KEY] || {};
    return allStatus[url] || null;
  }
  
  console.log('Fullpage loaded: DOMContentLoaded event fired');
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
        content.paperId = extractSsrnIdOrUrl(content.paperUrl);
      }

      const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ content })
      });

      if (serverResponse.ok) {
        const currentBackend = await backendManager.getCurrentBackend();
        updateStatus(`Successfully connected to ${currentBackend.name}`);
        return serverResponse;
      } else {
        const errorText = await serverResponse.text();
        throw new Error(`Backend error: ${serverResponse.status} - ${errorText}`);
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
      // Configure marked options
      marked.setOptions({
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
        headerIds: true, // Add IDs to headers
        mangle: false, // Don't escape HTML
        sanitize: false // Allow HTML
      });

      // Convert markdown to HTML
      const html = marked.parse(markdown);
      
      // Wrap in a div with markdown-content class for styling
      return `<div class="markdown-content">${html}</div>`;
    } catch (error) {
      console.error('Error converting markdown to HTML:', error);
      return `<div class="markdown-content"><p>Error displaying content: ${error.message}</p></div>`;
    }
  }

  // Function to handle PDF upload
  async function handlePdfUpload(file) {
    try {
      clearStatus();
      updateStatus('Processing uploaded PDF...');
      
      // Create a FileReader to read the file content
      const reader = new FileReader();
      
      // Read the file as ArrayBuffer
      reader.onload = async function(e) {
        try {
          // Convert ArrayBuffer to base64
          const base64Content = btoa(
            new Uint8Array(e.target.result)
              .reduce((data, byte) => data + String.fromCharCode(byte), '')
          );

          const content = {
            title: file.name,
            paperId: file.name,
            paperUrl: URL.createObjectURL(file),
            isLocalFile: true,
            filePath: file.name,
            hasPdf: true,
            fileContent: base64Content // Send as base64 string
          };

          currentPdfContent = content;
          await analyzePaper(content);
        } catch (error) {
          console.error('Error processing PDF:', error);
          updateStatus(`Error: ${error.message}`, true);
        }
      };

      reader.onerror = function(error) {
        console.error('Error reading file:', error);
        updateStatus('Error reading PDF file', true);
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Error handling PDF upload:', error);
      updateStatus(`Error: ${error.message}`, true);
    }
  }

  // Function to analyze paper
  async function analyzePaper(content = null) {
    try {
      if (!content) {
        updateStatus('No content provided for analysis', true);
        return;
      }
      // Extract paper ID
      const paperId = extractSsrnIdOrUrl(content.paperUrl) || content.paperId;
      const storageKey = `analysis_${paperId}`;
      
      // Check cache before sending request
      const cached = await chrome.storage.local.get([storageKey]);
      if (cached[storageKey] && cached[storageKey].summary) {
        updateStatus('Loaded analysis from cache.');
        const html = markdownToHtml(cached[storageKey].summary);
        summaryDiv.innerHTML = html;
        currentPdfContent = cached[storageKey].content;
        
        // If there's author data, display it
        if (cached[storageKey].data && cached[storageKey].data.author_data) {
          displayAuthorAnalysis(cached[storageKey].data.author_data);
        }
        
        chatSection.style.display = 'block';
        return;
      }
      
      updateStatus('Starting analysis...');
      
      // Hide upload section during analysis
      uploadSection.style.display = 'none';
      
      // Set analysis status to in progress
      await setAnalysisStatus(paperId, 'in_progress');
      
      // Use smart backend detection to connect to the server
      const serverResponse = await analyzeWithSmartBackend(content);
      
      updateStatus('Server response received, processing...');
      let data;
      try {
        const responseText = await serverResponse.text();
        if (!responseText) {
          throw new Error('Empty response from server');
        }
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Error parsing server response:', e);
        throw new Error('Invalid response from server');
      }
      
      if (!data.summary) {
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
        content: content,
        summary: data.summary,
        data: data.author_data || data,
        autoAnalyzed: false
      };
      
      // Store in local storage
      const storageData = {};
      storageData[storageKey] = analysisResult;
      await chrome.storage.local.set(storageData);
      
      // Show View Author Analysis button if author data is available
      if (data.author_data && viewAuthorsBtn) {
        viewAuthorsBtn.style.display = 'inline-block';
        viewAuthorsBtn.style.backgroundColor = '#4CAF50';
        // Display author analysis if available
        displayAuthorAnalysis(data.author_data);
      }
      
    } catch (error) {
      console.error('Error analyzing paper:', error);
      updateStatus(`Error: ${error.message}`, true);
      
      // Show upload section again on error
      uploadSection.style.display = 'block';
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
  }

  // Function to handle chat
  async function handleChat(message) {
    if (!currentPdfContent) {
      addMessage('No PDF content available for chat. Please upload a PDF first.', false);
      return;
    }

    try {
      // Get LLM settings
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini', openaiKey: '' };
      const response = await makeApiRequest(CONFIG.CHAT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          content: currentPdfContent,
          model: llmSettings.model === 'openai' ? 'openai-4o' : 'gemini',
          openai_api_key: llmSettings.model === 'openai' ? llmSettings.openaiKey : undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        addMessage(data.response, false);
      } else {
        addMessage('Error: Could not get response from server', false);
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage('Error: Could not connect to server', false);
    }
  }

  // Function to display author analysis results
  function displayAuthorAnalysis(authorData) {
    const summary = authorData.summary;
    const authors = authorData.authors;
    
    // Create HTML for author analysis display
    let html = `
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

    summaryDiv.innerHTML = html;
  }

  // Add robust SSRN ID extraction function (copied from popup.js)
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

  // Add this async function to fetch analysis from backend by paperID
  async function fetchAnalysisFromBackend(paperId) {
    try {
      const backendUrl = (window.CONFIG && window.CONFIG.ANALYZE_ENDPOINT)
        ? window.CONFIG.ANALYZE_ENDPOINT.replace(/\/analyze.*/, '')
        : 'http://localhost:8080';
      const url = `${backendUrl}/analysis/${paperId}`;
      console.log('Trying to fetch analysis from backend:', url);
      const response = await fetch(url);
      if (!response.ok) {
        console.log('Backend returned non-OK for analysis:', response.status);
        return null;
      }
      const data = await response.json();
      if (data && data.summary) {
        console.log('Fetched analysis from backend for paperID:', paperId);
        // Store in local storage for future use
        const storageKey = `analysis_${paperId}`;
        const analysisResult = {
          timestamp: new Date().toISOString(),
          paperId: paperId,
          summary: data.summary,
          data: data.author_data,
          autoAnalyzed: true
        };
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

  // Check URL parameters to determine view mode
  const urlParams = new URLSearchParams(window.location.search);
  const viewMode = urlParams.get('view');
  const paperUrl = urlParams.get('paperUrl');
  const paperId = extractSsrnIdOrUrl(paperUrl) || urlParams.get('paperID');

  // Only show error if no paper ID is found
  if (!paperId) {
    updateStatus('No paper ID provided. Please open the analysis from the extension popup.', true);
    return;
  }

  // Use paperID for storage key
  const storageKey = `analysis_${paperId}`;
  console.log('Looking up analysis for paperID:', paperId, 'with key:', storageKey);

  // Initialize the page based on URL parameters
  (async () => {
    let analysis = null;
    if (paperId) {
      analysis = await fetchAnalysisFromBackend(paperId);
    }
    if (!analysis) {
      // Fallback to local storage
      const cached = await chrome.storage.local.get([storageKey]);
      analysis = cached[storageKey];
      if (analysis) {
        console.log('Loaded analysis from local storage for paperID:', paperId);
      } else {
        console.log('No analysis found in backend or local storage for paperID:', paperId);
      }
    }
    if (analysis && analysis.summary) {
      // Display the summary
      const html = markdownToHtml(analysis.summary);
      summaryDiv.innerHTML = html;
      currentPdfContent = analysis.content;
      if (analysis.data && analysis.data.author_data) {
        displayAuthorAnalysis(analysis.data.author_data);
      }
      chatSection.style.display = 'block';
    } else {
      updateStatus('No analysis found for this paper. Please analyze the paper first.', true);
    }
  })();

  // Load specific paper analysis
  (async () => {
    try {
      const result = await chrome.storage.local.get([storageKey]);
      const analysis = result[storageKey];
      
      if (analysis) {
        // Make sure we have a summary to display
        if (analysis.summary) {
          const html = markdownToHtml(analysis.summary);
          summaryDiv.innerHTML = html;
          
          // Show appropriate status message
          if (analysis.autoAnalyzed) {
            updateStatus(`DONE: PDF automatically analyzed at ${new Date(analysis.timestamp).toLocaleString()}`);
            updateStatus('Analysis completed automatically when PDF was loaded');
          } else {
            updateStatus(`Loaded analysis for paper ID: ${paperId} from ${new Date(analysis.timestamp).toLocaleString()}`);
          }
          
          // Store the content for chat functionality
          currentPdfContent = analysis.content;
          
          // Enable chat section if we have content
          if (currentPdfContent) {
            chatSection.style.display = 'block';
          }
          
          // Check if author data is available and show/hide the view authors button
          if (viewAuthorsBtn) {
            if (analysis.data && analysis.data.author_data) {
              viewAuthorsBtn.style.display = 'inline-block';
              viewAuthorsBtn.style.backgroundColor = '#4CAF50';
              updateStatus(`Author profiles available: ${analysis.data.author_data.summary.total_authors} authors with ${analysis.data.author_data.summary.total_citations.toLocaleString()} total citations. Click "View Author Analysis" to see details.`);
            } else {
              viewAuthorsBtn.style.display = 'none';
            }
          }
        } else {
          updateStatus('Analysis found but no summary available. Please try analyzing the paper again.', true);
        }
      } else {
        updateStatus('No analysis found for this paper. Please analyze the paper first.', true);
      }
    } catch (error) {
      console.error('Error loading paper analysis:', error);
      updateStatus('Error loading analysis: ' + error.message, true);
    }
  })();

  // Event listeners
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async function() {
      console.log('Analyze button clicked');
      await analyzePaper();
    });
  } else {
    console.warn('analyzeBtn not found');
  }

  if (backBtn) {
    // Set up context-aware back button behavior
    if (viewMode === 'authors') {
      // In authors view: back means return to full page
      backBtn.addEventListener('click', function() {
        console.log('Back button clicked (authors view)');
        window.location.href = '/fullpage.html?paperID=' + encodeURIComponent(paperId);
      });
    } else {
      // In full page view: back means close tab and return to PDF
      backBtn.addEventListener('click', function() {
        console.log('Back button clicked (full page view)');
        // Try to close the tab if possible
        if (chrome && chrome.tabs) {
          chrome.tabs.getCurrent(function(tab) {
            if (tab && tab.id) {
              chrome.tabs.remove(tab.id);
            } else {
              window.close();
            }
          });
        } else {
          window.close();
        }
      });
    }
  } else {
    console.warn('backBtn not found');
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      console.log('Clear button clicked');
      clearContent();
    });
  } else {
    console.warn('clearBtn not found');
  }

  // Update view authors button navigation
  if (viewAuthorsBtn) {
    viewAuthorsBtn.addEventListener('click', function() {
      // Use the current paperID for navigation
      let url = '/fullpage.html?view=authors';
      if (paperId) {
        url += '&paperID=' + encodeURIComponent(paperId);
      }
      window.location.href = url;
    });
  }

  if (uploadBtn && pdfUpload) {
    uploadBtn.addEventListener('click', function() {
      console.log('Upload button clicked');
      pdfUpload.click();
    });
    pdfUpload.addEventListener('change', function(event) {
      if (event.target.files && event.target.files[0]) {
        handlePdfUpload(event.target.files[0]);
      }
    });
  } else {
    console.warn('uploadBtn or pdfUpload not found');
  }

  uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.classList.add('dragover');
  });

  uploadSection.addEventListener('dragleave', () => {
    uploadSection.classList.remove('dragover');
  });

  uploadSection.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadSection.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfUpload(file);
    } else {
      updateStatus('Please upload a PDF file', true);
    }
  });

  if (chatInput && sendBtn) {
    sendBtn.addEventListener('click', function() {
    const message = chatInput.value.trim();
    if (message) {
        addMessage(message, true);
        chatInput.value = '';
      handleChat(message);
    }
  });

    chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const message = chatInput.value.trim();
      if (message) {
          addMessage(message, true);
          chatInput.value = '';
        handleChat(message);
      }
    }
  });
  }
}); 