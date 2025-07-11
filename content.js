// Prevent multiple script injections
if (window.ssrnSummarizerInitialized) {
  console.log('SSRN Summarizer already initialized, skipping...');
  // Exit early to prevent re-execution
  throw new Error('SSRN Summarizer already initialized');
}

// Mark as initialized immediately to prevent race conditions
window.ssrnSummarizerInitialized = true;

// Create a connection to the background service worker
let port = null;

// Keep track of the current state
let currentState = {
  isInitialized: false,
  content: null
};

// Initialize the content script
function initialize() {
  // Prevent multiple initializations
  if (currentState.isInitialized) {
    console.log('Content script already initialized, skipping...');
    return;
  }
  
  // Double-check window flag to prevent race conditions
  if (window.ssrnSummarizerInitialized && window.ssrnSummarizerInitialized !== true) {
    console.log('Content script initialization already in progress, skipping...');
    return;
  }
  
  console.log('Content script initialized');
  currentState.isInitialized = true;
  
  // Create port connection only if not already connected
  if (!port) {
    try {
      port = chrome.runtime.connect({ name: 'content-script' });
      
      // Notify that we're ready
      port.postMessage({
        action: 'contentScriptReady',
        url: window.location.href
      });
      
      // If this is a PDF page, notify the background script
      if (isPDFPage()) {
        console.log('PDF page detected, notifying background script');
        port.postMessage({
          action: 'pdfDetected',
          url: window.location.href
        });
      }
    } catch (error) {
      console.error('Error creating port connection:', error);
    }
  }
}

// Check if current page is a PDF
function isPDFPage() {
  const isPDF = window.location.href.toLowerCase().endsWith('.pdf') || 
         document.contentType === 'application/pdf' ||
         window.location.protocol === 'file:' ||
         document.querySelector('embed[type="application/pdf"]') ||
         document.querySelector('object[type="application/pdf"]');
  
  console.log('PDF detection check:', {
    url: window.location.href,
    contentType: document.contentType,
    protocol: window.location.protocol,
    hasEmbed: !!document.querySelector('embed[type="application/pdf"]'),
    hasObject: !!document.querySelector('object[type="application/pdf"]'),
    isPDF: isPDF
  });
  
  return isPDF;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'ping') {
    // Simple ping response to check if content script is injected
    sendResponse({ success: true, message: 'Content script is active' });
    return true;
  }
  
  if (request.action === 'getPaperContent') {
    try {
      // Check if we already have the content
      if (currentState.content) {
        console.log('Using cached content');
        sendResponse({ content: currentState.content });
        return true;
      }
      
      // Extract paper content from the page
      console.log('Starting content extraction...');
      extractPaperContent().then(content => {
        console.log('Content extracted successfully:', content);
        currentState.content = content;
        // Update the background service worker
        if (port) {
          try {
            port.postMessage({
              action: 'updateTabState',
              state: { content }
            });
          } catch (error) {
            console.error('Error sending message to background:', error);
          }
        }
        sendResponse({ content });
      }).catch(error => {
        console.error('Error extracting content:', error);
        sendResponse({ error: error.message });
      });
    } catch (error) {
      console.error('Error in message handler:', error);
      sendResponse({ error: error.message });
    }
  }
  return true; // Keep the message channel open for async response
});

// Initialize when the script loads (only if not already initialized)
if (!currentState.isInitialized) {
  // Add a small delay to ensure proper initialization
  setTimeout(() => {
    if (!currentState.isInitialized) {
      initialize();
    }
  }, 100);
}

async function extractPaperContent() {
  console.log('Starting content extraction...');
  
  // Check if we're on a PDF page
  if (isPDFPage()) {
    console.log('PDF page detected');
    return await extractPdfContent();
  }
  
  // If not a PDF, proceed with SSRN page extraction
  return await extractSSRNContent();
}

