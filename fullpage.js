document.addEventListener('DOMContentLoaded', function() {
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

  let currentPdfContent = null;

  // Function to clear all content
  async function clearContent() {
    try {
      // Clear storage
      await chrome.storage.local.remove(['lastAnalysis']);
      
      // Clear UI elements
      clearStatus();
      summaryDiv.innerHTML = '';
      chatMessages.innerHTML = '';
      chatSection.style.display = 'none';
      currentPdfContent = null;
      
      // Reset file input
      pdfUpload.value = '';
      
      updateStatus('Content cleared successfully');
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
      console.error('Error processing PDF:', error);
      updateStatus(`Error: ${error.message}`, true);
    }
  }

  // Function to analyze paper
  async function analyzePaper(content = null) {
    try {
      if (!content) {
        clearStatus();
        updateStatus('Starting paper analysis...');
        
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        updateStatus(`Current tab: ${tab.url}`);
        
        if (!tab.url) {
          throw new Error('No active tab found');
        }

        // Check if we're on a valid page
        if (!tab.url.includes('ssrn.com') && !tab.url.toLowerCase().endsWith('.pdf')) {
          throw new Error('Please navigate to an SSRN paper page or open a PDF file');
        }

        updateStatus('Checking page type...');
        if (tab.url.toLowerCase().endsWith('.pdf')) {
          updateStatus('PDF file detected');
        } else {
          updateStatus('SSRN page detected');
        }

        updateStatus('Requesting content from page...');
        // Request content from the content script
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperContent' });
        
        if (response.error) {
          throw new Error(response.error);
        }

        if (!response.content) {
          throw new Error('No content received from the page');
        }

        content = response.content;
      }

      updateStatus('Content received, preparing for analysis...');
      updateStatus(`Title: ${content.title || 'No title found'}`);
      updateStatus(`Abstract length: ${content.abstract?.length || 0} characters`);
      updateStatus(`Authors: ${content.authors?.length || 0} found`);
      updateStatus(`Has PDF content: ${content.hasPdf ? 'Yes' : 'No'}`);

      updateStatus('Sending content to server for analysis...');
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
      chrome.storage.local.set({
        lastAnalysis: {
          timestamp: new Date().toISOString(),
          url: content.paperUrl,
          title: content.title,
          summary: data.summary,
          content: content
        }
      });
      
    } catch (error) {
      console.error('Error:', error);
      updateStatus(`Error: ${error.message}`, true);
    }
  }

  // Function to add message to chat
  function addMessage(message, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
    
    // Convert markdown to HTML for assistant messages
    if (!isUser) {
      messageDiv.innerHTML = markdownToHtml(message);
    } else {
      messageDiv.textContent = message;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Function to handle chat
  async function handleChat(message) {
    try {
      addMessage(message, true);
      chatInput.value = '';
      
      // Get the last analysis from storage
      const result = await chrome.storage.local.get(['lastAnalysis']);
      if (!result.lastAnalysis) {
        addMessage('No paper has been analyzed yet. Please analyze a paper first.');
        return;
      }

      updateStatus('Processing chat message...');
      
      // Use smart backend detection for chat requests
      try {
        const serverResponse = await makeApiRequest(CONFIG.CHAT_ENDPOINT, {
          method: 'POST',
          body: JSON.stringify({
            message: message,
            paper: {
              title: result.lastAnalysis.title,
              abstract: result.lastAnalysis.content?.abstract || '',
              paperContent: result.lastAnalysis.content?.paperContent || '',
              summary: result.lastAnalysis.summary
            }
          })
        });

        if (serverResponse.ok) {
          const data = await serverResponse.json();
          if (data.error) {
            throw new Error(data.error);
          }
          addMessage(data.response);
          updateStatus('Chat message processed successfully');
          return;
        } else {
          const errorText = await serverResponse.text();
          throw new Error(`Backend error: ${serverResponse.status} - ${errorText}`);
        }
      } catch (error) {
        console.error('Error in smart backend chat request:', error);
        addMessage(`Error: ${error.message}`);
        updateStatus(`Chat error: ${error.message}`, true);
      }
      
    } catch (error) {
      console.error('Error in chat:', error);
      addMessage(`Error: ${error.message}`);
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

  if (viewMode === 'authors') {
    // Load author analysis data
    chrome.storage.local.get(['lastAuthorAnalysis', 'lastAnalysis'], function(result) {
      if (result.lastAuthorAnalysis) {
        // Use dedicated author analysis if available
        const authorAnalysis = result.lastAuthorAnalysis;
        displayAuthorAnalysis(authorAnalysis.data);
        updateStatus(`Loaded author analysis from ${new Date(authorAnalysis.timestamp).toLocaleString()}`);
      } else if (result.lastAnalysis && result.lastAnalysis.content && result.lastAnalysis.content.authors) {
        // Extract author information from current paper analysis
        console.log('No dedicated author analysis found, extracting from current paper analysis...');
        
        const paperAnalysis = result.lastAnalysis;
        const authors = paperAnalysis.content.authors || [];
        const affiliations = paperAnalysis.content.affiliations || [];
        
        if (authors.length > 0) {
          // Create author analysis data structure from paper analysis
          const authorAnalysisData = {
            authors: authors.map((author, index) => {
              const affiliation = affiliations[index] || 'Unknown';
              return {
                name: author,
                affiliation: affiliation,
                // Note: This will have limited data since we don't have full profiles
                // from the paper analysis, but it shows the current paper's authors
                citations: 0,
                h_index: 0,
                i10_index: 0,
                ft50_count: 0,
                ft50_journals: [],
                most_cited_papers: [],
                research_areas: [],
                publications: [],
                profile_url: null,
                note: 'Author information extracted from current paper analysis. For detailed profiles, use the "Analyze Authors" feature.'
              };
            }),
            summary: {
              total_authors: authors.length,
              total_ft50_publications: 0,
              total_citations: 0,
              max_h_index: 0,
              unique_ft50_journals: [],
              research_areas: []
            }
          };
          
          displayAuthorAnalysis(authorAnalysisData);
          updateStatus(`Showing authors from current paper analysis (${authors.length} authors found)`);
        } else {
          updateStatus('No authors found in current paper analysis.', true);
          summaryDiv.innerHTML = '<p>No authors found in the current paper analysis. Please analyze a paper first or use the "Analyze Authors" feature for detailed profiles.</p>';
        }
      } else {
        updateStatus('No author analysis data found. Please analyze authors first.', true);
        summaryDiv.innerHTML = '<p>No author analysis data available. Please go back and analyze authors first, or analyze a paper to see basic author information.</p>';
      }
      
      // Hide chat section for author analysis
      chatSection.style.display = 'none';
      
      // Hide upload section for author analysis  
      uploadSection.style.display = 'none';
      
      // Update page title
      document.querySelector('.header h1').textContent = 'Author Analysis Results';
    });
  } else {
    // Load regular paper analysis (existing functionality)
    chrome.storage.local.get(['lastAnalysis'], function(result) {
      if (result.lastAnalysis) {
        const analysis = result.lastAnalysis;
        const html = markdownToHtml(analysis.summary);
        summaryDiv.innerHTML = html;
        
        // Show appropriate status message
        if (analysis.autoAnalyzed) {
          updateStatus(`DONE: PDF automatically analyzed at ${new Date(analysis.timestamp).toLocaleString()}`);
          updateStatus('Analysis completed automatically when PDF was loaded');
        } else {
          updateStatus(`Loaded last analysis from ${new Date(analysis.timestamp).toLocaleString()}`);
        }
        
        chatSection.style.display = 'block';
        
        // Store the content for chat functionality
        currentPdfContent = analysis.content;
      }
    });
  }

  // Event listeners
  analyzeBtn.addEventListener('click', () => analyzePaper());
  
  backBtn.addEventListener('click', function() {
    window.close();
  });

  clearBtn.addEventListener('click', clearContent);

  // PDF upload handlers
  uploadBtn.addEventListener('click', () => pdfUpload.click());
  
  pdfUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handlePdfUpload(file);
    }
  });

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

  // Chat handlers
  sendBtn.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message) {
      handleChat(message);
    }
  });

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const message = chatInput.value.trim();
      if (message) {
        handleChat(message);
      }
    }
  });
}); 