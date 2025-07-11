// Configuration for SSRN Paper Summarizer Extension
const CONFIG = {
  // Backend configuration with priority order
  BACKENDS: {
    LOCAL_DOCKER: {
      url: 'http://localhost:5001',
      name: 'Local Docker',
      priority: 2,
      enabled: true
    },
    LOCAL_DEV: {
      url: 'http://localhost:5000',
      name: 'Local Development',
      priority: 4,
      enabled: false
    },
    CLOUD_RUN: {
      url: 'https://ssrn-summarizer-backend-pisqy7uvxq-uc.a.run.app',
      name: 'Cloud Run',
      priority: 3,
      enabled: true
    },
    LOCAL_NETWORK: {
      url: 'http://192.168.2.10:8080',
      name: 'Local Network',
      priority: 1,
      enabled: true  // Disabled by default
    }
  },
  
  // Current backend (will be set dynamically)
  BACKEND_URL: null,
  CURRENT_BACKEND: null,
  
  // API endpoints
  ANALYZE_ENDPOINT: '/analyze',
  CHAT_ENDPOINT: '/chat',
  HEALTH_ENDPOINT: '/health',
  ANALYZE_AUTHORS_ENDPOINT: '/analyze-authors',
  
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
  constructor() {
    this.cachedBackend = null;
    this.cacheExpiry = 0;
    this.healthCheckInProgress = false;
  }

  // Get ordered list of backends by priority
  getBackendsByPriority() {
    return Object.entries(CONFIG.BACKENDS)
      .filter(([key, backend]) => backend.enabled)
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([key, backend]) => ({ key, ...backend }));
  }

  // Check if a backend is healthy
  async checkBackendHealth(backend) {
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

  // Find the best available backend
  async detectBestBackend() {
    if (this.healthCheckInProgress) {
      console.log('Health check already in progress, waiting...');
      return this.cachedBackend;
    }

    // Check cache first
    const now = Date.now();
    if (this.cachedBackend && now < this.cacheExpiry) {
      console.log(`Using cached backend: ${this.cachedBackend.name}`);
      return this.cachedBackend;
    }

    this.healthCheckInProgress = true;

    try {
      console.log('🔍 Detecting best available backend...');
      const backends = this.getBackendsByPriority();
      
      for (const backend of backends) {
        const isHealthy = await this.checkBackendHealth(backend);
        if (isHealthy) {
          console.log(`✅ Selected backend: ${backend.name} (${backend.url})`);
          
          // Cache the result
          this.cachedBackend = backend;
          this.cacheExpiry = now + CONFIG.BACKEND_CACHE_DURATION;
          
          // Update global config
          CONFIG.BACKEND_URL = backend.url;
          CONFIG.CURRENT_BACKEND = backend;
          
          return backend;
        }
      }
      
      console.log('❌ No healthy backends found');
      return null;
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  // Get current backend or detect if needed
  async getCurrentBackend() {
    if (!CONFIG.AUTO_DETECT_BACKENDS && CONFIG.BACKEND_URL) {
      return CONFIG.CURRENT_BACKEND;
    }

    return await this.detectBestBackend();
  }

  // Force refresh of backend detection
  async refreshBackend() {
    this.cachedBackend = null;
    this.cacheExpiry = 0;
    return await this.detectBestBackend();
  }
}

// Global backend manager instance
const backendManager = new BackendManager();

// Helper function to get full API URL with smart backend detection
async function getApiUrl(endpoint) {
  const backend = await backendManager.getCurrentBackend();
  if (!backend) {
    throw new Error('No healthy backend available');
  }
  return `${backend.url}${endpoint}`;
}

// Helper function to get API URL synchronously (for backwards compatibility)
function getApiUrlSync(endpoint) {
  if (!CONFIG.BACKEND_URL) {
    // Fallback to Cloud Run if no backend detected yet
    CONFIG.BACKEND_URL = CONFIG.BACKENDS.CLOUD_RUN.url;
  }
  return `${CONFIG.BACKEND_URL}${endpoint}`;
}

// Helper function to make API requests with automatic backend switching
async function makeApiRequest(endpoint, options = {}) {
  const backend = await backendManager.getCurrentBackend();
  if (!backend) {
    throw new Error('No healthy backend available');
  }

  const url = `${backend.url}${endpoint}`;
  const timeout = backend.url.includes('localhost') 
    ? CONFIG.REQUEST_TIMEOUT 
    : CONFIG.CLOUD_REQUEST_TIMEOUT;

  console.log(`Making API request to ${backend.name}: ${url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`API request failed with status ${response.status}, trying next backend...`);
      
      // Mark current backend as unhealthy and try next
      backendManager.cachedBackend = null;
      backendManager.cacheExpiry = 0;
      
      const nextBackend = await backendManager.detectBestBackend();
      if (nextBackend && nextBackend.url !== backend.url) {
        console.log(`Retrying with ${nextBackend.name}...`);
        return makeApiRequest(endpoint, options);
      }
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.log(`Request to ${backend.name} timed out`);
    } else {
      console.log(`Request to ${backend.name} failed:`, error.message);
    }
    
    // Try next backend
    backendManager.cachedBackend = null;
    backendManager.cacheExpiry = 0;
    
    const nextBackend = await backendManager.detectBestBackend();
    if (nextBackend && nextBackend.url !== backend.url) {
      console.log(`Retrying with ${nextBackend.name}...`);
      return makeApiRequest(endpoint, options);
    }
    
    throw error;
  }
}

// Initialize backend detection when config loads
console.log('🔧 Backend Manager initialized');
console.log('📊 Available backends:', Object.keys(CONFIG.BACKENDS));
console.log('⚙️ Auto-detect enabled:', CONFIG.AUTO_DETECT_BACKENDS);
console.log('🏠 Prefer local:', CONFIG.PREFER_LOCAL);

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, getApiUrl };
} 