async function extractPdfContent() {
  try {
    console.log('Preparing PDF content for backend processing...');
    
    // For local files, we need to handle them differently
    if (window.location.protocol === 'file:') {
      console.log('Local PDF file detected');
      
      // Try to read the file content using multiple approaches
      let fileContent = null;
      try {
        console.log('Attempting to read local PDF file content...');
        
        // Method 1: Try using fetch with file:// URL
        try {
          console.log('Method 1: Trying fetch with file:// URL');
          const response = await fetch(window.location.href);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            fileContent = btoa(
              new Uint8Array(arrayBuffer)
                .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            console.log('Successfully read local PDF file content using fetch');
          }
        } catch (fetchError) {
          console.log('Fetch method failed:', fetchError);
        }
        
        // Method 2: Try using XMLHttpRequest
        if (!fileContent) {
          try {
            console.log('Method 2: Trying XMLHttpRequest');
            fileContent = await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', window.location.href, true);
              xhr.responseType = 'arraybuffer';
              xhr.onload = function() {
                if (xhr.status === 200) {
                  const arrayBuffer = xhr.response;
                  const base64 = btoa(
                    new Uint8Array(arrayBuffer)
                      .reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                  resolve(base64);
                } else {
                  reject(new Error(`XHR failed with status: ${xhr.status}`));
                }
              };
              xhr.onerror = function() {
                reject(new Error('XHR request failed'));
              };
              xhr.send();
            });
            console.log('Successfully read local PDF file content using XMLHttpRequest');
          } catch (xhrError) {
            console.log('XMLHttpRequest method failed:', xhrError);
          }
        }
        
        // Method 3: Try using a different approach for local files
        if (!fileContent) {
          try {
            console.log('Method 3: Trying alternative local file reading');
            // For local files, we might need to use a different approach
            // This could involve asking the user to select the file manually
            console.log('Local file reading requires user interaction');
            throw new Error('Local file reading requires user interaction');
          } catch (altError) {
            console.log('Alternative method failed:', altError);
          }
        }
        
      } catch (error) {
        console.log('All file reading methods failed:', error);
      }
      
      // Create a content object with file information
      const content = {
        title: document.title || 'PDF Document',
        paperId: window.location.pathname.split('/').pop(),
        paperUrl: window.location.href,
        isLocalFile: true,
        hasPdf: true,
        isPdf: true,
        abstract: 'PDF content will be extracted by the backend',
        authors: [],
        affiliations: [],
        keywords: []
      };
      
      // For local files, we need to handle them differently
      if (!fileContent) {
        console.log('Local file reading failed, providing file information for manual selection');
        
        // Instead of trying to read the file content directly,
        // we'll provide information about the file and let the user handle it
        content.fileInfo = {
          fileName: window.location.pathname.split('/').pop(),
          filePath: window.location.pathname,
          fileUrl: window.location.href
        };
        
        // Add a note that manual file selection may be required
        content.requiresManualSelection = true;
        content.note = 'Local PDF file detected. If analysis fails, you may need to manually select the file.';
      } else {
        // Add file content to the content object
        content.fileContent = fileContent;
        content.fileName = window.location.pathname.split('/').pop();
      }
      
      console.log('PDF content prepared for backend processing:', content);
      return content;
    } else {
      console.log('Web-hosted PDF detected');
      // For web-hosted PDFs, just send the URL
      const content = {
        title: document.title || 'PDF Document',
        paperId: window.location.pathname.split('/').pop(),
        paperUrl: window.location.href,
        isLocalFile: false,
        hasPdf: true,
        isPdf: true,
        pdfUrl: window.location.href,
        abstract: 'PDF content will be extracted by the backend',
        authors: [],
        affiliations: [],
        keywords: []
      };
      
      console.log('PDF content prepared for backend processing:', content);
      return content;
    }
  } catch (error) {
    console.error('Error preparing PDF content:', error);
    throw error;
  }
}

