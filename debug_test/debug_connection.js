// Debug script to test popup connection issues
console.log('=== POPUP CONNECTION DEBUG ===');

// Test 1: Check if config is loaded
console.log('1. Testing config loading...');
if (typeof CONFIG === 'undefined') {
  console.error('❌ CONFIG is undefined - config.js not loaded properly');
} else {
  console.log('✅ CONFIG loaded successfully');
  console.log('Backend URL:', CONFIG.BACKEND_URL);
  console.log('Analyze endpoint:', CONFIG.ANALYZE_ENDPOINT);
}

// Test 2: Check if getApiUrl function is available
console.log('2. Testing getApiUrl function...');
if (typeof getApiUrl === 'undefined') {
  console.error('❌ getApiUrl function is undefined');
} else {
  console.log('✅ getApiUrl function available');
  const fullUrl = getApiUrl(CONFIG.ANALYZE_ENDPOINT);
  console.log('Full API URL:', fullUrl);
}

// Test 3: Test backend connectivity
console.log('3. Testing backend connectivity...');
async function testBackend() {
  try {
    const healthUrl = getApiUrl(CONFIG.HEALTH_ENDPOINT);
    console.log('Testing health endpoint:', healthUrl);
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    console.log('Health response status:', response.status);
    const responseText = await response.text();
    console.log('Health response:', responseText);
    
    if (response.ok) {
      console.log('✅ Backend connectivity test passed');
    } else {
      console.log('❌ Backend connectivity test failed');
    }
  } catch (error) {
    console.log('❌ Backend connectivity test error:', error);
  }
}

// Run the test
testBackend();