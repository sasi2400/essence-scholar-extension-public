# SSRN Paper Summarizer Extension

A powerful Chrome extension that provides intelligent analysis of academic papers from SSRN and PDF files using AI-powered research assistance.

## 🚀 Features

- **Smart Paper Analysis**: Automatically extracts and analyzes academic papers from SSRN
- **PDF Support**: Works with local PDF files and web-hosted PDFs
- **AI-Powered Insights**: Uses advanced AI to provide structured analysis including:
  - Key findings and contributions
  - Author profiles and publication history
  - Research methodology and data analysis
  - Bibliography and reference analysis
  - Topic relevance assessment
- **Interactive Chat**: Ask questions about analyzed papers using RAG (Retrieval-Augmented Generation)
- **Author Analysis**: Detailed author profiles with Google Scholar integration
- **Smart Backend Detection**: Automatically connects to available backends (local/cloud)
- **FT50 Journal Tracking**: Identifies publications in Financial Times Top 50 journals

## 📦 Installation

### From Source (Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sasi2400/ssrn-summarizer-extension.git
   cd ssrn-summarizer-extension
   ```

2. **Load the extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extension directory

3. **Set up the backend:**
   - The extension requires a backend service for AI analysis
   - See the [Backend Repository](https://github.com/sasi2400/ssrn-summarizer-backend) for setup instructions
   - Or use the public cloud deployment (instructions below)

### Backend Setup

The extension requires a backend service for AI analysis. You have two options:

#### Option 1: Use Public Cloud Deployment
- The extension will automatically detect and connect to the public cloud backend
- No setup required - just install the extension

#### Option 2: Run Local Backend
1. Clone the backend repository (private):
   ```bash
   git clone git@github.com:sasi2400/ssrn-summarizer-backend.git
   cd ssrn-summarizer-backend
   ```
2. Follow the setup instructions in the backend README
3. The extension will automatically detect your local backend

## 🎯 Usage

### Analyzing SSRN Papers
1. Navigate to any SSRN paper page
2. Click the extension icon in your browser toolbar
3. Click "Analyze Paper" to start the analysis
4. View comprehensive results including:
   - Executive summary
   - Key findings and contributions
   - Research methodology
   - Author profiles
   - Bibliography analysis

### Analyzing PDF Files
1. Open any PDF file in your browser
2. Click the extension icon
3. Click "Analyze PDF" to extract and analyze the content

### Interactive Chat
1. After analyzing a paper, use the chat feature
2. Ask questions about the paper's content, methodology, or findings
3. Get AI-powered responses based on the paper's content

### Author Analysis
1. Click "Analyze Authors" for detailed author profiles
2. View publication history, citations, and FT50 journal publications
3. Access Google Scholar integration for additional author information

## 🔧 Configuration

The extension automatically detects available backends. You can configure connection settings in `config.js`:

```javascript
const config = {
    localBackendUrl: 'http://localhost:5000',
    cloudBackendUrl: 'https://your-cloud-deployment.com',
    localTimeout: 60000,  // 60 seconds
    cloudTimeout: 120000  // 120 seconds
};
```

## 🏗️ Architecture

- **Frontend**: Chrome Extension (JavaScript, HTML, CSS)
- **Backend**: Python Flask API with AI integration
- **AI Engine**: Google AI (Gemini) for paper analysis
- **PDF Processing**: PDF.js for client-side PDF extraction
- **Knowledge Base**: In-memory RAG system for enhanced chat

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style
- Follow existing code formatting
- Add comments for complex logic
- Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Extension not connecting to backend:**
- Check if your backend is running
- Verify the backend URL in `config.js`
- Check browser console for error messages

**PDF analysis not working:**
- Ensure the PDF is accessible (not password protected)
- Try refreshing the page
- Check if the PDF is properly loaded in the browser

**Analysis taking too long:**
- Check your internet connection
- Verify backend service is responsive
- Consider using local backend for faster processing

### Getting Help

- Check the [Troubleshooting Guide](TROUBLESHOOTING_GUIDE.md)
- Review the [Testing Guide](TESTING_GUIDE.md)
- Open an issue on GitHub with detailed error information

## 🔗 Related Projects

- [Backend Repository](https://github.com/sasi2400/ssrn-summarizer-backend) - Private backend service
- [Deployment Guide](DEPLOYMENT_README.md) - Backend deployment instructions

## 📊 Performance

- **Analysis Time**: 30-120 seconds depending on paper length and backend
- **Memory Usage**: Minimal browser memory footprint
- **Network**: Requires backend connection for AI analysis

## 🛡️ Privacy

- All analysis is performed on the backend
- No paper content is stored permanently
- Author information is fetched from public sources only
- No personal data is collected or transmitted

---

**Note**: This extension requires a backend service for AI analysis. See the backend repository for setup instructions or use the public cloud deployment.