async function extractSSRNContent() {
  console.log('Extracting content from SSRN page...');
  
  // Get the paper title
  const title = document.querySelector('h1.title')?.textContent?.trim() ||
                document.querySelector('.title-text')?.textContent?.trim() ||
                document.querySelector('h1')?.textContent?.trim() ||
                document.querySelector('.paper-title')?.textContent?.trim();
  console.log('Title:', title);
  
  // Get the abstract
  const abstract = document.querySelector('.abstract-text')?.textContent?.trim() ||
                  document.querySelector('[data-test-id="abstract"]')?.textContent?.trim() ||
                  document.querySelector('.abstract')?.textContent?.trim() ||
                  document.querySelector('#abstract')?.textContent?.trim();
  console.log('Abstract length:', abstract?.length);
  
  // Look for PDF download link first
  const pdfLink = document.querySelector('a[href*=".pdf"]') || 
                 document.querySelector('a[href*="download"]') ||
                 document.querySelector('a[href*="view"]') ||
                 document.querySelector('[data-test-id="download-pdf"]');
  
  let pdfUrl = null;
  if (pdfLink) {
    console.log('PDF link found:', pdfLink.href);
    pdfUrl = pdfLink.href;
    // If it's a relative URL, make it absolute
    if (pdfUrl.startsWith('/')) {
      pdfUrl = new URL(pdfUrl, window.location.origin).href;
    }
  } else {
    console.log('No PDF link found on page');
  }

  // Enhanced author extraction with comprehensive selectors
  let authors = [];
  let affiliations = [];
  let authorAffiliationPairs = [];

  console.log('Starting comprehensive author extraction...');
  
  // Debug: Log page structure for debugging
  console.log('Page HTML structure around authors:');
  const bodyText = document.body.innerHTML;
  const authorMatches = bodyText.match(/author[^>]*>/gi);
  if (authorMatches) {
    console.log('Found potential author elements:', authorMatches.slice(0, 5));
  }

  // Method 1: Try the specific SSRN structure (.authors.authors-full-width)
  console.log('Method 1: Checking for .authors.authors-full-width structure...');
  const authorsFullWidthElement = document.querySelector('.authors.authors-full-width');
  
  if (authorsFullWidthElement) {
    console.log('Found authors-full-width element, extracting detailed author information...');
    
    // Extract authors and their affiliations from the specific structure
    const authorElements = authorsFullWidthElement.querySelectorAll('h2 > a[href*="AbsByAuth.cfm"]');
    
    authorElements.forEach((authorLink, index) => {
      const authorName = authorLink.textContent.trim();
      if (authorName) {
        authors.push(authorName);
        
        // Find the affiliation paragraph that follows this author's h2
        const authorH2 = authorLink.parentElement;
        let affiliationP = authorH2.nextElementSibling;
        
        // Skip any elements that aren't paragraphs until we find one
        while (affiliationP && affiliationP.tagName !== 'P') {
          affiliationP = affiliationP.nextElementSibling;
        }
        
        if (affiliationP && affiliationP.tagName === 'P') {
          const affiliation = affiliationP.textContent.trim();
          if (affiliation) {
            affiliations.push(affiliation);
            authorAffiliationPairs.push({
              author: authorName,
              affiliation: affiliation
            });
          }
        }
      }
    });
    
    console.log('Method 1 - Extracted authors from full-width element:', authors);
    console.log('Method 1 - Extracted affiliations from full-width element:', affiliations);
  }

  // Method 2: Try various author link selectors
  if (authors.length === 0) {
    console.log('Method 2: Trying various author link selectors...');
    const authorLinkSelectors = [
      'a[href*="AbsByAuth.cfm"]',           // SSRN author links
      'a[href*="author"]',                  // Generic author links
      '.author a',                          // Author links in author containers
      '.authors a',                         // Author links in authors containers
      '[data-author] a',                    // Data attribute author links
      '.paper-authors a',                   // Paper authors section links
      '.author-list a'                      // Author list links
    ];

    for (const selector of authorLinkSelectors) {
      const authorLinks = document.querySelectorAll(selector);
      if (authorLinks.length > 0) {
        console.log(`Found ${authorLinks.length} authors using selector: ${selector}`);
        authorLinks.forEach(link => {
          const authorName = link.textContent.trim();
          if (authorName && !authors.includes(authorName)) {
            authors.push(authorName);
          }
        });
        if (authors.length > 0) break;
      }
    }
    console.log('Method 2 - Authors found:', authors);
  }

  // Method 3: Try text-based author extraction (look for patterns)
  if (authors.length === 0) {
    console.log('Method 3: Trying text-based author extraction...');
    const textSelectors = [
      '.author-name',
      '.authors .author',
      '.paper-author',
      '.author-text',
      '[class*="author"]',
      '[id*="author"]',
      '.byline',
      '.paper-byline'
    ];

    for (const selector of textSelectors) {
      const authorElements = document.querySelectorAll(selector);
      if (authorElements.length > 0) {
        console.log(`Found ${authorElements.length} author elements using selector: ${selector}`);
        authorElements.forEach(element => {
          const authorName = element.textContent.trim();
          if (authorName && !authors.includes(authorName)) {
            authors.push(authorName);
          }
        });
        if (authors.length > 0) break;
      }
    }
    console.log('Method 3 - Authors found:', authors);
  }

  // Method 4: Try finding authors in metadata or JSON-LD
  if (authors.length === 0) {
    console.log('Method 4: Trying metadata and structured data...');
    
    // Check for JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.author) {
          if (Array.isArray(data.author)) {
            data.author.forEach(author => {
              const name = author.name || author;
              if (name && !authors.includes(name)) {
                authors.push(name);
              }
            });
          } else if (data.author.name) {
            authors.push(data.author.name);
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
    
    // Check meta tags
    const metaAuthors = document.querySelectorAll('meta[name*="author"], meta[property*="author"]');
    metaAuthors.forEach(meta => {
      const content = meta.getAttribute('content');
      if (content && !authors.includes(content)) {
        authors.push(content);
      }
    });
    
    console.log('Method 4 - Authors found from metadata:', authors);
  }

  // Method 5: Try broad text search for common author patterns
  if (authors.length === 0) {
    console.log('Method 5: Trying broad text search for author patterns...');
    
    // Look for text that contains common author indicators
    const possibleAuthorElements = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const text = el.textContent.toLowerCase();
        return (text.includes('author') || text.includes('by ')) && 
               el.children.length === 0 && // Only leaf nodes
               text.length < 200; // Reasonable length
      });

    possibleAuthorElements.forEach(element => {
      const text = element.textContent.trim();
      // Look for patterns like "By John Doe" or "Author: John Doe"
      const patterns = [
        /(?:by|author[s]?)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi,
        /([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*,\s*([A-Z][a-z]+ [A-Z][a-z]+))*/gi
      ];
      
      patterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const cleanName = match.replace(/^(?:by|authors?)[:\s]+/i, '').trim();
            if (cleanName && !authors.includes(cleanName)) {
              authors.push(cleanName);
            }
          });
        }
      });
    });
    
    console.log('Method 5 - Authors found from text patterns:', authors);
  }

  // Extract affiliations using various methods
  if (affiliations.length === 0) {
    console.log('Extracting affiliations using comprehensive selectors...');
    const affiliationSelectors = [
      '.author-affiliation',
      '.authors .affiliation',
      '.affiliation',
      '.institution',
      '.university',
      '[class*="affiliation"]',
      '[id*="affiliation"]',
      '.author-institution'
    ];

    for (const selector of affiliationSelectors) {
      const affiliationElements = document.querySelectorAll(selector);
      if (affiliationElements.length > 0) {
        console.log(`Found ${affiliationElements.length} affiliations using selector: ${selector}`);
        affiliationElements.forEach(element => {
          const affiliation = element.textContent.trim();
          if (affiliation && !affiliations.includes(affiliation)) {
            affiliations.push(affiliation);
          }
        });
        if (affiliations.length > 0) break;
      }
    }
    console.log('Affiliations found:', affiliations);
  }
  
  // Get keywords
  const keywords = Array.from(document.querySelectorAll('.keyword, [data-test-id="keywords"] .keyword'))
    .map(keyword => keyword.textContent.trim())
    .filter(keyword => keyword); // Remove empty strings
  console.log('Keywords:', keywords);
  
  // Get paper ID and URL
  const paperId = window.location.pathname.split('/').pop() ||
                 new URLSearchParams(window.location.search).get('abstract_id');
  const paperUrl = window.location.href;
  console.log('Paper ID:', paperId);
  
  // Final author extraction summary
  console.log('=== FINAL AUTHOR EXTRACTION SUMMARY ===');
  console.log('Total authors found:', authors.length);
  console.log('Authors:', authors);
  console.log('Total affiliations found:', affiliations.length);
  console.log('Affiliations:', affiliations);
  console.log('Author-affiliation pairs:', authorAffiliationPairs.length);
  
  // Combine all the information
  const content = {
    title,
    abstract,
    authors,
    affiliations,
    keywords,
    paperId,
    paperUrl,
    pdfUrl,
    hasPdf: !!pdfUrl,
    authorAffiliationPairs: authorAffiliationPairs.length > 0 ? authorAffiliationPairs : undefined
  };
  
  // Validate that we have at least some content
  if (!title && !abstract) {
    throw new Error('Could not find paper content on this page');
  }
  
  console.log('SSRN content extraction complete');
  console.log('Final content:', content);
  return content;
}
