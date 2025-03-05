import React from 'react';
import ChartComponent from './ChartComponent';
import { PieChart, BarChart, LineChart } from 'lucide-react';

interface DataVisualizationProps {
  data: Array<{ name: string; value: number }> | undefined;
  chartType: 'pie' | 'bar' | 'line';
  darkMode: boolean;
}

const DataVisualization: React.FC<DataVisualizationProps> = ({ data, chartType, darkMode }) => {
  if (!data || !data.length) {
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

  const transformedData = data.map(item => ({
    name: item.name || 'Unnamed',
    value: typeof item.value === 'number' ? item.value : parseFloat(item.value) || 0
  }));

  return (
    <div className="w-full h-[400px]">
      <ChartComponent
        data={transformedData}
        chartType={chartType}
        darkMode={darkMode}
      />
    </div>
  );
};

export default DataVisualization;