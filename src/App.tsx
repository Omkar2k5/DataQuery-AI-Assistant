import React, { useState, useRef, useEffect } from 'react';
import { Upload, Database, FileSpreadsheet, PieChart, Download, Send, Table, ChevronLeft, ChevronRight, Moon, Sun, Copy, Check, BarChart, LineChart, Mic, MicOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import ChartComponent from './components/ChartComponent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { analyzeData, DataSchema } from './utils/api';
import DataVisualization from './components/DataVisualization';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const BAR_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042'];
const LINE_COLOR = '#8884d8';

interface ColumnType {
  name: string;
  type: string;
}

// Add type definitions for Speech Recognition
interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
interface Window {
  SpeechRecognition: SpeechRecognitionConstructor;
  webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

// Define QueryResult interface locally to avoid conflict
interface QueryResult {
  answer: string;
  sqlQuery: string;
  needsChart: boolean;
  chartType: string | null;
  chartData?: Array<{ name: string; value: number }>;
  chartDataColumn?: string;
  executionTime?: number;
  confidence?: number;
}

// Add a function to format the natural language response
const formatNLResponse = (question: string, data: any[], schema: DataSchema): string => {
  // Format based on question type
  if (question.toLowerCase().includes('how many')) {
    const total = data.length;
    return `Based on the dataset, there are ${total.toLocaleString()} records.`;
  }
  
  if (question.toLowerCase().includes('average') || question.toLowerCase().includes('mean')) {
    // Handle average calculations
    return `The average value is...`; // Complete this based on actual calculation
  }
  
  // Add more question type handlers
  return "I've analyzed the data and here's what I found...";
};

// Add the formatSQLQuery function before the App function
function formatSQLQuery(query: string): string {
  // Capitalize SQL keywords
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 
    'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 
    'LIMIT', 'OFFSET', 'AND', 'OR', 'IN', 'NOT IN', 
    'EXISTS', 'NOT EXISTS', 'UNION', 'INTERSECT', 'EXCEPT',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT'
  ];
  
  let formattedQuery = query.trim();
  
  // Capitalize keywords
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    formattedQuery = formattedQuery.replace(regex, keyword);
  });
  
  // Add proper indentation
  formattedQuery = formattedQuery
    .replace(/\bFROM\b/g, '\n  FROM')
    .replace(/\bWHERE\b/g, '\n  WHERE')
    .replace(/\bGROUP BY\b/g, '\n  GROUP BY')
    .replace(/\bORDER BY\b/g, '\n  ORDER BY')
    .replace(/\bHAVING\b/g, '\n  HAVING')
    .replace(/\bLIMIT\b/g, '\n  LIMIT')
    .replace(/\bJOIN\b/g, '\n  JOIN')
    .replace(/\bAND\b/g, '\n    AND')
    .replace(/\bOR\b/g, '\n    OR');
  
  return formattedQuery;
}

