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

      updateStatus('Starting analysis...');
      
      // Hide upload section during analysis
      uploadSection.style.display = 'none';
      
      // Set analysis status to in progress
      await setAnalysisStatus(content.paperUrl || tab.url, 'in_progress');
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
      
      // Save the content to storage
      const storageData = {
        lastAnalysis: {
          timestamp: new Date().toISOString(),
          url: content.paperUrl,
          title: content.title,
          summary: data.summary,
          content: content
        }
      };
      
      // If author data is available from the full analysis, store it for the author view
      if (data.author_data) {
        console.log('Author data received from full analysis, storing for author view');
        storageData.lastAuthorAnalysis = {
          timestamp: new Date().toISOString(),
          url: content.paperUrl,
          data: data.author_data
        };
        updateStatus(`Author profiles fetched: ${data.author_data.summary.total_authors} authors with ${data.author_data.summary.total_citations.toLocaleString()} total citations`);
      }
      
      chrome.storage.local.set(storageData);
      
      // Show View Author Analysis button if author data is available
      if (data.author_data && viewAuthorsBtn) {
        viewAuthorsBtn.style.display = 'inline-block';
        viewAuthorsBtn.style.backgroundColor = '#4CAF50';
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
      const response = await makeApiRequest(CONFIG.CHAT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          message: message,
          content: currentPdfContent
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

  // Check URL parameters to determine view mode
  const urlParams = new URLSearchParams(window.location.search);
  const viewMode = urlParams.get('view');
  const paperUrl = urlParams.get('paperUrl');

  // Initialize the page based on URL parameters
  if (viewMode === 'authors') {
    // Load author analysis data (tab-specific)
    (async () => {
      try {
        // Use paperUrl from query string
        if (!paperUrl) {
          updateStatus('No paper URL provided. Please open the analysis from the extension popup.', true);
          return;
        }
        // Load tab-specific author analysis results
        const result = await chrome.storage.local.get(['authorAnalysisResults', 'analysisResults', 'lastAuthorAnalysis', 'lastAnalysis']);
        
        // First try to find author analysis for the current tab URL
        let authorAnalysis = null;
        let paperAnalysis = null;
        
        if (result.authorAnalysisResults && result.authorAnalysisResults[paperUrl]) {
          authorAnalysis = result.authorAnalysisResults[paperUrl];
          console.log('Found tab-specific author analysis:', authorAnalysis);
        } else if (result.lastAuthorAnalysis) {
          // Fallback to legacy storage for backward compatibility
          authorAnalysis = result.lastAuthorAnalysis;
          console.log('Using legacy author analysis storage:', authorAnalysis);
        }
        
        if (result.analysisResults && result.analysisResults[paperUrl]) {
          paperAnalysis = result.analysisResults[paperUrl];
        } else if (result.lastAnalysis) {
          paperAnalysis = result.lastAnalysis;
        }
        
        if (authorAnalysis) {
          displayAuthorAnalysis(authorAnalysis.data);
          updateStatus(`Author analysis loaded for ${paperUrl}`);
          
          // Show back button to return to paper analysis
          if (backBtn) {
            backBtn.style.display = 'inline-block';
            backBtn.onclick = () => {
              window.location.href = '/fullpage.html?paperUrl=' + encodeURIComponent(paperUrl);
            };
          }
        } else {
          updateStatus('No author analysis found for this paper.', true);
          summaryDiv.innerHTML = '<p>No author analysis available for this paper.</p>';
        }
      } catch (error) {
        console.error('Error loading author analysis:', error);
        updateStatus('Error loading author analysis: ' + error.message, true);
      }
    })();
  } else if (paperUrl) {
    // Load specific paper analysis if paperUrl is provided
    (async () => {
      try {
        const result = await chrome.storage.local.get(['analysisResults', 'authorAnalysisResults', 'lastAnalysis', 'lastAuthorAnalysis']);
        
        let analysis = null;
        let authorAnalysis = null;
        
        // Try to find analysis for the specific paper URL
        if (result.analysisResults && result.analysisResults[paperUrl]) {
          analysis = result.analysisResults[paperUrl];
          console.log('Found tab-specific analysis:', analysis);
        } else if (result.lastAnalysis && result.lastAnalysis.url === paperUrl) {
          analysis = result.lastAnalysis;
          console.log('Using legacy analysis storage:', analysis);
        }
        
        if (result.authorAnalysisResults && result.authorAnalysisResults[paperUrl]) {
          authorAnalysis = result.authorAnalysisResults[paperUrl];
        } else if (result.lastAuthorAnalysis && result.lastAuthorAnalysis.url === paperUrl) {
          authorAnalysis = result.lastAuthorAnalysis;
        }
        
        if (analysis) {
          const html = markdownToHtml(analysis.summary);
          summaryDiv.innerHTML = html;
          
          // Show appropriate status message
          if (analysis.autoAnalyzed) {
            updateStatus(`DONE: PDF automatically analyzed at ${new Date(analysis.timestamp).toLocaleString()}`);
            updateStatus('Analysis completed automatically when PDF was loaded');
          } else {
            updateStatus(`Loaded analysis for this paper from ${new Date(analysis.timestamp).toLocaleString()}`);
          }
          
          // Check if author data is available and show/hide the view authors button
          if (viewAuthorsBtn) {
            if (authorAnalysis) {
              viewAuthorsBtn.style.display = 'inline-block';
              viewAuthorsBtn.style.backgroundColor = '#4CAF50'; // Green to indicate available
              updateStatus(`Author profiles available: ${authorAnalysis.data.summary.total_authors} authors with ${authorAnalysis.data.summary.total_citations.toLocaleString()} total citations. Click "View Author Analysis" to see details.`);
            } else {
              viewAuthorsBtn.style.display = 'none'; // Hide if no author data
            }
          }
          
          chatSection.style.display = 'block';
          
          // Store the content for chat functionality
          currentPdfContent = analysis.content;
        } else {
          updateStatus('No analysis found for this paper. Please analyze the paper first.', true);
          summaryDiv.innerHTML = '<p>No analysis results found for this paper. Please go back and analyze the paper first.</p>';
        }
      } catch (error) {
        console.error('Error loading analysis results:', error);
        updateStatus('Error loading analysis results: ' + error.message, true);
      }
    })();
  } else {
    // Default: Show empty page ready for uploads
    updateStatus('Ready for PDF upload. Drag and drop a PDF file or click "Upload PDF" to get started.');
    uploadSection.style.display = 'block';
    summaryDiv.innerHTML = '';
    chatSection.style.display = 'none';
  }

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
    backBtn.addEventListener('click', function() {
      console.log('Back button clicked');
      if (window.history.length > 1) {
        window.history.back();
      } else {
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
      }
    });
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

  if (viewAuthorsBtn) {
    viewAuthorsBtn.addEventListener('click', function() {
      console.log('View Author Analysis button clicked');
      window.location.href = '/fullpage.html?view=authors';
    });
  } else {
    console.warn('viewAuthorsBtn not found');
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