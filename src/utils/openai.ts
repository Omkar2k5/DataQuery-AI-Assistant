import axios from 'axios';

const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'qwen2.5-coder:7b';

interface AnalysisResult {
  answer: string;
  sqlQuery: string;
  needsChart: boolean;
  chartType: 'pie' | 'bar' | 'line' | null;
  chartDataColumn: string;
  chartData?: Array<{ name: string; value: number }>;
}

/**
 * Analyzes data using Ollama's local API.
 * @param query - The user's question about the dataset.
 * @param schema - The dataset schema.
 * @param data - The dataset itself.
 * @returns Analysis results in JSON format.
 */
export const analyzeDataWithAI = async (
  query: string,
  schema: any,
  data: any[]
) => {
  // Handle greeting messages
  const greetings = ['hi', 'hello', 'hey', 'greetings'];
  if (greetings.includes(query.toLowerCase().trim())) {
    return {
      answer: "Hello! I'm your data analysis assistant. You can ask me questions about your data, and I'll help you analyze it. For example, try asking about specific columns, averages, trends, or distributions in your data.",
      sqlQuery: '',
      needsChart: false,
      chartType: null,
      chartDataColumn: '',
      chartData: []
    };
  }

  // Analyze schema and column sizes
  const schemaInfo = schema.columns.map((col: { name: string; type: string }) => {
    const uniqueValues = new Set();
    const valueCounts: { [key: string]: number } = {};
    
    data.forEach(item => {
      if (item[col.name] !== undefined && item[col.name] !== null) {
        const value = String(item[col.name]);
        uniqueValues.add(value);
        valueCounts[value] = (valueCounts[value] || 0) + 1;
      }
    });

    return {
      name: col.name,
      type: col.type,
      uniqueCount: uniqueValues.size,
      totalCount: data.length,
      valueCounts: valueCounts
    };
  });

  try {
    // Construct the prompt for Ollama
    const prompt = `You are a data analysis assistant specialized in SQL query generation and natural language explanations. 
    Analyze the following dataset and question:

    Schema:
    ${JSON.stringify(schema, null, 2)}

    Sample Data (first 5 rows):
    ${JSON.stringify(data.slice(0, 5), null, 2)}

    Column Statistics:
    ${JSON.stringify(schemaInfo, null, 2)}

    User Question:
    ${query}

    Provide a response in the following JSON format only:
    {
      "answer": "A clear, conversational explanation including specific values and counts from the data",
      "sqlQuery": "The SQL query to get the results",
      "visualization": "pie, bar, or line"
    }

    For categorical questions (like types, categories, etc):
    1. Include ALL unique values and their counts in the answer
    2. Format numbers with commas for readability
    3. Use bullet points for lists
    4. Suggest appropriate visualizations

    Keep the response format strictly as JSON.`;

    // Send request to Ollama
    const response = await axios.post(
      OLLAMA_API_URL,
      {
        model: MODEL_NAME,
        prompt,
        stream: false
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    if (!response.data || !response.data.response) {
      throw new Error("Invalid response from Ollama");
    }

    const llmResponse = response.data.response;
    console.log("📝 LLM Response:", llmResponse);

    // Extract SQL query if present in the response
    const sqlMatch = llmResponse.match(/```sql\n([\s\S]*?)\n```/);
    const sqlQuery = sqlMatch ? sqlMatch[1].trim() : '';

    // Create the result object
    const result: AnalysisResult = {
      answer: llmResponse.replace(/```sql\n[\s\S]*?\n```/g, '').trim(), // Remove SQL code blocks
      sqlQuery: sqlQuery,
      needsChart: llmResponse.toLowerCase().includes('visualiz') || llmResponse.toLowerCase().includes('chart'),
      chartType: determineChartType(llmResponse),
      chartDataColumn: determineChartColumn(llmResponse, schema.columns)
    };

    // Add chart data if needed
    if (result.needsChart && result.chartDataColumn) {
      result.chartData = processDataForChart(data, result.chartDataColumn);
    }

    return result;
  } catch (error: unknown) {
    console.error("❌ Error in analyzeDataWithAI:", error);
    
    // Handle errors more gracefully
    if (!schema || !schema.columns) {
      return {
        answer: "Please upload a dataset first. I'll be happy to help you analyze it once you do!",
        sqlQuery: '',
        needsChart: false,
        chartType: null,
        chartDataColumn: '',
        chartData: []
      };
    }
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unexpected error occurred while analyzing data';
      
    return {
      answer: `I apologize, but I encountered an issue while processing your request. ${errorMessage}. Please try asking a more specific question about your data.`,
      sqlQuery: '',
      needsChart: false,
      chartType: null,
      chartDataColumn: '',
      chartData: []
    };
  }
};

/**
 * Processes data for visualization.
 * @param data - The dataset.
 * @param column - The column to be visualized.
 * @returns Processed data for the chart.
 */
const processDataForChart = (data: any[], column: string) => {
  if (!data.length || !column) return [];

  // Get unique values and their counts for the specified column
  const uniqueValues = new Set();
  data.forEach(item => {
    if (item[column] !== undefined && item[column] !== null) {
      uniqueValues.add(item[column]);
    }
  });

  // For numerical columns, create value ranges
  const firstValue = data[0][column];
  if (typeof firstValue === 'number') {
    const values = data.map(item => item[column]).filter(val => val !== null && !isNaN(val));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const binCount = Math.min(10, uniqueValues.size); // Max 10 bins
    const binSize = range / binCount;

    const bins = new Array(binCount).fill(0);
    values.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binSize), binCount - 1);
      bins[binIndex]++;
    });

    return bins.map((count, index) => ({
      name: `${(min + index * binSize).toFixed(2)} - ${(min + (index + 1) * binSize).toFixed(2)}`,
      value: count
    }));
  }

  // For categorical columns, count occurrences
  const groupedData = data.reduce((acc: Record<string, number>, curr: any) => {
    const key = String(curr[column] ?? 'undefined');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(groupedData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Limit to top 10 categories
};

// Helper function to determine chart type from LLM response
const determineChartType = (response: string): 'pie' | 'bar' | 'line' | null => {
  const responseLower = response.toLowerCase();
  if (responseLower.includes('pie chart')) return 'pie';
  if (responseLower.includes('bar chart') || responseLower.includes('histogram')) return 'bar';
  if (responseLower.includes('line chart') || responseLower.includes('trend')) return 'line';
  return null;
};

// Helper function to determine which column to visualize
const determineChartColumn = (response: string, columns: Array<{ name: string; type: string }>): string => {
  const responseLower = response.toLowerCase();
  
  // Try to find a mentioned column name in the response
  for (const column of columns) {
    if (responseLower.includes(column.name.toLowerCase())) {
      return column.name;
    }
  }
  
  // Default to the first numeric column if no match found
  const numericColumn = columns.find(col => col.type === 'number');
  return numericColumn ? numericColumn.name : columns[0].name;
};
