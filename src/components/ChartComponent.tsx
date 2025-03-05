import React, { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface ChartComponentProps {
  data: Array<{ name: string; value: number }>;
  chartType: 'pie' | 'bar' | 'line';
  darkMode: boolean;
}

const ChartComponent: React.FC<ChartComponentProps> = ({ data, chartType, darkMode }) => {
  const chartRef = useRef<ChartJS>(null);

  const chartColors = [
    '#6366F1',
    '#EC4899',
    '#8B5CF6',
    '#10B981',
    '#F59E0B',
    '#3B82F6',
    '#EF4444',
    '#14B8A6',
    '#F97316',
    '#8B5CF6'
  ];

  const getChartConfig = () => {
    if (!data || data.length === 0) {
      return null;
    }

    const labels = data.map(item => item.name);
    const values = data.map(item => Number(item.value));

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            color: darkMode ? '#E5E7EB' : '#374151',
            font: {
              size: 12
            }
          }
        },
        title: {
          display: false
        }
      }
    };

    switch (chartType) {
      case 'pie':
        return {
          type: 'pie' as const,
          data: {
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: chartColors,
                borderColor: darkMode ? '#1F2937' : '#FFFFFF',
                borderWidth: 2
              }
            ]
          },
          options: {
            ...commonOptions,
            cutout: '30%'
          }
        };

      case 'bar':
        return {
          type: 'bar' as const,
          data: {
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: chartColors,
                borderColor: chartColors,
                borderWidth: 1
              }
            ]
          },
          options: {
            ...commonOptions,
            scales: {
              y: {
                beginAtZero: true,
                grid: {
                  color: darkMode ? '#374151' : '#E5E7EB'
                },
                ticks: {
                  color: darkMode ? '#E5E7EB' : '#374151'
                }
              },
              x: {
                grid: {
                  color: darkMode ? '#374151' : '#E5E7EB'
                },
                ticks: {
                  color: darkMode ? '#E5E7EB' : '#374151'
                }
              }
            }
          }
        };

      case 'line':
        return {
          type: 'line' as const,
          data: {
            labels,
            datasets: [
              {
                data: values,
                borderColor: chartColors[0],
                backgroundColor: `${chartColors[0]}33`,
                fill: true,
                tension: 0.4
              }
            ]
          },
          options: {
            ...commonOptions,
            scales: {
              y: {
                beginAtZero: true,
                grid: {
                  color: darkMode ? '#374151' : '#E5E7EB'
                },
                ticks: {
                  color: darkMode ? '#E5E7EB' : '#374151'
                }
              },
              x: {
                grid: {
                  color: darkMode ? '#374151' : '#E5E7EB'
                },
                ticks: {
                  color: darkMode ? '#E5E7EB' : '#374151'
                }
              }
            }
          }
        };

      default:
        return null;
    }
  };

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      const config = getChartConfig();
      if (config) {
        chart.data = config.data;
        chart.options = config.options;
        chart.update('none');
      }
    }
  }, [data, chartType, darkMode]);

  const config = getChartConfig();
  if (!config) return null;

  return (
    <div style={{ height: '400px', width: '100%' }}>
      <Chart
        type={config.type}
        data={config.data}
        options={config.options}
        ref={chartRef}
      />
    </div>
  );
};

export default ChartComponent;