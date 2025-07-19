document.addEventListener('DOMContentLoaded', async function() {
    // Get DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const markdownContent = document.getElementById('markdownContent');
    const documentTitle = document.getElementById('documentTitle');
    const processorInfo = document.getElementById('processorInfo');
    const pageInfo = document.getElementById('pageInfo');
    const sectionsInfo = document.getElementById('sectionsInfo');
    const backBtn = document.getElementById('backBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const printBtn = document.getElementById('printBtn');
    const backToTop = document.getElementById('backToTop');

    // Global variables
    let currentMarkdownData = null;
    let currentPaperId = null;

    // Initialize marked.js for markdown rendering
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function(code, lang) {
                return code; // Simple fallback, could add syntax highlighting later
            },
            breaks: true,
            gfm: true
        });
    }

    // Back to top functionality
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });

    backToTop.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Helper function to build fullpage URL with scholar parameters
    async function buildFullpageUrl(paperId, additionalParams = {}) {
        const baseUrl = chrome.runtime.getURL('fullpage.html');
        const params = new URLSearchParams();
        
        if (paperId) {
            params.set('paperID', paperId);
        }
        
        // Get current scholar URL from settings
        const settings = await chrome.storage.local.get(['userSettings']);
        const currentScholarUrl = settings.userSettings?.googleScholarUrl || 'https://scholar.google.de/citations?user=jgW3WbcAAAAJ&hl=en';
        
        // Add scholar parameter
        params.set('scholar', currentScholarUrl);
        
        // Add any additional parameters
        Object.entries(additionalParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.set(key, value);
            }
        });
        
        return `${baseUrl}?${params.toString()}`;
    }

    // Button event listeners
    backBtn.addEventListener('click', async function() {
        // Go back to fullpage analysis
        if (currentPaperId) {
            const fullpageUrl = await buildFullpageUrl(currentPaperId);
            chrome.tabs.create({ url: fullpageUrl });
        } else {
            window.history.back();
        }
    });

    downloadBtn.addEventListener('click', function() {
        if (currentMarkdownData && currentMarkdownData.markdown_content) {
            downloadMarkdown(currentMarkdownData.markdown_content, currentMarkdownData.title || 'document');
        }
    });

    copyBtn.addEventListener('click', async function() {
        if (currentMarkdownData && currentMarkdownData.markdown_content) {
            try {
                await navigator.clipboard.writeText(currentMarkdownData.markdown_content);
                showToast('Markdown copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                showToast('Failed to copy to clipboard', 'error');
            }
        }
    });

    printBtn.addEventListener('click', function() {
        window.print();
    });

    // Utility functions
    function showError(message) {
        loading.style.display = 'none';
        markdownContent.style.display = 'none';
        error.style.display = 'block';
        errorMessage.textContent = message;
    }

    function showContent() {
        loading.style.display = 'none';
        error.style.display = 'none';
        markdownContent.style.display = 'block';
    }

    function updateHeader(data) {
        documentTitle.textContent = data.title || 'Document';
        pageInfo.textContent = `${data.total_pages || 0} pages`;
        sectionsInfo.textContent = `${data.sections_count || 0} sections, ${data.tables_count || 0} tables, ${data.figures_count || 0} figures`;
    }

    function renderMarkdown(markdownText) {
        if (typeof marked !== 'undefined') {
            return marked.parse(markdownText);
        } else {
            // Fallback: simple text with line breaks
            return markdownText.replace(/\n/g, '<br>');
        }
    }

    function downloadMarkdown(content, filename) {
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.replace(/[^a-z0-9]/gi, '_') + '.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Markdown downloaded!');
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : '#28a745'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Main function to load markdown content
    async function loadMarkdownContent() {
        try {
            // Get paper ID from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            currentPaperId = urlParams.get('paperID');

            if (!currentPaperId) {
                showError('No paper ID provided. Please access this page through the extension.');
                return;
            }

            console.log('Markdown Viewer: Loading content for paper ID:', currentPaperId);
            console.log('Markdown Viewer: Using smart backend detection...');

            // Use the same smart backend detection pattern as other parts of the extension
            const serverResponse = await makeApiRequest(`/markdown/${currentPaperId}`, {
                method: 'GET'
            });

            if (!serverResponse.ok) {
                let errorMessage = `Server error: ${serverResponse.status} - ${serverResponse.statusText}`;
                
                try {
                    const errorData = await serverResponse.json();
                    if (serverResponse.status === 404) {
                        errorMessage = `Markdown content not available: ${errorData.reason || 'Paper not found'}`;
                    } else if (errorData.error) {
                        errorMessage = `Backend error: ${errorData.error}`;
                    }
                } catch (parseError) {
                    console.warn('Markdown Viewer: Could not parse error response');
                }
                
                showError(errorMessage);
                return;
            }

            const data = await serverResponse.json();
            console.log('Markdown Viewer: Successfully received markdown data:', {
                hasContent: !!data.markdown_content,
                title: data.title,
                pages: data.total_pages,
                sections: data.sections_count
            });

            if (!data.success || !data.markdown_content) {
                showError('No markdown content available for this document.');
                return;
            }

            // Store data globally
            currentMarkdownData = data;

            // Update header with paper info
            updateHeader(data);

            // Render markdown content
            const htmlContent = renderMarkdown(data.markdown_content);
            markdownContent.innerHTML = htmlContent;

            // Show content
            showContent();

            console.log('Markdown Viewer: Content loaded and rendered successfully');

        } catch (error) {
            console.error('Markdown Viewer: Error loading content:', error);
            let errorMessage = 'Failed to load markdown content. Please try again.';
            
            if (error.message) {
                if (error.message.includes('No healthy backend')) {
                    errorMessage = 'Cannot connect to backend servers. Please ensure the backend is running.';
                } else if (error.message.includes('Failed to connect')) {
                    errorMessage = 'Connection failed. Please check your internet connection and backend status.';
                } else {
                    errorMessage = `Connection error: ${error.message}`;
                }
            }
            
            showError(errorMessage);
        }
    }

    // Load content on page load
    await loadMarkdownContent();
}); 