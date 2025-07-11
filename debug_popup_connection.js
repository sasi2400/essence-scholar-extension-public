// Debug functionality for popup connection testing
function log(elementId, message, type = 'info') {
  const logArea = document.getElementById(elementId);
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = type;
  logEntry.textContent = `[${timestamp}] ${message}`;
  logArea.appendChild(logEntry);
  logArea.scrollTop = logArea.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
}

function testConfig() {
  const configLog = document.getElementById('configLog');
  configLog.innerHTML = '';
  
  try {
    log('configLog', 'Testing configuration loading...', 'info');
    
    if (typeof CONFIG === 'undefined') {
      log('configLog', '❌ CONFIG is undefined - config.js not loaded properly', 'error');
      return;
    }
    
    log('configLog', '✅ CONFIG object loaded successfully', 'success');
    log('configLog', `Backend URL: ${CONFIG.BACKEND_URL}`, 'info');
    log('configLog', `Analyze endpoint: ${CONFIG.ANALYZE_ENDPOINT}`, 'info');
    log('configLog', `Health endpoint: ${CONFIG.HEALTH_ENDPOINT}`, 'info');
    
    if (typeof getApiUrl === 'undefined') {
      log('configLog', '❌ getApiUrl function is undefined', 'error');
    } else {
      log('configLog', '✅ getApiUrl function available', 'success');
      const fullUrl = getApiUrl(CONFIG.ANALYZE_ENDPOINT);
      log('configLog', `Full API URL: ${fullUrl}`, 'info');
    }
    
  } catch (error) {
    log('configLog', `❌ Error testing config: ${error.message}`, 'error');
  }
}

async function testBackendHealth() {
  const backendLog = document.getElementById('backendLog');
  backendLog.innerHTML = '';
  
  try {
    log('backendLog', 'Testing backend health endpoint...', 'info');
    
    const healthUrl = getApiUrl(CONFIG.HEALTH_ENDPOINT);
    log('backendLog', `Health URL: ${healthUrl}`, 'info');
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    log('backendLog', `Response status: ${response.status}`, 'info');
    log('backendLog', `Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`, 'info');
    
    const responseText = await response.text();
    log('backendLog', `Response body: ${responseText}`, 'info');
    
    if (response.ok) {
      log('backendLog', '✅ Backend health check successful', 'success');
    } else {
      log('backendLog', '❌ Backend health check failed', 'error');
    }
    
  } catch (error) {
    log('backendLog', `❌ Error testing backend health: ${error.message}`, 'error');
  }
}

async function testBackendAnalyze() {
  const backendLog = document.getElementById('backendLog');
  
  try {
    log('backendLog', 'Testing backend analyze endpoint...', 'info');
    
    const analyzeUrl = getApiUrl(CONFIG.ANALYZE_ENDPOINT);
    log('backendLog', `Analyze URL: ${analyzeUrl}`, 'info');
    
    const testContent = {
      title: 'Test Document',
      text: 'This is a test document for debugging purposes.',
      authors: ['Test Author'],
      abstract: 'Test abstract for debugging.'
    };
    
    log('backendLog', `Sending test content: ${JSON.stringify(testContent)}`, 'info');
    
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: testContent })
    });
    
    log('backendLog', `Response status: ${response.status}`, 'info');
    log('backendLog', `Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`, 'info');
    
    const responseText = await response.text();
    log('backendLog', `Response body length: ${responseText.length}`, 'info');
    
    if (response.ok) {
      log('backendLog', '✅ Backend analyze test successful', 'success');
      try {
        const responseData = JSON.parse(responseText);
        log('backendLog', `Response data keys: ${Object.keys(responseData)}`, 'info');
      } catch (parseError) {
        log('backendLog', `Response is not valid JSON: ${responseText.substring(0, 200)}...`, 'info');
      }
    } else {
      log('backendLog', '❌ Backend analyze test failed', 'error');
      log('backendLog', `Error response: ${responseText}`, 'error');
    }
    
  } catch (error) {
    log('backendLog', `❌ Error testing backend analyze: ${error.message}`, 'error');
  }
}

function testExtensionAPI() {
  const extensionLog = document.getElementById('extensionLog');
  extensionLog.innerHTML = '';
  
  try {
    log('extensionLog', 'Testing extension APIs...', 'info');
    
    if (typeof chrome === 'undefined') {
      log('extensionLog', '❌ chrome API not available', 'error');
      return;
    }
    
    log('extensionLog', '✅ chrome API available', 'success');
    
    if (typeof chrome.runtime === 'undefined') {
      log('extensionLog', '❌ chrome.runtime not available', 'error');
    } else {
      log('extensionLog', '✅ chrome.runtime available', 'success');
    }
    
    if (typeof chrome.tabs === 'undefined') {
      log('extensionLog', '❌ chrome.tabs not available', 'error');
    } else {
      log('extensionLog', '✅ chrome.tabs available', 'success');
    }
    
    if (typeof chrome.storage === 'undefined') {
      log('extensionLog', '❌ chrome.storage not available', 'error');
    } else {
      log('extensionLog', '✅ chrome.storage available', 'success');
    }
    
    // Test getting current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        log('extensionLog', `❌ Error getting current tab: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        log('extensionLog', `✅ Current tab: ${tabs[0]?.url || 'No URL'}`, 'success');
      }
    });
    
  } catch (error) {
    log('extensionLog', `❌ Error testing extension APIs: ${error.message}`, 'error');
  }
}

function testContentScript() {
  const contentLog = document.getElementById('contentLog');
  contentLog.innerHTML = '';
  
  try {
    log('contentLog', 'Testing content script communication...', 'info');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        log('contentLog', `❌ Error getting current tab: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      
      const tab = tabs[0];
      log('contentLog', `Current tab ID: ${tab.id}`, 'info');
      log('contentLog', `Current tab URL: ${tab.url}`, 'info');
      
      // Try to send a ping message to content script
      chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          log('contentLog', `❌ Content script not responding: ${chrome.runtime.lastError.message}`, 'error');
        } else {
          log('contentLog', `✅ Content script responded: ${JSON.stringify(response)}`, 'success');
        }
      });
    });
    
  } catch (error) {
    log('contentLog', `❌ Error testing content script: ${error.message}`, 'error');
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners to buttons
  document.getElementById('testConfigBtn').addEventListener('click', testConfig);
  document.getElementById('testHealthBtn').addEventListener('click', testBackendHealth);
  document.getElementById('testAnalyzeBtn').addEventListener('click', testBackendAnalyze);
  document.getElementById('testExtensionBtn').addEventListener('click', testExtensionAPI);
  document.getElementById('testContentBtn').addEventListener('click', testContentScript);
  
  // Auto-run config test on page load
  log('configLog', 'Page loaded, running initial config test...', 'info');
  setTimeout(testConfig, 100);
}); 