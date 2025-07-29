// Onboarding JavaScript
let currentStep = 1;
const totalSteps = 4;

// Initialize onboarding
document.addEventListener('DOMContentLoaded', function() {
  updateProgress();
  setupEventListeners();
  loadExistingSettings();
  checkBackendStatus(); // Add backend detection
});

function setupEventListeners() {
  // Model selection
  document.querySelectorAll('.model-card').forEach(card => {
    card.addEventListener('click', function() {
      document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');
    });
  });
  
  // Navigation buttons
  document.getElementById('nextBtn').addEventListener('click', nextStep);
  document.getElementById('prevBtn').addEventListener('click', prevStep);
  document.getElementById('finishBtn').addEventListener('click', finishSetup);
  document.getElementById('skipBtn').addEventListener('click', skipSetup);
  
  // Form validation
  document.getElementById('geminiKey').addEventListener('input', validateApiKeys);
  document.getElementById('openaiKey').addEventListener('input', validateApiKeys);
  document.getElementById('claudeKey').addEventListener('input', validateApiKeys);
  
  // Generate profile button
  const generateProfileBtn = document.getElementById('generateProfileBtn');
  if (generateProfileBtn) {
    generateProfileBtn.addEventListener('click', generateResearchProfile);
  }
}

function updateProgress() {
  const progress = (currentStep / totalSteps) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
}

function nextStep() {
  if (validateCurrentStep()) {
    if (currentStep < totalSteps) {
      hideStep(currentStep);
      currentStep++;
      showStep(currentStep);
      updateProgress();
      updateNavigationButtons();
    }
  }
}

function prevStep() {
  if (currentStep > 1) {
    hideStep(currentStep);
    currentStep--;
    showStep(currentStep);
    updateProgress();
    updateNavigationButtons();
  }
}

function showStep(stepNumber) {
  document.getElementById(`step${stepNumber}`).style.display = 'block';
}

function hideStep(stepNumber) {
  document.getElementById(`step${stepNumber}`).style.display = 'none';
}

function updateNavigationButtons() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const finishBtn = document.getElementById('finishBtn');
  
  prevBtn.style.display = currentStep > 1 ? 'inline-block' : 'none';
  nextBtn.style.display = currentStep < totalSteps ? 'inline-block' : 'none';
  finishBtn.style.display = currentStep === totalSteps ? 'inline-block' : 'none';
}

function validateCurrentStep() {
  switch (currentStep) {
    case 1:
      return validateModelSelection() && validateBackendAvailable();
    case 2:
      return validateApiKeys();
    case 3:
      return true; // Research profile is optional
    case 4:
      return validateAnalysisPreferences();
    default:
      return true;
  }
}

function validateModelSelection() {
  const selectedModel = document.querySelector('.model-card.selected');
  if (!selectedModel) {
    alert('Please select an AI model to continue.');
    return false;
  }
  return true;
}

function validateBackendAvailable() {
  const backendStatus = document.getElementById('backend-status');
  const statusText = backendStatus.querySelector('.info span');
  
  if (statusText.textContent.includes('No backend available')) {
    alert('No backend is currently available. Please check your internet connection and try again.');
    return false;
  }
  
  if (statusText.textContent.includes('Detecting backend')) {
    alert('Please wait for backend detection to complete before proceeding.');
    return false;
  }
  
  return true;
}

function validateApiKeys() {
  const selectedModel = document.querySelector('.model-card.selected');
  if (!selectedModel) return true;
  
  const model = selectedModel.dataset.model;
  const geminiKey = document.getElementById('geminiKey').value.trim();
  const openaiKey = document.getElementById('openaiKey').value.trim();
  const claudeKey = document.getElementById('claudeKey').value.trim();
  
  // Check if selected model requires API key
  if (model.startsWith('gpt-') && !openaiKey) {
    alert('Please provide an OpenAI API key for GPT models. You can get one from https://platform.openai.com/api-keys');
    return false;
  }
  
  if (model.startsWith('claude-') && !claudeKey) {
    alert('Please provide a Claude API key for Claude models. You can get one from https://console.anthropic.com/settings/keys');
    return false;
  }
  
  // For Gemini models, API key is also required
  if (model.startsWith('gemini-') && !geminiKey) {
    alert('Please provide a Google AI API key for Gemini models. You can get one from https://makersuite.google.com/app/apikey');
    return false;
  }
  
  return true;
}

function validateAnalysisPreferences() {
  const selectedResearchers = document.querySelectorAll('input[name="junior_researchers"]:checked');
  if (selectedResearchers.length === 0) {
    alert('Please select at least one analysis preference.');
    return false;
  }
  return true;
}

