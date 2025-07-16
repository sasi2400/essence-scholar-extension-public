// Debug test script for SSRN Summarizer Extension
// This script helps identify common issues with the extension

console.log('=== SSRN Summarizer Extension Debug Test ===');

// Test 1: Check if extension is loaded
function testExtensionLoaded() {
  console.log('Test 1: Extension Loading');
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      console.log('✅ Chrome extension API available');
      console.log('Extension ID:', chrome.runtime.id);
      return true;
    } else {
      console.log('❌ Chrome extension API not available');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking extension:', error);
    return false;
  }
}

// Test 2: Check if background script is running
async function testBackgroundScript() {
  console.log('Test 2: Background Script');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'ping' });
    if (response && response.success) {
      console.log('✅ Background script is running');
      return true;
    } else {
      console.log('❌ Background script not responding properly');
      return false;
    }
  } catch (error) {
    console.log('❌ Error communicating with background script:', error);
    return false;
  }
}

// Test 3: Check if content script is injected
function testContentScript() {
  console.log('Test 3: Content Script');
  try {
    // Check if we're on a chrome-extension page (like debug test page)
    if (window.location.protocol === 'chrome-extension:') {
      console.log('ℹ️ On chrome-extension page - content script test not applicable');
      return true; // Skip this test for extension pages
    }
    
    if (window.ssrnSummarizerInitialized) {
      console.log('✅ Content script is initialized');
      return true;
    } else {
      console.log('❌ Content script not initialized');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking content script:', error);
    return false;
  }
}

// Test 4: Check current page type
function testPageType() {
  console.log('Test 4: Page Type Detection');
  try {
    const url = window.location.href;
    const isSSRN = url.includes('ssrn.com');
    const isPDF = url.toLowerCase().endsWith('.pdf') || url.startsWith('file:///');
    const isExtensionPage = url.startsWith('chrome-extension://');
    const contentType = document.contentType;
    
    console.log('Current URL:', url);
    console.log('Content Type:', contentType);
    console.log('Is SSRN:', isSSRN);
    console.log('Is PDF:', isPDF);
    console.log('Is Extension Page:', isExtensionPage);
    
    if (isSSRN || isPDF) {
      console.log('✅ Valid page type detected');
      return true;
    } else if (isExtensionPage) {
      console.log('ℹ️ Extension page - page type test not applicable');
      return true; // Skip this test for extension pages
    } else {
      console.log('❌ Not a valid page type for analysis');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking page type:', error);
    return false;
  }
}

// Test 5: Check backend connectivity
async function testBackendConnectivity() {
  console.log('Test 5: Backend Connectivity');
  try {
    // Test Cloud Run backend
            const response = await fetch('https://ssrn-summarizer-backend-pisqy7uvxq-uc.a.run.app/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      console.log('✅ Cloud Run backend is accessible');
      return true;
    } else {
      console.log('❌ Cloud Run backend returned status:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Error connecting to Cloud Run backend:', error);
    
    // Try localhost fallback
    try {
      const localResponse = await fetch('http://localhost:5000/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (localResponse.ok) {
        console.log('✅ Local backend is accessible');
        return true;
      } else {
        console.log('❌ Local backend returned status:', localResponse.status);
        return false;
      }
    } catch (localError) {
      console.log('❌ Error connecting to local backend:', localError);
      return false;
    }
  }
}

// Test 6: Check extension permissions
function testPermissions() {
  console.log('Test 6: Extension Permissions');
  try {
    const permissions = chrome.runtime.getManifest().permissions;
    const hostPermissions = chrome.runtime.getManifest().host_permissions;
    
    console.log('Permissions:', permissions);
    console.log('Host Permissions:', hostPermissions);
    
    const requiredPermissions = ['storage', 'tabs', 'activeTab'];
          const requiredHosts = ['https://*.ssrn.com/*', 'file:///*', 'https://ssrn-summarizer-backend-pisqy7uvxq-uc.a.run.app/*'];
    
    const missingPermissions = requiredPermissions.filter(p => !permissions.includes(p));
    const missingHosts = requiredHosts.filter(h => !hostPermissions.includes(h));
    
    if (missingPermissions.length === 0 && missingHosts.length === 0) {
      console.log('✅ All required permissions are present');
      return true;
    } else {
      console.log('❌ Missing permissions:', missingPermissions);
      console.log('❌ Missing host permissions:', missingHosts);
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking permissions:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('Starting debug tests...\n');
  
  const results = {
    extensionLoaded: testExtensionLoaded(),
    backgroundScript: await testBackgroundScript(),
    contentScript: testContentScript(),
    pageType: testPageType(),
    backendConnectivity: await testBackendConnectivity(),
    permissions: testPermissions()
  };
  
  console.log('\n=== Test Results Summary ===');
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${test}: ${result ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  const passedTests = Object.values(results).filter(r => r).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Extension should be working properly.');
  } else {
    console.log('⚠️  Some tests failed. Check the logs above for details.');
  }
  
  return results;
}

// Make functions available globally for the HTML page
if (typeof window !== 'undefined') {
  window.runAllTests = runAllTests;
  window.testExtensionLoaded = testExtensionLoaded;
  window.testBackgroundScript = testBackgroundScript;
  window.testContentScript = testContentScript;
  window.testPageType = testPageType;
  window.testBackendConnectivity = testBackendConnectivity;
  window.testPermissions = testPermissions;
}

// HTML page specific functions
if (typeof window !== 'undefined' && window.location.href.includes('debug_test.html')) {
  // Override console.log to capture logs
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  function addLog(message, type = 'log') {
    const logsDiv = document.getElementById('logs');
    if (logsDiv) {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = document.createElement('div');
      logEntry.textContent = `[${timestamp}] ${message}`;
      logEntry.className = type;
      logsDiv.appendChild(logEntry);
      logsDiv.scrollTop = logsDiv.scrollHeight;
    }
  }
  
  console.log = function(...args) {
    originalLog.apply(console, args);
    addLog(args.join(' '), 'log');
  };
  
  console.error = function(...args) {
    originalError.apply(console, args);
    addLog(args.join(' '), 'error');
  };
  
  console.warn = function(...args) {
    originalWarn.apply(console, args);
    addLog(args.join(' '), 'warn');
  };
  
  function showResult(elementId, content, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
      element.innerHTML = `<div class="result ${type}">${content}</div>`;
    }
  }
  
  function clearResults() {
    const elements = ['test-results', 'backend-results', 'content-results'];
    elements.forEach(id => {
      const element = document.getElementById(id);
      if (element) element.innerHTML = '';
    });
    
    const statusElement = document.getElementById('overall-status');
    if (statusElement) {
      statusElement.innerHTML = 'Results cleared';
      statusElement.className = 'status info';
    }
  }
  
  function clearLogs() {
    const logsDiv = document.getElementById('logs');
    if (logsDiv) {
      logsDiv.innerHTML = '';
    }
  }
  
  async function runAllTestsUI() {
    try {
      showResult('test-results', 'Running tests...', 'info');
      
      // Call the function from debug_test.js
      const results = await window.runAllTests();
      
      let summary = 'Test Results:\n';
      Object.entries(results).forEach(([test, result]) => {
        summary += `${test}: ${result ? '✅ PASS' : '❌ FAIL'}\n`;
      });
      
      const passedTests = Object.values(results).filter(r => r).length;
      const totalTests = Object.keys(results).length;
      
      summary += `\nOverall: ${passedTests}/${totalTests} tests passed`;
      
      if (passedTests === totalTests) {
        showResult('test-results', summary, 'success');
        const statusElement = document.getElementById('overall-status');
        if (statusElement) {
          statusElement.innerHTML = '🎉 All tests passed! Extension should be working properly.';
          statusElement.className = 'status success';
        }
      } else {
        showResult('test-results', summary, 'error');
        const statusElement = document.getElementById('overall-status');
        if (statusElement) {
          statusElement.innerHTML = '⚠️ Some tests failed. Check the logs for details.';
          statusElement.className = 'status warning';
        }
      }
      
    } catch (error) {
      showResult('test-results', `Error running tests: ${error.message}`, 'error');
      const statusElement = document.getElementById('overall-status');
      if (statusElement) {
        statusElement.innerHTML = '❌ Error running tests';
        statusElement.className = 'status error';
      }
    }
  }
  
  async function testBackend() {
    try {
      showResult('backend-results', 'Testing backend connectivity...', 'info');
      
      // Test Cloud Run
      const response = await fetch('https://ssrn-summarizer-backend-pisqy7uvxq-uc.a.run.app/health');
      const result = await response.text();
      
      if (response.ok) {
        showResult('backend-results', `✅ Cloud Run Backend: ${result}`, 'success');
      } else {
        showResult('backend-results', `❌ Cloud Run Backend: ${response.status} - ${result}`, 'error');
      }
      
    } catch (error) {
      showResult('backend-results', `❌ Backend test failed: ${error.message}`, 'error');
    }
  }
  
  async function testAnalyze() {
    try {
      showResult('backend-results', 'Testing analyze endpoint...', 'info');
      
      const testContent = {
        title: 'Test Paper',
        abstract: 'This is a test abstract',
        authors: ['Test Author'],
        paperUrl: 'https://test.com/paper'
      };
      
      const response = await fetch('https://ssrn-summarizer-backend-pisqy7uvxq-uc.a.run.app/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: testContent })
      });
      
      const result = await response.text();
      
      if (response.ok) {
        showResult('backend-results', `✅ Analyze endpoint: ${result.substring(0, 200)}...`, 'success');
      } else {
        showResult('backend-results', `❌ Analyze endpoint: ${response.status} - ${result}`, 'error');
      }
      
    } catch (error) {
      showResult('backend-results', `❌ Analyze test failed: ${error.message}`, 'error');
    }
  }
  
  async function testContentExtraction() {
    try {
      showResult('content-results', 'Testing content extraction...', 'info');
      
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        showResult('content-results', '❌ Chrome extension API not available', 'error');
        return;
      }
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showResult('content-results', '❌ No active tab found', 'error');
        return;
      }
      
      // Check if we're on an extension page
      if (tab.url && tab.url.startsWith('chrome-extension://')) {
        showResult('content-results', 'ℹ️ Content extraction test not applicable on extension pages. Open an SSRN page or PDF to test content extraction.', 'info');
        return;
      }
      
      // Check if content script is injected
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPaperContent' });
        
        if (response && response.content) {
          showResult('content-results', `✅ Content extracted: ${JSON.stringify(response.content, null, 2)}`, 'success');
        } else if (response && response.error) {
          showResult('content-results', `❌ Content extraction error: ${response.error}`, 'error');
        } else {
          showResult('content-results', '❌ No content or error response', 'error');
        }
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          showResult('content-results', `ℹ️ Content script not injected in current tab. This is expected if you're not on an SSRN page or PDF. Try opening an SSRN paper page and testing there.`, 'info');
        } else {
          showResult('content-results', `❌ Content extraction error: ${error.message}`, 'error');
        }
      }
      
    } catch (error) {
      showResult('content-results', `❌ Content extraction test failed: ${error.message}`, 'error');
    }
  }
  
  async function testPDFDetection() {
    try {
      showResult('content-results', 'Testing PDF detection...', 'info');
      
      const url = window.location.href;
      const isPDF = url.toLowerCase().endsWith('.pdf') || url.startsWith('file:///');
      const contentType = document.contentType;
      
      const result = `URL: ${url}\nContent Type: ${contentType}\nIs PDF: ${isPDF}`;
      
      if (isPDF) {
        showResult('content-results', `✅ PDF detected:\n${result}`, 'success');
      } else {
        showResult('content-results', `ℹ️ Not a PDF page:\n${result}`, 'info');
      }
      
    } catch (error) {
      showResult('content-results', `❌ PDF detection test failed: ${error.message}`, 'error');
    }
  }
  
  // Make UI functions available globally
  window.runAllTestsUI = runAllTestsUI;
  window.testBackend = testBackend;
  window.testAnalyze = testAnalyze;
  window.testContentExtraction = testContentExtraction;
  window.testPDFDetection = testPDFDetection;
  window.clearResults = clearResults;
  window.clearLogs = clearLogs;
  
  // Add a test for real page functionality
  async function testRealPageFunctionality() {
    try {
      showResult('content-results', 'Testing real page functionality...', 'info');
      
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        showResult('content-results', '❌ Chrome extension API not available', 'error');
        return;
      }
      
      // Get all tabs
      const tabs = await chrome.tabs.query({});
      
      // Find SSRN or PDF tabs
      const validTabs = tabs.filter(tab => 
        tab.url && (
          tab.url.includes('ssrn.com') || 
          tab.url.toLowerCase().endsWith('.pdf') ||
          tab.url.startsWith('file:///')
        )
      );
      
      if (validTabs.length === 0) {
        showResult('content-results', `ℹ️ No SSRN or PDF tabs found. 

To test content extraction:
1. Open an SSRN paper page (e.g., https://papers.ssrn.com/sol3/papers.cfm?abstract_id=...)
2. Or open a PDF file in Chrome
3. Then click "Test Real Page Functionality" again

Current tabs: ${tabs.map(t => t.url).join(', ')}`, 'info');
        return;
      }
      
      // Test the first valid tab
      const testTab = validTabs[0];
      showResult('content-results', `Testing tab: ${testTab.url}`, 'info');
      
      try {
        const response = await chrome.tabs.sendMessage(testTab.id, { action: 'getPaperContent' });
        
        if (response && response.content) {
          showResult('content-results', `✅ Content extracted from ${testTab.url}:\n${JSON.stringify(response.content, null, 2)}`, 'success');
        } else if (response && response.error) {
          showResult('content-results', `❌ Content extraction error: ${response.error}`, 'error');
        } else {
          showResult('content-results', '❌ No content or error response', 'error');
        }
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          showResult('content-results', `ℹ️ Content script not injected in tab: ${testTab.url}

This might happen if:
- The page is still loading
- The content script failed to inject
- The page is not in the manifest's matches pattern

Try refreshing the page and testing again.`, 'info');
        } else {
          showResult('content-results', `❌ Error communicating with tab: ${error.message}`, 'error');
        }
      }
      
    } catch (error) {
      showResult('content-results', `❌ Real page test failed: ${error.message}`, 'error');
    }
  }
  
  window.testRealPageFunctionality = testRealPageFunctionality;
  
  // Add a test to check content script injection
  async function testContentScriptInjection() {
    try {
      showResult('content-results', 'Testing content script injection...', 'info');
      
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        showResult('content-results', '❌ Chrome extension API not available', 'error');
        return;
      }
      
      // Get all tabs
      const tabs = await chrome.tabs.query({});
      
      // Find SSRN or PDF tabs
      const validTabs = tabs.filter(tab => 
        tab.url && (
          tab.url.includes('ssrn.com') || 
          tab.url.toLowerCase().endsWith('.pdf') ||
          tab.url.startsWith('file:///')
        )
      );
      
      if (validTabs.length === 0) {
        showResult('content-results', 'ℹ️ No SSRN or PDF tabs found to test content script injection.', 'info');
        return;
      }
      
      let results = [];
      
      for (const tab of validTabs) {
        try {
          // Try to send a ping message to check if content script is injected
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
          results.push(`✅ ${tab.url} - Content script is injected`);
        } catch (error) {
          if (error.message.includes('Receiving end does not exist')) {
            results.push(`❌ ${tab.url} - Content script NOT injected`);
          } else {
            results.push(`⚠️ ${tab.url} - Error: ${error.message}`);
          }
        }
      }
      
      showResult('content-results', `Content Script Injection Test Results:\n\n${results.join('\n')}`, 'info');
      
    } catch (error) {
      showResult('content-results', `❌ Content script injection test failed: ${error.message}`, 'error');
    }
  }
  
  window.testContentScriptInjection = testContentScriptInjection;
  
  // Add event listeners when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Debug test page loaded');
    
    // Add event listeners for buttons
    const buttons = {
      'run-all-tests': runAllTestsUI,
      'clear-results': clearResults,
      'test-backend': testBackend,
      'test-analyze': testAnalyze,
      'test-content-extraction': testContentExtraction,
      'test-pdf-detection': testPDFDetection,
      'test-real-page': testRealPageFunctionality,
      'test-content-script-injection': testContentScriptInjection,
      'clear-logs': clearLogs
    };
    
    Object.entries(buttons).forEach(([id, handler]) => {
      const button = document.getElementById(id);
      if (button) {
        button.addEventListener('click', handler);
      }
    });
    
    // Auto-run basic test
    testExtensionLoaded();
  });
}

// Auto-run tests when script is loaded (only if not in HTML context)
if (typeof window !== 'undefined' && !window.location.href.includes('debug_test.html')) {
  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAllTests);
  } else {
    runAllTests();
  }
}

// Export for manual testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testExtensionLoaded,
    testBackgroundScript,
    testContentScript,
    testPageType,
    testBackendConnectivity,
    testPermissions
  };
} 