function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [schema, setSchema] = useState<DataSchema | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const resultsRef = useRef<HTMLDivElement>(null);
  const rowsPerPage = 10;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conversation, setConversation] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>('pie');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLanding(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results[0][0].transcript;
          setQuery(transcript);
          setIsListening(false);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }
  }, []);

  const copyRowToClipboard = async (row: any, rowIndex: number) => {
    const text = Object.entries(row)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedRow(rowIndex);
    setTimeout(() => setCopiedRow(null), 2000);
  };

  const detectColumnType = (value: any): string => {
    if (typeof value === 'number') return 'number';
    if (value instanceof Date) return 'datetime';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  };

  const updateChartData = (columnName: string) => {
    if (!data || !schema) return;

    const column = schema.columns.find(col => col.name === columnName);
    if (!column) return;

    let transformedData: Array<{ name: string; value: number }>;
    if (column.type === 'number') {
      // For numeric columns, show the distribution of values
      transformedData = data.map((row, index) => {
        const value = row[columnName];
        return {
          name: `Row ${index + 1}`,
          value: typeof value === 'number' ? value : parseFloat(value?.toString() || '0')
        };
      });
    } else {
      // For non-numeric columns, count occurrences of each value
      const valueCounts = data.reduce((acc, row) => {
        const value = row[columnName]?.toString() || 'Unknown';
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      transformedData = Object.entries(valueCounts).map(([value, count]) => ({
        name: value,
        value: Number(count)
      }));
    }

    // Create a new QueryResult with the updated chart data
    const newQueryResult: QueryResult = {
      answer: 'Data loaded successfully',
      sqlQuery: '',
      needsChart: true,
      chartType: chartType,
      chartData: transformedData,
      chartDataColumn: columnName
    };

    setQueryResult(newQueryResult);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet) as Record<string, unknown>[];
      
      if (jsonData.length > 0) {
        const firstRow = jsonData[0];
        const columns = Object.keys(firstRow).map(key => ({
          name: key,
          type: detectColumnType(firstRow[key])
        }));

        setSchema({
          tableName: file.name.split('.')[0],
          columns
        });
        setData(jsonData);
        setCurrentPage(1);
        
        // Set initial selected column and chart data
        if (columns.length > 0) {
          setSelectedColumn(columns[0].name);
          updateChartData(columns[0].name);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const analyzeQuery = async (query: string): Promise<QueryResult> => {
    if (!schema || !data.length) {
      throw new Error("Please upload data first");
    }
    
    try {
      const result = await analyzeData(query, schema, data);
      return result;
    } catch (error) {
      console.error('Error analyzing query:', error);
      throw error;
    }
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.length || !query || isAnalyzing) return;
  
    const newMessage = { role: 'user' as const, content: query };
    setConversation(prev => [...prev, newMessage]);
    setIsAnalyzing(true);
  
    try {
      // Handle greeting messages directly without calling LLM
      const greetings = ['hi', 'hello', 'hey', 'greetings'];
      if (greetings.includes(query.toLowerCase().trim())) {
        const greetingResponse = {
          role: 'assistant' as const,
          content: "Hello! I'm your data analysis assistant. You can ask me questions about your data, and I'll help you analyze it. For example, try asking about specific columns, averages, trends, or distributions in your data."
        };
        setConversation(prev => [...prev, greetingResponse]);
        setQueryResult({
          answer: greetingResponse.content,
          sqlQuery: '',
          needsChart: false,
          chartType: null,
          chartDataColumn: ''
        });
        setQuery('');
        return;
      }

      // Create context for the LLM
      const context = {
        schema: schema,
        sampleData: data.slice(0, 5), // Send first 5 rows as sample
        availableColumns: schema?.columns.map(col => `${col.name} (${col.type})`).join(', '),
        currentQuery: query
      };

      // First get LLM response
      const llmResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen2.5-coder:7b',
          prompt: `You are a helpful data analysis assistant. Given the following context:
          
          Schema: ${JSON.stringify(context.schema, null, 2)}
          Sample Data: ${JSON.stringify(context.sampleData, null, 2)}
          Available Columns: ${context.availableColumns}
          
          User Question: "${context.currentQuery}"
          
          Provide a response in the following JSON format only:
          {
            "answer": "A clear, conversational explanation of the analysis",
            "sqlQuery": "The SQL query to get the results",
            "visualization": "pie, bar, or line"
          }
          
          For text analysis questions:
          1. Use string functions in SQL (LOWER, REGEXP_REPLACE) to clean text
          2. Split text into words
          3. Count word frequencies
          4. Remove common stop words
          5. Present top results
          
          Keep the response format strictly as JSON.`
        })
      });

      const responseText = await llmResponse.text();
      console.log("Raw LLM response:", responseText);

      let llmData;
      try {
        // Collect all JSON responses and combine them
        const jsonResponses = responseText.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line))
          .filter(json => json.response);
        
        const combinedResponse = jsonResponses.map(json => json.response).join('');
        
        // Extract JSON from the combined response
        const jsonMatch = combinedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          llmData = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON found, create a simple response object
          llmData = {
            answer: "I apologize, but I couldn't analyze the text properly. Could you please rephrase your question?",
            sqlQuery: '',
            visualization: null
          };
        }
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        llmData = {
          answer: "I apologize, but I encountered an error processing the response. Could you please try again?",
          sqlQuery: '',
          visualization: null
        };
      }
      
      // Then analyze data for visualization
      const result = await analyzeQuery(query);
      
      // Add assistant's response to conversation
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: llmData.answer || result.answer
      }]);

      // Update query result with both LLM response and visualization data
      setQueryResult({
        ...result,
        answer: llmData.answer || result.answer,
        sqlQuery: llmData.sqlQuery || result.sqlQuery,
        chartType: llmData.visualization || result.chartType
      });

      setQuery('');
    } catch (error) {
      console.error('Query analysis failed:', error);
      
      const errorMessage = error instanceof Error 
        ? `I apologize, but I encountered an error while processing your query: ${error.message}`
        : 'I apologize, but something went wrong. Could you please rephrase your question?';

      setConversation(prev => [...prev, {
        role: 'assistant',
        content: errorMessage
      }]);

      setQueryResult({
        answer: errorMessage,
        sqlQuery: '',
        needsChart: false,
        chartType: null,
        chartDataColumn: ''
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generatePDF = async () => {
    if (!resultsRef.current) return;
    
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Add title header
    pdf.setFillColor(66, 102, 241);
    pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.text('DataQuery AI Assistant Report', 20, 10);

    let yOffset = 25;

    // Improved conversation history section
    pdf.setFillColor(245, 247, 250);
    pdf.rect(15, yOffset, pdf.internal.pageSize.getWidth() - 30, 10, 'F');
    pdf.setTextColor(66, 102, 241);
    pdf.setFontSize(12);
    pdf.text('Chat History', 20, yOffset + 7);
    yOffset += 15;

    // Add conversation content with natural language styling
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(10);
    conversation.forEach((message) => {
      const role = message.role === 'user' ? 'User' : 'DataQuery AI Assistant';
      
      // Clean up the message content
      let content = message.content
        .replace(/Ø[=>][\Ý\Üd]\s*/g, '')
        .replace(/\(\d{1,2}:\d{2}\s*(?:AM|PM)\):\s*/g, '')
        .replace(/^(?:You|Assistant):\s*/g, '')
        .trim();
      
      const lines = pdf.splitTextToSize(`${role}: ${content}`, 165);
      
      // Add message bubble with improved styling
      pdf.setDrawColor(200, 200, 200);
      pdf.setFillColor(
        message.role === 'user' ? 235 : 240,
        message.role === 'user' ? 242 : 255,
        message.role === 'user' ? 254 : 244
      );
      
      const boxHeight = (lines.length * 5) + 8;
      pdf.roundedRect(20, yOffset - 2, 170, boxHeight, 3, 3, 'FD');
      
      // Add message content
      lines.forEach((line: string, index: number) => {
        pdf.text(line, 25, yOffset + 3 + (index * 5));
      });
      yOffset += boxHeight + 5;
    });

    // Add SQL Query section with clear separation
    if (queryResult?.sqlQuery) {
      const uniqueQueries = new Set();
      const formattedQuery = formatSQLQuery(queryResult.sqlQuery);

      if (!uniqueQueries.has(formattedQuery)) {
        uniqueQueries.add(formattedQuery);
        yOffset += 10;
        pdf.setFillColor(245, 247, 250);
        pdf.rect(15, yOffset, pdf.internal.pageSize.getWidth() - 30, 10, 'F');
        pdf.setTextColor(66, 102, 241);
        pdf.setFontSize(12);
        pdf.text('Generated SQL Query', 20, yOffset + 7);
        yOffset += 15;

        // Format and add the SQL query
        const queryLines = pdf.splitTextToSize(formattedQuery, 165);

        pdf.setTextColor(0, 0, 0);
        queryLines.forEach((line: string, index: number) => {
          pdf.text(line, 25, yOffset + 3 + (index * 5));
        });
        yOffset += (queryLines.length * 5) + 10; // Adjust yOffset to prevent overlap
      }
    }

    // Update the query results section
    if (queryResult) {
      // Check if we need a new page
      if (yOffset > 250) {
        pdf.addPage();
        yOffset = 20;
      }

      // Query content with improved styling
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(10);
      pdf.setDrawColor(200, 200, 200);
      pdf.setFillColor(248, 250, 252); // Light gray background for SQL

      
      
      

      // Add query execution time if available
      if (queryResult.executionTime) {
        pdf.setTextColor(128, 128, 128);
        pdf.text(`Execution Time: ${queryResult.executionTime}ms`, 20, yOffset);
        yOffset += 10;
      }
    }

    // Add Data Visualization section
    if (queryResult?.needsChart || selectedColumn) {
      // Always start chart on a new page for better layout
      pdf.addPage();
      yOffset = 20;

      // Add visualization section header
      pdf.setFillColor(240, 242, 245);
      pdf.rect(15, yOffset, pdf.internal.pageSize.getWidth() - 30, 10, 'F');
      pdf.setTextColor(66, 102, 241);
      pdf.setFontSize(12);
      pdf.text('Data Visualization', 20, yOffset + 7);
      yOffset += 20;

      // Capture and add the chart
      const chartContainer = document.querySelector('.w-full.h-\\[400px\\]') as HTMLElement;
      if (chartContainer) {
        try {
          // Wait for any animations to complete
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Add white background for chart
          pdf.setFillColor(255, 255, 255);
          pdf.setDrawColor(200, 210, 230);
          pdf.roundedRect(15, yOffset, pdf.internal.pageSize.getWidth() - 30, 120, 3, 3, 'FD');

          // Capture the chart with improved settings
          const canvas = await html2canvas(chartContainer, {
            backgroundColor: '#FFFFFF',
            scale: 2, // Higher resolution
            logging: false,
            useCORS: true,
            allowTaint: true,
            onclone: (clonedDoc) => {
              const clonedChart = clonedDoc.querySelector('.w-full.h-\\[400px\\]') as HTMLElement;
              if (clonedChart) {
                clonedChart.style.visibility = 'visible';
                clonedChart.style.display = 'block';
                clonedChart.style.height = '400px';
                clonedChart.style.width = '100%';
                clonedChart.style.backgroundColor = '#FFFFFF';
                
                // Ensure all chart elements are visible
                const chartElements = clonedChart.querySelectorAll('.recharts-wrapper, .recharts-surface');
                chartElements.forEach(el => {
                  (el as HTMLElement).style.visibility = 'visible';
                  (el as HTMLElement).style.display = 'block';
                });
              }
            }
          });

          const imgData = canvas.toDataURL('image/png');
          
          // Calculate dimensions to fit the chart properly
          const pageWidth = pdf.internal.pageSize.getWidth();
          const margin = 20;
          const maxWidth = pageWidth - (2 * margin);
          const maxHeight = 120;
          
          const imgWidth = canvas.width;
          const imgHeight = canvas.height;
          
          let finalWidth = maxWidth;
          let finalHeight = (imgHeight * maxWidth) / imgWidth;
          
          if (finalHeight > maxHeight) {
            finalHeight = maxHeight;
            finalWidth = (imgWidth * maxHeight) / imgHeight;
          }
          
          const xOffset = (pageWidth - finalWidth) / 2;
          
          // Add the chart image
          pdf.addImage(imgData, 'PNG', xOffset, yOffset + 5, finalWidth, finalHeight);
          
          // Add chart information
          yOffset += finalHeight + 15;
          pdf.setFontSize(10);
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Chart Type: ${chartType.toUpperCase()}`, 20, yOffset);
          if (selectedColumn) {
            pdf.text(`Selected Column: ${selectedColumn}`, 20, yOffset + 5);
          }

        } catch (error) {
          console.error('Error capturing chart:', error);
          pdf.setTextColor(255, 0, 0);
          pdf.text('Error capturing chart visualization', 20, yOffset + 10);
          pdf.text(`Error details: ${error instanceof Error ? error.message : 'Unknown error'}`, 20, yOffset + 15);
        }
      }
    }

    pdf.save(`data-query-report-${new Date().getTime()}.pdf`);
  };

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const paginatedData = data.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );
  const renderChart = () => {
    if (!queryResult?.chartData || !queryResult.chartData.length) {
      return (
        <div className={`h-64 flex items-center justify-center border-2 border-dashed rounded-lg ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50'}`}>
          <div className="text-center space-y-2">
            {chartType === 'pie' && <PieChart className={`h-8 w-8 mx-auto ${darkMode ? 'text-gray-600' : 'text-indigo-400'}`} />}
            {chartType === 'bar' && <BarChart className={`h-8 w-8 mx-auto ${darkMode ? 'text-gray-600' : 'text-indigo-400'}`} />}
            {chartType === 'line' && <LineChart className={`h-8 w-8 mx-auto ${darkMode ? 'text-gray-600' : 'text-indigo-400'}`} />}
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              No data to visualize
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-[400px]" ref={chartRef}>
        <ChartComponent
          data={queryResult.chartData}
          chartType={chartType}
          darkMode={darkMode}
        />
      </div>
    );
  };

  const toggleVoiceInput = () => {
    if (!recognition) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50'}`}>
      {showLanding && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50 landing-overlay">
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              DataQuery AI Assistant
            </h1>
            <p className="text-xl text-gray-300">
              Analyze your data with natural language
            </p>
          </div>
        </div>
      )}

      <nav className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} shadow-lg border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Database className={`h-8 w-8 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  DataQuery AI Assistant
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Analyze your data with natural language
                </p>
              </div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-600'} hover:opacity-80`}
            >
              {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* File Upload */}
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} rounded-xl shadow-sm border p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Data Input
                </h2>
                {uploadedFile && (
                  <span className={`text-sm flex items-center px-3 py-1 rounded-full ${darkMode ? 'bg-gray-700 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    {uploadedFile.name}
                  </span>
                )}
              </div>
              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                darkMode 
                  ? 'border-gray-600 hover:bg-gray-700' 
                  : 'border-indigo-200 hover:bg-indigo-50'
              }`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className={`h-8 w-8 mb-2 ${darkMode ? 'text-gray-400' : 'text-indigo-400'}`} />
                  <p className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-indigo-600'}`}>
                    Upload your Excel or CSV file
                  </p>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                    Drag and drop or click to browse
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                />
              </label>
            </div>

            {/* Schema and Data Preview */}
            {schema && (
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} rounded-xl shadow-sm border p-6`}>
                <div className="flex items-center space-x-2 mb-4">
                  <Table className={`h-5 w-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Data Schema & Preview
                  </h2>
                </div>
                
                {/* Schema Table */}
                <div className="mb-6">
                  <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} mb-2`}>
                    Column Definitions
                  </h3>
                  <div className={`${darkMode ? 'bg-gray-900' : 'bg-gray-50'} rounded-lg p-4`}>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr>
                            <th className={`px-4 py-2 text-left text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                              Column
                            </th>
                            <th className={`px-4 py-2 text-left text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>
                              Type
                            </th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                          {schema.columns.map((column, index) => (
                            <tr key={index} className={darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}>
                              <td className={`px-4 py-2 text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                                {column.name}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  darkMode 
                                    ? 'bg-indigo-900 text-indigo-200' 
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}>
                                  {column.type}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Data Preview */}
                <div>
                  <h3 className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-500'} mb-2`}>
                    Data Preview
                  </h3>
                  <div className={`overflow-x-auto ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} rounded-lg p-4`}>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className={`px-4 py-2 text-left text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider w-10`}>
                            Actions
                          </th>
                          {schema.columns.map((column, index) => (
                            <th
                              key={index}
                              className={`px-4 py-2 text-left text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}
                            >
                              {column.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                        {paginatedData.map((row, rowIndex) => (
                          <tr key={rowIndex} className={darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}>
                            <td className={`px-4 py-2 text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                              <button
                                onClick={() => copyRowToClipboard(row, rowIndex)}
                                className={`p-1.5 rounded-full transition-colors ${
                                  darkMode 
                                    ? 'hover:bg-gray-700 focus:bg-gray-700' 
                                    : 'hover:bg-gray-200 focus:bg-gray-200'
                                }`}
                                title="Copy row data"
                              >
                                {copiedRow === rowIndex ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className={`h-4 w-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                                )}
                              </button>
                            </td>
                            {schema.columns.map((column, colIndex) => (
                              <td
                                key={colIndex}
                                className={`px-4 py-2 text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}
                              >
                                {row[column.name]?.toString()}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4">
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className={`inline-flex items-center px-3 py-1 border text-sm font-medium rounded-md ${
                            darkMode
                              ? 'border-gray-600 text-gray-300 bg-gray-800 hover:bg-gray-700'
                              : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                          } disabled:opacity-50`}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </button>
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={currentPage}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (value >= 1 && value <= totalPages) {
                                setCurrentPage(value);
                              }
                            }}
                            className={`w-16 px-2 py-1 text-sm border rounded-md ${
                              darkMode
                                ? 'bg-gray-700 border-gray-600 text-gray-200'
                                : 'bg-white border-gray-300 text-gray-700'
                            } focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                          />
                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            / {totalPages}
                        </span>
                        </div>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className={`inline-flex items-center px-3 py-1 border text-sm font-medium rounded-md ${
                            darkMode
                              ? 'border-gray-600 text-gray-300 bg-gray-800 hover:bg-gray-700'
                              : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                          } disabled:opacity-50`}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Query Input */}
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} rounded-xl shadow-sm border p-6`}>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                Conversation History
              </h2>
              <div className="space-y-4 mb-4 max-h-60 overflow-y-auto">
                {conversation.map((message, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      message.role === 'user'
                        ? darkMode
                          ? 'bg-gray-700 ml-8'
                          : 'bg-indigo-50 ml-8'
                        : darkMode
                          ? 'bg-gray-900 mr-8'
                          : 'bg-gray-50 mr-8'
                    }`}
                  >
                    <p className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                      {message.content}
                    </p>
                  </div>
                ))}
              </div>
              
              <form onSubmit={handleQuerySubmit}>
                <div className="relative">
                  <textarea
                    className={`w-full h-32 px-4 py-3 rounded-xl resize-none ${
                      darkMode
                        ? 'bg-gray-900 text-gray-200 border-gray-600'
                        : 'text-gray-700 border-indigo-200'
                    } border focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                    placeholder="Ask questions about your data in plain English..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={isAnalyzing}
                  />
                  <div className="absolute bottom-3 right-3 flex space-x-2">
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={`p-2 rounded-lg transition-colors ${
                        isListening
                          ? darkMode
                            ? 'bg-red-600 text-white'
                            : 'bg-red-600 text-white'
                          : darkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title={isListening ? "Stop voice input" : "Start voice input"}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                    <button
                      type="submit"
                      disabled={isAnalyzing || !query.trim()}
                      className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm ${
                        darkMode
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50`}
                    >
                      {isAnalyzing ? (
                        <span className="flex items-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Analyzing...
                        </span>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Query
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Results */}
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} rounded-xl shadow-sm border p-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Results
                </h2>
                {queryResult && (
                  <div className="space-x-2">
                    <button
                      onClick={generatePDF}
                      className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-lg ${
                        darkMode
                          ? 'border-gray-600 text-gray-200 bg-gray-700 hover:bg-gray-600'
                          : 'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                      } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </button>
                  </div>
                )}
              </div>
              
              <div ref={resultsRef}>
                {queryResult ? (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100'}`}>
                      <p className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
                        {queryResult.sqlQuery || 'No SQL query available'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Ask a question about your data to see the analysis results here
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Data Visualization */}
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-indigo-100'} rounded-xl shadow-sm border p-6 mt-6`}>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  DATA VISUALIZE
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setChartType('pie')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      chartType === 'pie'
                        ? darkMode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : darkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <PieChart className="h-4 w-4 inline-block mr-1" />
                    Pie Chart
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      chartType === 'bar'
                        ? darkMode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : darkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <BarChart className="h-4 w-4 inline-block mr-1" />
                    Bar Chart
                  </button>
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      chartType === 'line'
                        ? darkMode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : darkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <LineChart className="h-4 w-4 inline-block mr-1" />
                    Line Chart
                  </button>
                </div>
              </div>

              {/* Column Selector */}
              {schema && schema.columns.length > 0 && (
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Select Column to Visualize
                  </label>
                  <select
                    value={selectedColumn}
                    onChange={(e) => {
                      setSelectedColumn(e.target.value);
                      updateChartData(e.target.value);
                    }}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-gray-200'
                        : 'bg-white border-gray-300 text-gray-700'
                    } focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
                  >
                    {schema.columns.map((column) => (
                      <option key={column.name} value={column.name}>
                        {column.name} ({column.type})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Render the chart based on selected type */}
              {renderChart()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;