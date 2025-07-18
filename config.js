// Configuration for SSRN Paper Summarizer Extension
const CONFIG = {
  // Backend configuration with priority order
  BACKENDS: {
    LOCAL_DEV: {
      url: 'http://localhost:8080',
      name: 'Local Development',
      priority: 1,
      enabled: true
    },
    CLOUD_RUN: {
      url: 'https://ssrn-summarizer-backend-v1-3-0-pisqy7uvxq-uc.a.run.app',
      name: 'Cloud Run',
      priority: 3,
      enabled: true
    }
  },
  
  // Current backend (will be set dynamically)
  BACKEND_URL: null,
  CURRENT_BACKEND: null,
  
  // API endpoints
  ANALYZE_ENDPOINT: '/analyze',
  CHAT_ENDPOINT: '/chat',
  HEALTH_ENDPOINT: '/health',
  VERSION_ENDPOINT: '/version',
  ANALYZE_AUTHORS_ENDPOINT: '/analyze-authors',
  // SSE streaming endpoint for progressive analysis
  ANALYZE_STREAM_ENDPOINT: '/analyze-stream',
  
  // Timeouts
  REQUEST_TIMEOUT: 60000, // 60 seconds for local (increased from 10)
  CLOUD_REQUEST_TIMEOUT: 120000, // 120 seconds for cloud (increased from 30)
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  HEALTH_CHECK_TIMEOUT: 5000, // 5 seconds for health checks
  
  // Analysis settings
  MAX_CONTENT_LENGTH: 50000, // characters
  ANALYSIS_CACHE_DURATION: 5 * 60 * 1000, // 5 minutes in milliseconds
  
  // Backend detection settings
  BACKEND_CACHE_DURATION: 2 * 60 * 1000, // Cache backend choice for 2 minutes
  AUTO_DETECT_BACKENDS: true, // Enable automatic backend detection
  PREFER_LOCAL: true, // Prefer local backends over cloud
};

