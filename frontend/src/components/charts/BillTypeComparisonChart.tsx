'use client'

import { useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface BillTypeComparisonChartProps {
  gstCount: number
  nonGstCount: number
  gstRevenue: number
  nonGstRevenue: number
}

export default function BillTypeComparisonChart({ gstCount, nonGstCount, gstRevenue, nonGstRevenue }: BillTypeComparisonChartProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null)
  const { isDarkMode } = useTheme()

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      animation: {
        duration: 500
      }
    },
    title: {
      text: 'GST vs Non-GST Bills',
      align: 'left',
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    xAxis: {
      categories: ['Bill Count', 'Revenue'],
      crosshair: true,
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: {
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      }
    },
    yAxis: [{
      min: 0,
      title: {
        text: 'Count',
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      },
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: {
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      }
    }, {
      min: 0,
      title: {
        text: 'Revenue (₹)',
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      },
      opposite: true,
      gridLineColor: isDarkMode ? '#374151' : undefined,
      lineColor: isDarkMode ? '#374151' : undefined,
      tickColor: isDarkMode ? '#374151' : undefined,
      labels: {
        style: {
          color: isDarkMode ? '#9ca3af' : undefined
        }
      }
    }],
    tooltip: {
      shared: true,
      backgroundColor: isDarkMode ? '#1f2937' : undefined,
      borderColor: isDarkMode ? '#374151' : undefined,
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    credits: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: '25%',
        dataLabels: {
          enabled: true,
          formatter: function() {
            if (this.series.name === 'GST Bills' || this.series.name === 'Non-GST Bills') {
              if (this.x === 0) {
                return this.y?.toString() || '0'
              } else {
                return '₹' + (this.y ? Math.round(this.y).toLocaleString('en-IN') : '0')
              }
            }
            return this.y?.toString() || '0'
          }
        },
        animation: false,
        groupPadding: 0.15,
        pointPadding: 0.05
      }
    },
    series: [{
      type: 'column',
      name: 'GST Bills',
      data: [gstCount, gstRevenue],
      yAxis: 0,
      color: '#3b82f6'
    }, {
      type: 'column',
      name: 'Non-GST Bills',
      data: [nonGstCount, nonGstRevenue],
      yAxis: 0,
      color: '#8b5cf6'
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 550
        },
        chartOptions: {
          xAxis: {
            visible: true
          },
          plotOptions: {
            series: {
              dataLabels: [{
                enabled: true,
                y: 8,
                style: {
                  fontSize: '10px'
                }
              }]
            }
          }
        }
      }]
    }
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
    </div>
  )
}
