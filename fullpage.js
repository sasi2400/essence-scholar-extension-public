

document.addEventListener('DOMContentLoaded', function() {
  // Persistent analysis status utility functions
  const STATUS_KEY = 'analysisStatus';
  
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
        content.paperId = extractSsrnIdOrUrl(content.paperUrl);
      }

      // Try multiple times with different backends
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          const serverResponse = await makeApiRequest(CONFIG.ANALYZE_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ content })
          });

          if (!serverResponse.ok) {
            const errorText = await serverResponse.text();
            let errorMessage = 'Backend error';
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.error || errorData.details || errorText;
            } catch (e) {
              errorMessage = errorText;
            }
            throw new Error(`Backend error: ${serverResponse.status} - ${errorMessage}`);
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
        return;
      }
      
      // Create a FileReader to read the file content
      const reader = new FileReader();
      
      // Read the file as base64 directly
      reader.onload = async function(e) {
        try {
          updateStatus('Converting PDF to base64...');
          
          // Extract base64 content (remove data:application/pdf;base64, prefix)
          const base64Content = e.target.result.split(',')[1];
          
          if (!base64Content) {
            throw new Error('Failed to convert PDF to base64');
          }
          
          updateStatus('PDF processed successfully. Starting analysis...');

          const content = {
            title: file.name.replace('.pdf', ''),
            paperId: file.name.replace('.pdf', ''),
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
          updateStatus(`Error processing PDF: ${error.message}`, true);
          // Show upload section again on error
          if (uploadSection) {
            uploadSection.style.display = 'block';
          }
        }
      };

      reader.onerror = function(error) {
        console.error('Error reading file:', error);
        updateStatus('Error reading PDF file. Please try again.', true);
        // Show upload section again on error
        if (uploadSection) {
          uploadSection.style.display = 'block';
        }
      };

      // Read as data URL (which gives us base64)
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error handling PDF upload:', error);
      updateStatus(`Error uploading PDF: ${error.message}`, true);
      // Show upload section again on error
      if (uploadSection) {
        uploadSection.style.display = 'block';
      }
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
      const paperId = extractSsrnIdOrUrl(content.paperUrl) || content.paperId;
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
      const llmSettings = (await chrome.storage.local.get(['llmSettings'])).llmSettings || { model: 'gemini-2.5-flash', openaiKey: '', claudeKey: '' };
      
      // Format request to match backend's expected structure
      const requestBody = {
        message: message,
        paper: currentPdfContent, // Send the entire PDF content object as 'paper'
        model: getModelName(llmSettings.model),
        openai_api_key: llmSettings.model === 'openai' ? llmSettings.openaiKey : undefined,
        claude_api_key: llmSettings.model === 'claude' ? llmSettings.claudeKey : undefined
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
      // Use smart backend detection to get the correct backend URL
      const backend = await backendManager.getCurrentBackend();
      if (!backend) {
        console.log('No healthy backend available for fetching analysis');
        return null;
      }
      
      const url = `${backend.url}/analysis/${paperId}`;
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
        
        // Clean up summary
        if (summary) {
          summary = summary
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
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
  const urlParams = new URLSearchParams(window.location.search);
  const viewMode = urlParams.get('view');
  const paperUrl = urlParams.get('paperUrl');
  const paperId = extractSsrnIdOrUrl(paperUrl) || urlParams.get('paperID');

  // Only show error if no paper ID is found
  if (!paperId) {
    updateStatus('No paper ID provided. Please open the analysis from the extension popup.', true);
    return;
  }

  // If we have a paperID, we're viewing an existing analysis - hide upload section and analyze button immediately
  if (paperId) {
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
          paperMeta.textContent = `Paper ID: ${analysis.data.content.paperId || ''} | Authors: ${authors} | Analyzed: ${analyzed}`;
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
          // Clean up any potential HTML or script tags for security
          summary = summary
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>/g, '');
            
          const html = markdownToHtml(summary);
          if (html) {
            // Show the analysis content structure
            if (analysisContent) {
              analysisContent.style.display = 'block';
            }
            
            // Set paper information if available
            if (analysis.content) {
              if (paperTitle && analysis.content.title) {
                paperTitle.textContent = analysis.content.title;
              }
              if (paperMeta) {
                let metaInfo = `Paper ID: ${paperId}`;
                if (analysis.content.authors && analysis.content.authors.length > 0) {
                  metaInfo += ` | Authors: ${analysis.content.authors.join(', ')}`;
                }
                if (analysis.timestamp) {
                  metaInfo += ` | Analyzed: ${new Date(analysis.timestamp).toLocaleDateString()}`;
                }
                paperMeta.textContent = metaInfo;
              }
              if (paperInfo) {
                paperInfo.style.display = 'block';
              }
            }
            
            summaryDiv.innerHTML = html;
            console.log('Successfully rendered analysis summary');
            
            // Show chat section if we have content
            if (analysis.content && (analysis.content.paperContent || analysis.content.abstract)) {
              currentPdfContent = analysis.content;
              chatSection.style.display = 'block';
              console.log('Chat enabled: Paper content loaded');
            }
          } else {
            throw new Error('Failed to convert summary to HTML');
          }
        } catch (error) {
          console.error('Error rendering summary:', error);
          summaryDiv.innerHTML = '<div class="markdown-content"><p>Error: Could not display analysis summary. Please try regenerating the analysis.</p><p>Error details: ' + error.message + '</p></div>';
          updateStatus('Error displaying analysis summary', true);
          
          // Show analyze button for regeneration
          if (analyzeBtn) {
            analyzeBtn.style.display = 'inline-block';
            analyzeBtn.style.backgroundColor = '#2196F3';
            analyzeBtn.textContent = 'Regenerate Analysis';
            analyzeBtn.onclick = async () => {
              if (analysis && analysis.content) {
                await analyzePaper(analysis.content);
              } else {
                updateStatus('No paper content available for reanalysis', true);
              }
            };
          }
        }
      } else {
        console.warn('Invalid or missing summary in analysis data:', summary);
        summaryDiv.innerHTML = '<div class="markdown-content"><p>Error: The analysis summary is missing or invalid. Please try regenerating the analysis.</p></div>';
        updateStatus('Error: Invalid analysis data', true);
        
        // Show analyze button for regeneration
        if (analyzeBtn) {
          analyzeBtn.style.display = 'inline-block';
          analyzeBtn.style.backgroundColor = '#2196F3';
          analyzeBtn.textContent = 'Regenerate Analysis';
          analyzeBtn.onclick = async () => {
            if (analysis && analysis.content) {
              await analyzePaper(analysis.content);
            } else {
              updateStatus('No paper content available for reanalysis', true);
            }
          };
        }
      }
      
      // Display author analysis if available
      if (analysis && analysis.data?.author_data) {
        try {
          displayAuthorAnalysis(analysis.data.author_data);
          if (viewAuthorsBtn) {
            viewAuthorsBtn.style.display = 'inline-block';
            viewAuthorsBtn.style.backgroundColor = '#4CAF50';
            const authorCount = analysis.data.author_data.summary?.total_authors || 0;
            const citationCount = analysis.data.author_data.summary?.total_citations || 0;
            updateStatus(`Author profiles available: ${authorCount} authors with ${citationCount.toLocaleString()} total citations`);
          }
        } catch (error) {
          console.error('Error displaying author analysis:', error);
          updateStatus('Error displaying author analysis', true);
        }
      } else {
        if (viewAuthorsBtn) {
          viewAuthorsBtn.style.display = 'none';
        }
      }
    } else {
      updateStatus('No analysis found for this paper. Please analyze the paper first.', true);
      
      // Show upload section if no analysis is found
      if (uploadSection) {
        uploadSection.style.display = 'block';
      }
      
      // Show analyze button
      if (analyzeBtn) {
        analyzeBtn.style.display = 'inline-block';
        analyzeBtn.style.backgroundColor = '#2196F3';
        analyzeBtn.textContent = 'Analyze Paper';
      }
    }

    // After rendering analysis and author analysis, control visibility based on viewMode
    if (viewMode === 'authors') {
      // Hide summary and chat sections
      if (summaryDiv) summaryDiv.style.display = 'none';
      if (chatSection) chatSection.style.display = 'none';
      // Show only the author analysis container if it exists
      const authorAnalysis = document.querySelector('.author-analysis-container');
      if (authorAnalysis) authorAnalysis.style.display = 'block';
    } else {
      // Default: show summary and chat, hide author analysis (handled by displayAuthorAnalysis)
      if (summaryDiv) summaryDiv.style.display = 'block';
      if (chatSection) chatSection.style.display = 'block';
      const authorAnalysis = document.querySelector('.author-analysis-container');
      if (authorAnalysis) authorAnalysis.style.display = '';
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
            }
          });
        }
      });
    }
  } else {
    console.warn('backBtn not found');
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearContent);
  } else {
    console.warn('clearBtn not found');
  }

  if (uploadBtn && pdfUpload) {
    
        uploadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      pdfUpload.click();
    });
    
    // Make the entire upload section clickable
    if (uploadSection) {
      uploadSection.addEventListener('click', function(e) {
        // Don't trigger if clicking on the upload button
        if (e.target.id === 'uploadBtn' || e.target === uploadBtn || e.target.closest('button')) {
          return;
        }
        
        // Trigger file picker for any other click in the upload section
        e.preventDefault();
        e.stopPropagation();
        pdfUpload.click();
      });
    }
    
    pdfUpload.addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (file) {
        if (file.type === 'application/pdf') {
          handlePdfUpload(file);
        } else {
          updateStatus('Please select a PDF file only. Supported format: .pdf', true);
          pdfUpload.value = '';
        }
      }
    });
  }

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

  if (viewAuthorsBtn) {
    viewAuthorsBtn.addEventListener('click', function() {
      window.location.href = '/fullpage.html?paperID=' + encodeURIComponent(paperId) + '&view=authors';
    });
  } else {
    console.warn('viewAuthorsBtn not found');
  }

  // Add drag and drop functionality only if uploadSection exists
  if (uploadSection) {
    console.log('Setting up drag and drop functionality for PDF upload');
    
    uploadSection.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadSection.classList.add('dragover');
    });

    uploadSection.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove dragover if we're actually leaving the upload section
      if (!uploadSection.contains(e.relatedTarget)) {
        uploadSection.classList.remove('dragover');
      }
    });

    uploadSection.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadSection.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === 'application/pdf') {
          console.log('PDF file dropped, starting upload:', file.name);
          handlePdfUpload(file);
        } else {
          console.warn('Non-PDF file dropped:', file.type);
          updateStatus('Please upload a PDF file only. Supported format: .pdf', true);
        }
      } else {
        updateStatus('No file detected. Please try again.', true);
      }
    });
    
      console.log('Drag and drop functionality set up successfully');
} else {
  console.warn('uploadSection not found - drag and drop functionality will not be available');
}





}); 