import React, { useState, useEffect, useRef } from 'react';
import { Icons } from './constants';
import { AppStatus, ExtractedPage, ProcessingConfig, AnalysisResult } from './types';
import { Button } from './components/Button';
import { FileUploader } from './components/FileUploader';
import { ProcessingConfigPanel } from './components/ProcessingConfig';
import { Spinner } from './components/Spinner';
import { getDocument, renderPageAsImage } from './services/pdfService';
import { performOCR, analyzeText } from './services/geminiService';
import JSZip from 'jszip';

// Helper for file downloading to avoid file-saver import issues
const saveAs = (blob: Blob, fileName: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function App() {
  // State
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [darkMode, setDarkMode] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'editor' | 'images' | 'analysis'>('editor');
  const [editorText, setEditorText] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Load PDF
  const handleFileSelect = async (file: File) => {
    try {
      setStatus(AppStatus.LOADING_PDF);
      setCurrentFile(file);
      const doc = await getDocument(file);
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setShowConfig(true);
      setStatus(AppStatus.IDLE);
    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      alert("Failed to load PDF. Please try another file.");
    }
  };

  // Start Processing Loop
  const startProcessing = async (config: ProcessingConfig) => {
    setShowConfig(false);
    setStatus(AppStatus.PROCESSING);
    setExtractedPages([]);
    setEditorText('');
    
    let pagesToProcess: number[] = [];
    if (config.mode === 'SINGLE') {
      pagesToProcess = [config.singlePage];
    } else if (config.mode === 'RANGE') {
      for (let i = config.rangeStart; i <= config.rangeEnd; i++) pagesToProcess.push(i);
    } else {
      for (let i = 1; i <= totalPages; i++) pagesToProcess.push(i);
    }

    setProcessingProgress({ current: 0, total: pagesToProcess.length });

    let fullTextAccumulator = '';

    for (let i = 0; i < pagesToProcess.length; i++) {
      const pageNum = pagesToProcess[i];
      try {
        // 1. Render to Image
        const base64Image = await renderPageAsImage(pdfDoc, pageNum);
        
        // 2. Perform OCR with Gemini
        const text = await performOCR(base64Image);
        
        const newPage: ExtractedPage = {
          pageNumber: pageNum,
          imageUrl: base64Image,
          text: text
        };

        setExtractedPages(prev => [...prev, newPage]);
        
        // Append to editor with a page marker
        const pageText = `\n\n--- Page ${pageNum} ---\n\n${text}`;
        fullTextAccumulator += pageText;
        setEditorText(prev => prev + pageText);

        setProcessingProgress({ current: i + 1, total: pagesToProcess.length });
      } catch (e) {
        console.error(`Error processing page ${pageNum}`, e);
      }
    }

    setStatus(AppStatus.COMPLETED);
  };

  // Analysis Handler
  const handleAnalyze = async () => {
    if (!editorText.trim()) return;
    setIsAnalyzing(true);
    setActiveTab('analysis');
    try {
      const result = await analyzeText(editorText);
      setAnalysis(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Download Handlers
  const handleDownloadText = () => {
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `${currentFile?.name.split('.')[0]}_extracted.txt`);
  };

  const handleDownloadImages = async () => {
    const zip = new JSZip();
    extractedPages.forEach((page) => {
      const imgData = page.imageUrl.split(',')[1];
      zip.file(`page_${page.pageNumber}.jpg`, imgData, { base64: true });
    });
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${currentFile?.name.split('.')[0]}_images.zip`);
  };

  // Reset App
  const handleReset = () => {
    setCurrentFile(null);
    setPdfDoc(null);
    setExtractedPages([]);
    setEditorText('');
    setAnalysis(null);
    setStatus(AppStatus.IDLE);
  };

  // --- Render Views ---

  const renderHeader = () => (
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="bg-gradient-to-r from-primary-600 to-blue-400 p-2 rounded-lg">
             <Icons.FileText className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-700 to-blue-500 dark:from-primary-400 dark:to-blue-300">
            ScanGenius
          </h1>
        </div>
        <div className="flex items-center space-x-2">
          {status === AppStatus.COMPLETED && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <Icons.RotateCcw className="w-4 h-4 mr-2" /> New
            </Button>
          )}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
          >
            {darkMode ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </header>
  );

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
            Transform PDFs into <br/>
            <span className="text-primary-600 dark:text-primary-400">Editable Content</span>
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Advanced OCR for Arabic, French & English. Preserves formatting, extracts images, and analyzes content with AI.
          </p>
        </div>
        
        {showConfig ? (
           <ProcessingConfigPanel 
             totalPages={totalPages} 
             onStart={startProcessing} 
             onCancel={() => { setShowConfig(false); setCurrentFile(null); }} 
           />
        ) : (
          <FileUploader onFileSelect={handleFileSelect} />
        )}

        {status === AppStatus.LOADING_PDF && (
            <div className="flex justify-center items-center space-x-2 text-primary-600">
                <Spinner />
                <span>Reading PDF Structure...</span>
            </div>
        )}
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <div className="w-24 h-24 mb-6 relative">
        <svg className="animate-spin w-full h-full text-gray-200 dark:text-gray-700" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
            <Icons.Sparkles className="w-8 h-8 text-primary-600 animate-pulse" />
        </div>
        <div 
            className="absolute top-0 left-0 w-full h-full rounded-full border-4 border-primary-600 border-t-transparent animate-spin" 
            style={{ animationDuration: '1.5s' }}
        />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Processing Document</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-8">
        Extracting text and images from Page {processingProgress.current} of {processingProgress.total}...
      </p>
      
      {/* Live Preview Card */}
      {extractedPages.length > 0 && (
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs uppercase text-gray-400 font-bold tracking-wider mb-2 text-left">Live Output</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-left line-clamp-3 font-arabic" dir="auto">
                {extractedPages[extractedPages.length - 1].text.substring(0, 200)}
            </p>
        </div>
      )}
    </div>
  );

  const renderWorkspace = () => (
    <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm z-20">
            <div className="flex p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <button
                    onClick={() => setActiveTab('editor')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'editor' ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Text Editor
                </button>
                <button
                    onClick={() => setActiveTab('images')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'images' ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    Images ({extractedPages.length})
                </button>
                <button
                    onClick={() => { setActiveTab('analysis'); if(!analysis) handleAnalyze(); }}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center ${activeTab === 'analysis' ? 'bg-white dark:bg-gray-600 text-primary-600 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                >
                    AI Analysis
                </button>
            </div>

            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadText}>
                    <Icons.Download className="w-4 h-4 mr-2" /> Text
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadImages}>
                    <Icons.Image className="w-4 h-4 mr-2" /> Images
                </Button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 relative">
            
            {/* Tab: Editor */}
            {activeTab === 'editor' && (
                <div className="h-full flex flex-col max-w-4xl mx-auto p-4 md:p-6">
                   <textarea 
                        className="flex-1 w-full h-full p-6 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-arabic leading-relaxed text-lg"
                        value={editorText}
                        onChange={(e) => setEditorText(e.target.value)}
                        dir="auto"
                        placeholder="Extracted text will appear here..."
                   />
                </div>
            )}

            {/* Tab: Images */}
            {activeTab === 'images' && (
                <div className="h-full overflow-y-auto p-4 md:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                        {extractedPages.map((page) => (
                            <div key={page.pageNumber} className="group relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="aspect-[1/1.4] bg-gray-200 dark:bg-gray-900 relative">
                                    <img src={page.imageUrl} alt={`Page ${page.pageNumber}`} className="w-full h-full object-contain" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                         <a href={page.imageUrl} download={`page_${page.pageNumber}.jpg`} className="p-3 bg-white rounded-full hover:bg-gray-100 transition-colors">
                                            <Icons.Download className="w-5 h-5 text-gray-900" />
                                         </a>
                                    </div>
                                </div>
                                <div className="p-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Page {page.pageNumber}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab: Analysis */}
            {activeTab === 'analysis' && (
                <div className="h-full overflow-y-auto p-4 md:p-6">
                    <div className="max-w-3xl mx-auto space-y-6">
                        {!analysis && isAnalyzing && (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4 text-gray-500">
                                <Spinner className="w-10 h-10" />
                                <p>Analyzing content structure and meaning...</p>
                            </div>
                        )}
                        
                        {!analysis && !isAnalyzing && (
                            <div className="text-center p-12">
                                <Button onClick={handleAnalyze} size="lg">
                                    <Icons.Sparkles className="w-5 h-5 mr-2" /> Generate Analysis
                                </Button>
                            </div>
                        )}

                        {analysis && (
                            <>
                                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center space-x-2 mb-4 text-primary-600 dark:text-primary-400">
                                        <Icons.FileText className="w-5 h-5" />
                                        <h3 className="text-lg font-bold">Summary</h3>
                                    </div>
                                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                        {analysis.summary}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Topics</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {analysis.topics.map((topic, idx) => (
                                                <span key={idx} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                                                    {topic}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Keywords</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {analysis.keywords.map((kw, idx) => (
                                                <span key={idx} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm border border-gray-200 dark:border-gray-600">
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                                     <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Key Points</h3>
                                     <ul className="space-y-3">
                                        {analysis.keyPoints.map((point, idx) => (
                                            <li key={idx} className="flex items-start space-x-3">
                                                <div className="min-w-6 h-6 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 text-xs font-bold mt-0.5">
                                                    {idx + 1}
                                                </div>
                                                <p className="text-gray-700 dark:text-gray-300">{point}</p>
                                            </li>
                                        ))}
                                     </ul>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

        </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col font-sans text-gray-900 dark:text-white transition-colors duration-200">
      {renderHeader()}
      <main className="flex-grow bg-gray-50 dark:bg-gray-900">
        {status === AppStatus.IDLE && renderHome()}
        {(status === AppStatus.PROCESSING || status === AppStatus.LOADING_PDF) && renderProcessing()}
        {status === AppStatus.COMPLETED && renderWorkspace()}
      </main>
    </div>
  );
}