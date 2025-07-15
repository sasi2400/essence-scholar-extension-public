
// Prevent multiple script injections
if (window.ssrnSummarizerInitialized) {
  console.log('SSRN Summarizer already initialized, skipping...');
  // Exit early to prevent re-execution
  throw new Error('SSRN Summarizer already initialized');
}

// Mark as initialized immediately to prevent race conditions
window.ssrnSummarizerInitialized = true;

// Create a connection to the background service worker
var port = window.ssrnSummarizerPort = window.ssrnSummarizerPort || null;

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
    sendResponse({ status: 'ok', success: true, message: 'Content script is active' });
    return true;
  }
  
  if (request.action === 'checkContentType') {
    // Check the content type of the current page
    const contentType = document.contentType || '';
    console.log('Content type check:', contentType);
    sendResponse({ contentType: contentType });
    return true;
  }
  
  if (request.action === 'checkPDFElements') {
    // Check for PDF-related elements in the page
    const hasPDFElements = !!(
      document.querySelector('embed[type="application/pdf"]') ||
      document.querySelector('object[type="application/pdf"]') ||
      document.querySelector('iframe[src*="pdf"]') ||
      document.querySelector('canvas[data-pdf-url]') ||
      document.querySelector('[data-pdf-viewer]') ||
      document.querySelector('.pdf-viewer') ||
      document.querySelector('#pdf-viewer')
    );
    console.log('PDF elements check:', hasPDFElements);
    sendResponse({ hasPDFElements: hasPDFElements });
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
      
      // Create a content object with file information
      const fileName = window.location.pathname.split('/').pop();
      const content = {
        title: document.title || fileName || 'PDF Document',
        paperId: fileName,
        paperUrl: window.location.href,
        isLocalFile: true,
        hasPdf: true,
        isPdf: true,
        abstract: 'PDF content will be extracted by the backend',
        authors: [],
        affiliations: [],
        keywords: []
      };
      
      // For local files, provide file information for seamless transition to full page interface
      content.fileInfo = {
        fileName: fileName,
        filePath: window.location.pathname,
        fileUrl: window.location.href
      };
      
      // Mark as local file that should open full page interface
      content.requiresFullPageInterface = true;
      content.localFileInfo = {
        fileName: content.fileInfo.fileName,
        filePath: content.fileInfo.filePath,
        message: `Local PDF detected: ${content.fileInfo.fileName}

The extension will automatically open the Full Page Interface where you can upload this file for analysis.`
      };
      
      console.log('PDF content prepared for backend processing:', content);
      return content;
    }
    
    // For SSRN PDFs, extract the ID from the URL
    const paperId = extractSsrnIdFromUrl(window.location.href);
    
    // Create a content object with paper information
    const content = {
      title: document.title || 'PDF Document',
      paperId: paperId,
      paperUrl: window.location.href,
      hasPdf: true,
      isPdf: true,
      abstract: 'PDF content will be extracted by the backend',
      authors: [],
      affiliations: [],
      keywords: []
    };
    
    console.log('PDF content prepared for backend processing:', content);
    return content;
  } catch (error) {
    console.error('Error preparing PDF content:', error);
    throw new Error('Failed to prepare PDF content: ' + error.message);
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

  // Extract authors - try multiple selectors with improved logic
  let authors = [];
  let affiliations = [];

  console.log('Starting author extraction...');

  // Debug: Log page structure for author elements
  console.log('=== AUTHOR EXTRACTION DEBUG ===');
  console.log('Page URL:', window.location.href);
  console.log('Page title:', document.title);
  
  // Debug: Check what elements exist that might contain authors
  const potentialAuthorElements = document.querySelectorAll('[class*="author"], [data-test*="author"], [id*="author"]');
  console.log(`Found ${potentialAuthorElements.length} potential author elements:`);
  potentialAuthorElements.forEach((el, i) => {
    if (i < 10) { // Log first 10 to avoid spam
      console.log(`  ${i+1}. ${el.tagName}.${el.className} - "${el.textContent.slice(0, 100)}"`);
    }
  });

  // Try modern SSRN selectors first
  const modernAuthorSelectors = [
    'a[href*="/author/"]',  // Author profile links
    '.author-name a',
    '[data-testid="author-name"] a',
    '.authors a[href*="author"]',
    '.author-list a[href*="author"]'
  ];

  // Try each modern selector
  for (const selector of modernAuthorSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`Found ${elements.length} authors using selector: ${selector}`);
      authors = Array.from(elements).map(el => el.textContent.trim()).filter(name => name);
      break;
    }
  }

  // If no authors found with link selectors, try text-based extraction
  if (authors.length === 0) {
    console.log('No authors found with link selectors, trying text-based extraction...');
    
    const textBasedSelectors = [
      '.authors',
      '.author-list', 
      '.authors-list',
      '.author-names',
      '[data-testid="authors"]',
      '.paper-authors',
      '#authors'
    ];

    for (const selector of textBasedSelectors) {
      const authorSection = document.querySelector(selector);
      if (authorSection) {
        console.log(`Found author section with selector: ${selector}`);
        const authorText = authorSection.textContent.trim();
        console.log('Author section text:', authorText);
        
        // Split by common separators and clean up
        authors = authorText
          .split(/[,;]|and\s+/)  // Split by comma, semicolon, or "and"
          .map(name => name.trim())
          .filter(name => 
            name && 
            name.length > 2 && 
            !name.toLowerCase().includes('abstract') && 
            !name.toLowerCase().includes('download') &&
            !name.toLowerCase().includes('view') &&
            !name.toLowerCase().includes('pdf') &&
            !/^\d+$/.test(name)  // Exclude pure numbers
          );
        
        if (authors.length > 0) {
          console.log(`Extracted ${authors.length} authors from text`);
          break;
        }
      }
    }
  }

  // Try to get affiliations with improved selectors
  const affiliationSelectors = [
    '.author-affiliation',
    '.affiliation',
    '[data-testid="author-affiliation"]',
    '.author-info .affiliation',
    '.author-affiliations'
  ];

  for (const selector of affiliationSelectors) {
    const affiliationElements = document.querySelectorAll(selector);
    if (affiliationElements.length > 0) {
      affiliations = Array.from(affiliationElements).map(el => el.textContent.trim()).filter(aff => aff);
      console.log(`Found ${affiliations.length} affiliations`);
      break;
    }
  }

  console.log('Final extracted authors:', authors);
  console.log('Final extracted affiliations:', affiliations);
  
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

  // Get paper ID and URL
  const paperId = extractSsrnIdFromUrl(window.location.href);
  const paperUrl = window.location.href;
  
  // Return the content object
  return {
    title,
    abstract,
    paperId,
    paperUrl,
    pdfUrl,
    hasPdf: !!pdfUrl,
    isPdf: false,
    authors,
    affiliations,
    keywords: []  // Will be extracted by backend
  };
}

// Utility to extract SSRN ID from URL
function extractSsrnIdFromUrl(url) {
  if (!url) return null;
  // Prefer query string: abstract_id or abstractId
  let match = url.match(/[?&]abstract_id=(\\d+)/i);
  if (match) return match[1];
  match = url.match(/[?&]abstractId=(\\d+)/i);
  if (match) return match[1];
  match = url.match(/[?&]abstract=(\\d+)/i);
  if (match) return match[1];
  return url; // fallback: use URL as ID
}
