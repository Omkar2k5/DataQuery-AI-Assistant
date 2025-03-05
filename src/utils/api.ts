export interface DataSchema {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryResult {
  answer: string;
  sqlQuery: string;
  needsChart: boolean;
  chartType: 'pie' | 'bar' | 'line' | null;
  chartDataColumn: string;
  chartData?: Array<{ name: string; value: number }>;
}

// Helper function to calculate average
const calculateAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
};

// Helper function to count occurrences
const countOccurrences = (values: any[]): Record<string, number> => {
  return values.reduce((acc, val) => {
    const key = String(val ?? 'Unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

// Helper function to check if query is about the dataset structure
const isDatasetQuery = (query: string): boolean => {
  const datasetKeywords = ['dataset', 'columns', 'schema', 'structure', 'fields'];
  const queryWords = query.toLowerCase().split(' ');
  return datasetKeywords.some(keyword => queryWords.includes(keyword));
};

// Helper function to create dataset summary
const createDatasetSummary = (schema: DataSchema, data: any[]): QueryResult => {
  const columnTypes = schema.columns.reduce((acc, col) => {
    acc[col.type] = (acc[col.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const answer = `The dataset "${schema.tableName}" has ${schema.columns.length} columns:\n` +
    schema.columns.map(col => `- ${col.name} (${col.type})`).join('\n');

  return {
    answer,
    sqlQuery: 'SELECT * FROM information_schema.columns WHERE table_name = ' + schema.tableName,
    needsChart: true,
    chartType: 'pie',
    chartDataColumn: 'Column Types',
    chartData: Object.entries(columnTypes).map(([type, count]) => ({
      name: type,
      value: count
    }))
  };
};

export const analyzeData = async (
  query: string, 
  schema: DataSchema, 
  data: any[]
): Promise<QueryResult> => {
  try {
    // Input validation
    if (!query) {
      throw new Error("Query cannot be empty");
    }
    if (!schema || !schema.columns || schema.columns.length === 0) {
      throw new Error("Invalid schema: No columns defined");
    }
    if (!data || data.length === 0) {
      throw new Error("No data available for analysis");
    }

    const queryLower = query.toLowerCase();
    const words = queryLower.split(' ');

    // Handle dataset structure queries
    if (isDatasetQuery(queryLower)) {
      return createDatasetSummary(schema, data);
    }
    
    // Find relevant columns based on the query
    const relevantColumns = schema.columns.filter(col => 
      words.some(word => col.name.toLowerCase().includes(word))
    );

    // If no specific columns found, check for general queries
    if (relevantColumns.length === 0) {
      if (words.includes('all') || words.includes('every')) {
        // Return summary of all columns
        return createDatasetSummary(schema, data);
      }
      throw new Error(
        "Could not find relevant columns for your query. Available columns are: " +
        schema.columns.map(col => col.name).join(', ')
      );
    }

    let result: QueryResult = {
      answer: '',
      sqlQuery: '',
      needsChart: true,
      chartType: 'bar',
      chartDataColumn: relevantColumns[0].name,
      chartData: []
    };

    try {
      // Handle different types of queries
      if (words.includes('average') || words.includes('avg')) {
        const numericColumns = relevantColumns.filter(col => col.type === 'number');
        if (numericColumns.length === 0) {
          throw new Error(`No numeric columns found among: ${relevantColumns.map(col => col.name).join(', ')}`);
        }

        const column = numericColumns[0];
        const values = data.map(row => {
          const val = row[column.name];
          return typeof val === 'number' ? val : parseFloat(val);
        }).filter(val => !isNaN(val));

        if (values.length === 0) {
          throw new Error(`No valid numeric values found in column: ${column.name}`);
        }

        const avg = calculateAverage(values);
        result.answer = `The average ${column.name} is ${avg.toFixed(2)}`;
        result.sqlQuery = `SELECT AVG(${column.name}) FROM ${schema.tableName}`;
        result.chartType = 'bar';
        result.chartDataColumn = column.name;
        result.chartData = data.map((row, index) => ({
          name: `Row ${index + 1}`,
          value: parseFloat(row[column.name]) || 0
        }));
      }
      // Handle count queries
      else if (words.includes('count') || words.includes('how') || words.includes('many')) {
        const column = relevantColumns[0];
        const occurrences = countOccurrences(data.map(row => row[column.name]));
        
        if (Object.keys(occurrences).length === 0) {
          throw new Error(`No data found for column: ${column.name}`);
        }

        result.answer = `Distribution of ${column.name}:\n` +
          Object.entries(occurrences)
            .map(([value, count]) => `${value}: ${count}`)
            .join('\n');
        result.sqlQuery = `SELECT ${column.name}, COUNT(*) FROM ${schema.tableName} GROUP BY ${column.name}`;
        result.chartType = 'pie';
        result.chartDataColumn = column.name;
        result.chartData = Object.entries(occurrences).map(([name, value]) => ({
          name,
          value
        }));
      }
      // Handle distribution/show queries
      else if (words.includes('show') || words.includes('distribution') || words.includes('display')) {
        const column = relevantColumns[0];
        if (column.type === 'number') {
          const values = data.map(row => parseFloat(row[column.name])).filter(val => !isNaN(val));
          if (values.length === 0) {
            throw new Error(`No valid numeric values found in column: ${column.name}`);
          }

          result.answer = `Showing distribution of ${column.name}`;
          result.sqlQuery = `SELECT ${column.name} FROM ${schema.tableName} ORDER BY ${column.name}`;
          result.chartType = 'line';
          result.chartData = data.map((row, index) => ({
            name: `Row ${index + 1}`,
            value: parseFloat(row[column.name]) || 0
          }));
        } else {
          const occurrences = countOccurrences(data.map(row => row[column.name]));
          if (Object.keys(occurrences).length === 0) {
            throw new Error(`No data found for column: ${column.name}`);
          }

          result.answer = `Showing distribution of ${column.name}`;
          result.sqlQuery = `SELECT ${column.name}, COUNT(*) FROM ${schema.tableName} GROUP BY ${column.name}`;
          result.chartType = 'bar';
          result.chartData = Object.entries(occurrences).map(([name, value]) => ({
            name,
            value
          }));
        }
      }
      // Default to showing data distribution
      else {
        const column = relevantColumns[0];
        if (column.type === 'number') {
          const values = data.map(row => parseFloat(row[column.name])).filter(val => !isNaN(val));
          if (values.length === 0) {
            throw new Error(`No valid numeric values found in column: ${column.name}`);
          }

          result.answer = `Showing values of ${column.name}`;
          result.sqlQuery = `SELECT ${column.name} FROM ${schema.tableName}`;
          result.chartType = 'bar';
          result.chartData = data.map((row, index) => ({
            name: `Row ${index + 1}`,
            value: parseFloat(row[column.name]) || 0
          }));
        } else {
          const occurrences = countOccurrences(data.map(row => row[column.name]));
          if (Object.keys(occurrences).length === 0) {
            throw new Error(`No data found for column: ${column.name}`);
          }

          result.answer = `Showing distribution of ${column.name}`;
          result.sqlQuery = `SELECT ${column.name}, COUNT(*) FROM ${schema.tableName} GROUP BY ${column.name}`;
          result.chartType = 'pie';
          result.chartData = Object.entries(occurrences).map(([name, value]) => ({
            name,
            value
          }));
        }
      }

      return result;
    } catch (analysisError: unknown) {
      console.error('Error during data analysis:', analysisError);
      const errorMessage = analysisError instanceof Error 
        ? analysisError.message 
        : 'Unknown analysis error';
      throw new Error(`Analysis failed: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Error in analyzeData:', error);
    // Return a more user-friendly error message
    throw new Error(
      error instanceof Error 
        ? error.message
        : 'An unexpected error occurred while analyzing data. Please try again.'
    );
  }
};