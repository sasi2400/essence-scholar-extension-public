# SSRN Paper Summarizer Extension

A powerful Chrome extension that provides intelligent analysis of academic papers from SSRN and PDF files using AI-powered research assistance.


<p align="center">
  <a href="https://youtu.be/PwXn94MjdpY">
    <img src="https://img.youtube.com/vi/PwXn94MjdpY/0.jpg" alt="SSRN Paper Summarizer Demo">
  </a>
</p>


## 🚀 Features

* **Smart Paper Analysis**: Automatically extracts and analyzes academic papers from SSRN

* **PDF Support**: Works with local PDF files and web-hosted PDFs

* **AI-Powered Insights**: Uses advanced AI to provide structured analysis including:

  * Key findings and contributions
  * Author profiles and publication history
  * Research methodology and data analysis
  * Bibliography and reference analysis
  * Topic relevance assessment

* **Interactive Chat**: Ask questions about analyzed papers using RAG (Retrieval-Augmented Generation)

* **Author Analysis**: Detailed author profiles with Google Scholar integration

* **FT50 Journal Tracking**: Identifies publications in Financial Times Top 50 journals


## 📦 Installation

Install the SSRN Paper Summarizer Extension with these simple steps:

1. **Clone (development)** *(optional)*

   ```bash
   git clone https://github.com/sasi2400/ssrn-summarizer-extension.git
   cd ssrn-summarizer-extension
   ```
2. **Download (stable)**

   * Visit the [GitHub tags page](https://github.com/sasi2400/ssrn-summarizer-extension/tags)
   * Select the latest tag
   * Download and extract the ZIP archive
3. **Load in Chrome**

   * Open `chrome://extensions/`
   * Enable **Developer mode**
   * Click **Load unpacked** and choose the extension folder
4. **Configure API Key**

   * In the extension settings, add your preferred LLM API key (Gemini, OpenAI, or Claude)

## 🎯 Usage

### Analyzing SSRN Papers and PDFs

1. Open an SSRN paper page or a direct PDF link in your browser.
2. Click the extension icon in the toolbar.
3. Select **Analyze Paper** (or **Analyze PDF**) to begin.
4. Review the AI-generated insights, including:

   * Executive summary
   * Key findings and contributions
   * Research methodology
   * Author profiles
   * Bibliography overview

### Interactive Chat

After analysis completes, open the chat panel to:

* Ask detailed questions about the paper’s content or methods.
* Receive responses powered by Retrieval-Augmented Generation.

### Author Analysis

Click **Analyze Authors** to view:

* Publication history and citation metrics
* FT50 journal appearances
* Integrated Google Scholar profiles

## 🏗️ Architecture

### Analyzing SSRN Papers

1. Navigate to any SSRN paper page, Click the extension icon in your browser toolbar and see author analysis 
2. or. open any pdf link (I recommend only when landing in the pdf page of the ssrn papers)
3. Click "Analyze Paper" to start the analysis
4. View comprehensive results including:

   * Executive summary
   * Key findings and contributions
   * Research methodology
   * Author profiles
   * Bibliography analysis

### Interactive Chat

1. After analyzing a paper, use the chat feature
2. Ask questions about the paper's content, methodology, or findings
3. Get AI-powered responses based on the paper's content

### Author Analysis

1. Click "Analyze Authors" for detailed author profiles
2. View publication history, citations, and FT50 journal publications
3. Access Google Scholar integration for additional author information

## 🏗️ Architecture

* **Frontend**: Chrome Extension (JavaScript, HTML, CSS)
* **Backend**: Python Flask API with AI integration
* **AI Engine**: Google AI (Gemini) for paper analysis
* **PDF Processing**: PDF.js for client-side PDF extraction
* **Knowledge Base**: In-memory RAG system for enhanced chat

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues and pull requests.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style

* Follow existing code formatting
* Add comments for complex logic
* Update documentation as needed

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Common Issues

**Extension not connecting to backend:**

* Check if your backend is running and if you are updated
*

## 📊 Performance

* **Analysis Time**: 30-120 seconds depending on paper length and backend
* **Memory Usage**: Minimal browser memory footprint
* **Network**: Requires backend connection for AI analysis

## 🛡️ Privacy

* All analysis is performed on the backend
* No paper content is stored permanently
* Author information is fetched from public sources only
* No personal data is collected or transmitted

---