function loadExistingSettings() {
  // Load existing settings from chrome.storage
  chrome.storage.local.get(['llmSettings', 'userSettings', 'juniorResearchers'], function(result) {
    const llmSettings = result.llmSettings || {};
    const userSettings = result.userSettings || {};
    const juniorResearchers = result.juniorResearchers || {};
    
    // Set model selection
    if (llmSettings.model) {
      const modelCard = document.querySelector(`[data-model="${llmSettings.model}"]`);
      if (modelCard) {
        modelCard.classList.add('selected');
      }
    }
    
    // Set API keys
    if (llmSettings.geminiKey) {
      document.getElementById('geminiKey').value = llmSettings.geminiKey;
    }
    if (llmSettings.openaiKey) {
      document.getElementById('openaiKey').value = llmSettings.openaiKey;
    }
    if (llmSettings.claudeKey) {
      document.getElementById('claudeKey').value = llmSettings.claudeKey;
    }
    
    // Set research profile
    if (userSettings.googleScholarUrl) {
      document.getElementById('googleScholarUrl').value = userSettings.googleScholarUrl;
    }
    if (userSettings.researchInterests) {
      document.getElementById('researchInterests').value = userSettings.researchInterests;
    }
    
    // Set analysis preferences
    Object.keys(juniorResearchers).forEach(key => {
      const checkbox = document.querySelector(`input[value="${key}"]`);
      if (checkbox) {
        checkbox.checked = juniorResearchers[key];
      }
    });
  });
}

async function generateResearchProfile() {
  const generateBtn = document.getElementById('generateProfileBtn');
  const generateBtnText = document.getElementById('generateBtnText');
  const generateBtnLoading = document.getElementById('generateBtnLoading');
  const googleScholarUrl = document.getElementById('googleScholarUrl').value.trim();
  const researchInterests = document.getElementById('researchInterests');
  
  if (!googleScholarUrl) {
    alert('Please enter your Google Scholar profile URL first.');
    return;
  }
  
  // Validate Google Scholar URL
  if (!googleScholarUrl.includes('scholar.google.com') && !googleScholarUrl.includes('scholar.google.de')) {
    alert('Please enter a valid Google Scholar Profile URL');
    return;
  }
  
  // Show loading state
  generateBtn.disabled = true;
  generateBtnText.style.display = 'none';
  generateBtnLoading.style.display = 'inline-block';
  
  try {
    // Get current LLM settings for the API call
    const llmSettings = await new Promise((resolve) => {
      chrome.storage.local.get(['llmSettings'], (result) => {
        resolve(result.llmSettings || { model: 'gemini-2.5-pro', geminiKey: '', openaiKey: '', claudeKey: '' });
      });
    });
    
    // Get backend URL using the same logic as fullpage
    const backend = await BackendManager.getCurrentBackend();
    if (!backend) {
      throw new Error('No healthy backend available');
    }
    
    // Make API request to generate profile using the same endpoint as fullpage
    const response = await makeApiRequestWithBackend('/generate-research-profile', {
      method: 'POST',
      body: JSON.stringify({
        googleScholarUrl: googleScholarUrl,
        researchInterests: researchInterests.value.trim()
      })
    }, backend);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend error: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // Update the research interests field with generated content
    if (result.generatedProfile) {
      researchInterests.value = result.generatedProfile;
      alert('Research profile generated successfully!');
      console.log('Generated research profile:', result.generatedProfile);
    } else {
      alert('Profile generated but no content returned');
    }
    
  } catch (error) {
    console.error('Error generating research profile:', error);
    alert('Error generating research profile: ' + error.message);
  } finally {
    // Reset button state
    generateBtn.disabled = false;
    generateBtnText.style.display = 'inline';
    generateBtnLoading.style.display = 'none';
  }
}

