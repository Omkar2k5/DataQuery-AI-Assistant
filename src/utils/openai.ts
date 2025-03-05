import axios from 'axios';
import axiosError from 'axios';
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'qwen2.5-coder:7b';
import error from 'axios';

interface OllamaResponse {
  response?: string;
  error?: string;
  context?: number[];
}

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
  // Analyze schema and column sizes
  const schemaInfo = schema.columns.map((col: { name: string; type: string }) => {
    const uniqueValues = new Set();
    data.forEach(item => {
      if (item[col.name] !== undefined && item[col.name] !== null) {
        uniqueValues.add(item[col.name]);
      }
    });
    return {
      name: col.name,
      type: col.type,
      uniqueCount: uniqueValues.size,
      totalCount: data.length
    };
  });
  try {
    // Construct the prompt for Ollama
    const prompt = `
      You are a data analysis assistant specialized in SQL query generation and natural language explanations. Given the following dataset schema and user query, analyze the data and provide both a natural language answer and a SQL query.

      Schema:
      ${JSON.stringify(schema, null, 2)}

      Sample Data (first 5 rows):
      ${JSON.stringify(data.slice(0, 5), null, 2)}

      User Query:
      ${query}

      Analyze the data and provide both a natural language explanation and a SQL query that answers the user's question.
      
      Respond strictly in JSON format using this structure:
      {
        "answer": "A clear, natural language explanation of the analysis results",  
        "sqlQuery": "The SQL query that answers the question",
        "needsChart": boolean,
        "chartType": "pie" | "bar" | "line" | null,
        "chartDataColumn": "string"
      }

      Guidelines:
      1. The answer field should contain a clear, natural language explanation of the analysis.
      2. The sqlQuery field should contain the SQL query that answers the question.
      3. If the analysis would benefit from visualization, set needsChart to true and specify appropriate chart settings.
      4. Ensure your response is valid JSON and includes all required fields.
    `;

    console.log("🚀 Sending request to Ollama...");
    console.log("📝 Request payload:", {
      model: MODEL_NAME,
      prompt: prompt.slice(0, 100) + "..." // Log truncated prompt for readability
    });

    let response;
    try {
      response = await axios.post<OllamaResponse>(
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
          timeout: 30000, // 30 second timeout
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      // Parse the response and ensure it includes chart data
      const result = JSON.parse(response.data.response || '{}');
      
      // If chart is needed but no chart data is provided, generate sample data
      if (result.needsChart && !result.chartData) {
        const selectedColumn = result.chartDataColumn || schema.columns[0].name;
        const aggregatedData = new Map<string, number>();

        // Aggregate data based on the selected column
        data.forEach(row => {
          const key = String(row[selectedColumn] || 'Unknown');
          aggregatedData.set(key, (aggregatedData.get(key) || 0) + 1);
        });

        // Convert aggregated data to chart format
        result.chartData = Array.from(aggregatedData.entries()).map(([name, value]) => ({
          name,
          value
        }));
      }

      return result;
    } catch (error) {
      if (axios.isAxiosError(axiosError)) {
        if (axiosError.code === 'ECONNREFUSED') {
          throw new Error(
            "Could not connect to Ollama. Please ensure Ollama is running on port 11434."
          );
        }
        if (axiosError.response) {
          // Server responded with error
          console.error("❌ Ollama API Error Response:", {
            status: axiosError.response.status,
            data: axiosError.response.data
          });
          throw new Error(
            `Ollama API error (${axiosError.response.status}): ${
              axiosError.response.data?.error || 'Unknown error'
            }`
          );
        } else if (axiosError.request) {
          // Request made but no response
          console.error("❌ No response received from Ollama");
          throw new Error(
            "No response received from Ollama. The request timed out or failed."
          );
        }
        throw new Error(`Network error: ${axiosError.message}`);
      }
      throw axiosError; // Re-throw if not an axios error
    }

    console.log("🔄 Ollama Response:", {
      status: response.status,
      headers: response.headers,
      data: response.data
    });

    if (!response.data) {
      throw new Error("Empty response received from Ollama.");
    }

    if (response.data.error) {
      throw new Error(`Ollama error: ${response.data.error}`);
    }

    if (!response.data.response) {
      throw new Error(
        "Invalid response format: Missing 'response' field in Ollama response."
      );
    }

    // Extract and parse the JSON response
    const resultText = response.data.response;
    console.log("📝 Raw response text:", resultText);

    let result: AnalysisResult;
    try {
      // Find JSON content between curly braces
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("❌ No JSON found in response text:", resultText);
        throw new Error("No JSON found in Ollama response");
      }
      const jsonStr = jsonMatch[0];
      console.log("🔍 Extracted JSON string:", jsonStr);
      
      const parsed = JSON.parse(jsonStr) as AnalysisResult;
      
      // Validate required fields
      const requiredFields = ['answer', 'sqlQuery', 'needsChart', 'chartType', 'chartDataColumn'] as const;
      const missingFields = requiredFields.filter(field => !(field in parsed));
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields in response: ${missingFields.join(', ')}`);
      }

      result = parsed;

    } catch (parseError) {
      console.error("❌ JSON Parsing Error:", parseError);
      console.log("📝 Raw Response Content:", resultText);
      throw new Error(
        `Failed to parse Ollama response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
      );
    }

    // If chart is needed, process chart data
    if (result.needsChart && result.chartDataColumn) {
      try {
        result.chartData = processDataForChart(data, result.chartDataColumn);
      } catch (chartError) {
        console.error("❌ Chart Data Processing Error:", chartError);
        throw new Error(
          `Failed to process chart data: ${chartError instanceof Error ? chartError.message : 'Unknown error'}`
        );
      }
    }

    return result;
  } catch (error) {
    console.error("❌ Error in analyzeDataWithAI:", error);
    // Ensure we always return an error with a readable message
    throw error instanceof Error 
      ? error 
      : new Error('An unexpected error occurred while analyzing data');
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