// Smart backend detection and selection
class BackendManager {
  // Get ordered list of backends by priority
  static getBackendsByPriority() {
    return Object.entries(CONFIG.BACKENDS)
      .filter(([key, backend]) => backend.enabled)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([key, backend]) => ({ key, ...backend }));
  }

  // Check if a backend is healthy
  static async checkBackendHealth(backend) {
    try {
      console.log(`Checking health of ${backend.name} (${backend.url})`);
      const timeout = backend.url.includes('localhost') 
        ? CONFIG.HEALTH_CHECK_TIMEOUT 
        : CONFIG.HEALTH_CHECK_TIMEOUT * 2;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${backend.url}${CONFIG.HEALTH_ENDPOINT}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${backend.name} is healthy:`, data);
        return true;
      } else {
        console.log(`❌ ${backend.name} returned status:`, response.status);
        return false;
      }
    } catch (error) {
      console.log(`❌ ${backend.name} health check failed:`, error.message);
      return false;
    }
  }

  // Find the best available backend (no cache)
  static async detectBestBackend() {
    console.log('🔍 Detecting best available backend (per-tab)...');
    const backends = BackendManager.getBackendsByPriority();
    for (const backend of backends) {
      const isHealthy = await BackendManager.checkBackendHealth(backend);
      if (isHealthy) {
        console.log(`✅ Selected backend: ${backend.name} (${backend.url})`);
        // cache the result
        BackendManager._currentBackend = backend;
        BackendManager._lastDetection = Date.now();
        return backend;
      }
    }
    console.log('❌ No healthy backends found');
    return null;
  }

  // Cached backend accessor
  static async getCurrentBackend() {
    const now = Date.now();
    if (BackendManager._currentBackend && BackendManager._lastDetection &&
        now - BackendManager._lastDetection < CONFIG.BACKEND_CACHE_DURATION) {
      return BackendManager._currentBackend;
    }
    return await BackendManager.detectBestBackend();
  }

  // Force re-detect backend regardless of cache
  static async refreshBackend() {
    BackendManager._currentBackend = null;
    BackendManager._lastDetection = 0;
    return await BackendManager.detectBestBackend();
  }
}

// Helper function to get full API URL with explicit backend
function getApiUrlWithBackend(endpoint, backend) {
  if (!backend) {
    throw new Error('No backend provided');
  }
  return `${backend.url}${endpoint}`;
}

// Helper function to make API requests with explicit backend
async function makeApiRequestWithBackend(endpoint, options = {}, backend) {
  if (!backend) {
    throw new Error('No backend provided');
  }
  const url = `${backend.url}${endpoint}`;
  const timeout = backend.url.includes('localhost') 
    ? CONFIG.REQUEST_TIMEOUT 
    : CONFIG.CLOUD_REQUEST_TIMEOUT;
  console.log(`Making API request to ${backend.name}: ${url}`);
  
  // Get extension version for the request
  const manifest = chrome?.runtime?.getManifest?.();
  const extensionVersion = manifest ? `v${manifest.version}` : 'unknown';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': extensionVersion,
        ...options.headers
      }
    });
    clearTimeout(timeoutId);
    
    // Check for version warnings in successful responses
    if (response.ok && window.checkResponseForVersionWarning) {
      response.clone().json().then(data => {
        if (data.version_warning) {
          window.checkResponseForVersionWarning(data.version_warning);
        }
      }).catch(() => {}); // Ignore errors for this check
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.log(`Request to ${backend.name} timed out`);
    } else {
      console.log(`Request to ${backend.name} failed:`, error.message);
    }
    throw error;
  }
}

// Helper: auto-detect backend and make a non-stream request
async function makeApiRequest(endpoint, options = {}) {
  const backend = await BackendManager.detectBestBackend();
  if (!backend) {
    throw new Error('No healthy backend available');
  }
  return makeApiRequestWithBackend(endpoint, options, backend);
}

// Helper: perform SSE streaming request
function makeStreamRequest(endpoint, bodyObj = {}, onEvent = () => {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const backend = await BackendManager.detectBestBackend();
      if (!backend) {
        throw new Error('No healthy backend available');
      }
      const url = `${backend.url}${endpoint}`;
      console.log(`📡 Starting SSE request to ${backend.name}: ${url}`);
      
      // Get extension version for the request
      const manifest = chrome?.runtime?.getManifest?.();
      const extensionVersion = manifest ? `v${manifest.version}` : 'unknown';
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-Extension-Version': extensionVersion
        },
        body: JSON.stringify(bodyObj)
      });
      if (!response.ok) {
        reject(new Error(`Backend error: ${response.status}`));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.replace(/^data:\s*/, '');
          if (!jsonStr) continue;
          let evt;
          try { evt = JSON.parse(jsonStr); } catch (e) { console.warn('SSE parse error', e, jsonStr); continue; }
          try { onEvent(evt); } catch (cbErr) { console.warn('onEvent error', cbErr); }
          if (evt.status === 'done') {
            // Check for version warnings in the final response
            if (evt.version_warning && window.showVersionWarningFromAPI) {
              window.showVersionWarningFromAPI(evt.version_warning);
            }
            return resolve(evt);
          }
          if (evt.status === 'error') return reject(new Error(evt.message || 'Analysis error'));
        }
      }
      reject(new Error('Stream ended without completion'));
    } catch (err) {
      reject(err);
    }
  });
}

// Initialize backend detection when config loads
console.log('🔧 Backend Manager initialized');
console.log('📊 Available backends:', Object.keys(CONFIG.BACKENDS));
console.log('⚙️ Auto-detect enabled:', CONFIG.AUTO_DETECT_BACKENDS);
console.log('🏠 Prefer local:', CONFIG.PREFER_LOCAL);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, getApiUrlWithBackend };
} 

// Attach helpers to window for browser context
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
  window.BackendManager = BackendManager;
  window.backendManager = BackendManager; // legacy alias
  window.getApiUrlWithBackend = getApiUrlWithBackend;
  window.makeApiRequestWithBackend = makeApiRequestWithBackend;
  window.makeApiRequest = makeApiRequest;
  window.makeStreamRequest = makeStreamRequest;
} 