// Check backend status and update UI
async function checkBackendStatus() {
  const backendStatus = document.getElementById('backend-status');
  const statusDiv = backendStatus.querySelector('.info');
  
  try {
    console.log('Onboarding: Checking backend status...');
    
    // Try to find a working backend
    const backend = await BackendManager.getCurrentBackend();
    
    if (backend) {
      // Test if backend is actually responsive
      try {
        // Use AbortController for better browser compatibility
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const healthCheck = await fetch(`${backend.url}/health`, { 
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (healthCheck.ok) {
          statusDiv.innerHTML = `
            <div style="color: #28a745; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">✅</span>
              <span>Backend available: ${backend.name}</span>
            </div>
          `;
          console.log('Onboarding: Backend is healthy');
        } else {
          throw new Error(`Health check failed: ${healthCheck.status}`);
        }
      } catch (healthError) {
        console.error('Onboarding: Health check failed:', healthError);
        statusDiv.innerHTML = `
          <div style="color: #dc3545; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">⚠️</span>
            <span>Backend detected but not responding</span>
          </div>
        `;
      }
    } else {
      statusDiv.innerHTML = `
        <div style="color: #dc3545; display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">❌</span>
          <span>No backend available</span>
        </div>
      `;
      console.error('Onboarding: No backend available');
    }
  } catch (error) {
    console.error('Onboarding: Error checking backend status:', error);
    statusDiv.innerHTML = `
      <div style="color: #dc3545; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">❌</span>
        <span>Error checking backend: ${error.message}</span>
      </div>
    `;
  }
}



function saveSettings() {
  return new Promise((resolve, reject) => {
    try {
      // Get selected model
      const selectedModelCard = document.querySelector('.model-card.selected');
      const selectedModel = selectedModelCard ? selectedModelCard.dataset.model : 'gemini-2.5-pro';
      
      // Get API keys
      const geminiKey = document.getElementById('geminiKey').value.trim();
      const openaiKey = document.getElementById('openaiKey').value.trim();
      const claudeKey = document.getElementById('claudeKey').value.trim();
      
      // Get research profile
      const googleScholarUrl = document.getElementById('googleScholarUrl').value.trim();
      const researchInterests = document.getElementById('researchInterests').value.trim();
      
      // Get analysis preferences
      const juniorResearchers = {};
      document.querySelectorAll('input[name="junior_researchers"]:checked').forEach(checkbox => {
        juniorResearchers[checkbox.value] = true;
      });
      
      // Prepare settings objects
      const llmSettings = {
        model: selectedModel,
        geminiKey: geminiKey,
        openaiKey: openaiKey,
        claudeKey: claudeKey
      };
      
      const userSettings = {
        googleScholarUrl: googleScholarUrl,
        researchInterests: researchInterests
      };
      
      // Save to chrome.storage
      chrome.storage.local.set({
        llmSettings: llmSettings,
        userSettings: userSettings,
        juniorResearchers: juniorResearchers,
        onboardingCompleted: true
      }, function() {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function finishSetup() {
  const finishBtn = document.getElementById('finishBtn');
  const finishBtnText = document.getElementById('finishBtnText');
  const finishBtnLoading = document.getElementById('finishBtnLoading');
  
  // Show loading state
  finishBtn.disabled = true;
  finishBtnText.style.display = 'none';
  finishBtnLoading.style.display = 'inline-block';
  
  saveSettings()
    .then(() => {
      // Show success message
      showSuccessMessage();
      
      // Redirect to fullpage after a delay
      setTimeout(() => {
        window.location.href = chrome.runtime.getURL('fullpage.html');
      }, 2000);
    })
    .catch(error => {
      console.error('Error saving settings:', error);
      alert('There was an error saving your settings. Please try again.');
      
      // Reset button state
      finishBtn.disabled = false;
      finishBtnText.style.display = 'inline';
      finishBtnLoading.style.display = 'none';
    });
}

function skipSetup() {
  // Set default settings
  const defaultSettings = {
    llmSettings: {
      model: 'gemini-2.5-pro',
      geminiKey: '',
      openaiKey: '',
      claudeKey: ''
    },
    userSettings: {
      googleScholarUrl: '',
      researchInterests: ''
    },
    juniorResearchers: {
      key_message: false,
      author_profiles: false,
      contributions_novelty: false,
      data_variables_models: false,
      identification_causality: false,
      quick_takeaways: false,
      bibliography_reference: false
    },
    onboardingCompleted: true
  };
  
  chrome.storage.local.set(defaultSettings, function() {
    if (chrome.runtime.lastError) {
      console.error('Error saving default settings:', chrome.runtime.lastError);
    }
    window.location.href = chrome.runtime.getURL('fullpage.html');
  });
}

function showSuccessMessage() {
  const container = document.querySelector('.onboarding-container');
  container.innerHTML = `
    <div class="onboarding-header">
      <h1 class="onboarding-title">🎉 Setup Complete!</h1>
      <p class="onboarding-subtitle">You're all set to start using Essence Scholar</p>
      <p class="onboarding-description">
        Your preferences have been saved. You can now analyze papers and get personalized insights!
      </p>
    </div>
    <div style="text-align: center; margin-top: 40px;">
      <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
      <p style="font-size: 18px; color: #28a745;">Redirecting you to the main interface...</p>
    </div>
  `;
}

// Handle window close
window.addEventListener('beforeunload', function() {
  // Mark onboarding as completed even if user closes window
  chrome.storage.local.set({ onboardingCompleted: true });
}); 