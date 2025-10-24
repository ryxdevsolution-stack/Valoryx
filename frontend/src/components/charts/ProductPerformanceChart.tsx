'use client'

import { useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface Product {
  name: string
  quantity: number
}

interface ProductPerformanceChartProps {
  mostSelling: Product[]
  lessSelling: Product[]
  nonSelling: Product[]
}

export default function ProductPerformanceChart({ mostSelling, lessSelling, nonSelling }: ProductPerformanceChartProps) {
  const { isDarkMode } = useTheme()
  const chartRef = useRef<HighchartsReact.RefObject>(null)

  // Prepare data for the chart
  const categories: string[] = []
  const mostSellingData: number[] = []
  const lessSellingData: number[] = []
  const nonSellingData: number[] = []

  // Add most selling products
  mostSelling.forEach(p => {
    categories.push(p.name)
    mostSellingData.push(p.quantity)
    lessSellingData.push(0)
    nonSellingData.push(0)
  })

  // Add less selling products
  lessSelling.forEach(p => {
    categories.push(p.name)
    mostSellingData.push(0)
    lessSellingData.push(p.quantity)
    nonSellingData.push(0)
  })

  // Add non-selling products (as negative values)
  nonSelling.forEach(p => {
    categories.push(p.name)
    mostSellingData.push(0)
    lessSellingData.push(0)
    nonSellingData.push(-1) // Show as -1 to indicate non-selling
  })

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: Math.max(300, categories.length * 30)
    },
    title: {
      text: 'Product Performance Analysis',
      align: 'left',
      style: {
        fontSize: '16px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      }
    },
    subtitle: {
      text: `${mostSelling.length} best • ${lessSelling.length} moderate • ${nonSelling.length} non-selling`,
      align: 'left',
      style: {
        fontSize: '12px',
        color: isDarkMode ? '#9ca3af' : '#666'
      }
    },
    xAxis: {
      categories: categories,
      lineColor: isDarkMode ? '#374151' : '#e5e7eb',
      labels: {
        style: {
          fontSize: '11px',
          fontWeight: '500',
          color: isDarkMode ? '#f3f4f6' : '#1f2937'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Quantity Sold',
        style: {
          fontSize: '12px',
          color: isDarkMode ? '#f3f4f6' : '#1f2937'
        }
      },
      gridLineColor: isDarkMode ? '#374151' : '#f3f4f6',
      labels: {
        formatter: function() {
          return Math.abs(this.value as number).toString()
        },
        style: {
          fontSize: '11px',
          color: isDarkMode ? '#9ca3af' : '#666'
        }
      },
      plotLines: [{
        value: 0,
        width: 2,
        color: isDarkMode ? '#6b7280' : '#9ca3af',
        zIndex: 4
      }]
    },
    tooltip: {
      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
      borderColor: isDarkMode ? '#374151' : '#e5e7eb',
      borderRadius: 8,
      shadow: true,
      useHTML: true,
      formatter: function() {
        const absValue = Math.abs(this.y as number)
        let categoryText = ''
        let statusText = ''
        const textColor = isDarkMode ? '#f3f4f6' : '#1f2937'
        const secondaryColor = isDarkMode ? '#9ca3af' : '#666'

        if (this.series.name === 'Most Selling') {
          categoryText = 'Best Performer'
          statusText = `Sold: <strong>${absValue} units</strong>`
        } else if (this.series.name === 'Less Selling') {
          categoryText = 'Moderate Performer'
          statusText = `Sold: <strong>${absValue} units</strong>`
        } else {
          categoryText = 'Non-Selling'
          statusText = '<strong>0 units sold</strong>'
        }

        return `
          <div style="padding: 8px; min-width: 180px;">
            <strong style="font-size: 13px; color: ${textColor};">${this.x}</strong><br/>
            <span style="color: ${this.color}; font-size: 12px;">●</span> ${categoryText}<br/>
            <span style="font-size: 11px; color: ${secondaryColor};">${statusText}</span>
          </div>
        `
      }
    },
    plotOptions: {
      bar: {
        stacking: 'normal',
        borderRadius: 4,
        dataLabels: {
          enabled: true,
          formatter: function() {
            const val = Math.abs(this.y as number)
            return val > 0 ? val.toString() : 'None'
          },
          style: {
            fontSize: '10px',
            fontWeight: '600',
            textOutline: 'none',
            color: isDarkMode ? '#f3f4f6' : '#374151'
          }
        },
        pointPadding: 0.1,
        groupPadding: 0.05
      }
    },
    legend: {
      align: 'right',
      verticalAlign: 'top',
      layout: 'horizontal',
      itemStyle: {
        fontSize: '11px',
        fontWeight: '600',
        color: isDarkMode ? '#f3f4f6' : '#1f2937'
      }
    },
    credits: {
      enabled: false
    },
    series: [{
      type: 'bar',
      name: 'Most Selling',
      data: mostSellingData,
      color: '#10b981'
    }, {
      type: 'bar',
      name: 'Less Selling',
      data: lessSellingData,
      color: '#f59e0b'
    }, {
      type: 'bar',
      name: 'Non-Selling',
      data: nonSellingData,
      color: '#ef4444'
    }],
    responsive: {
      rules: [{
        condition: {
          maxWidth: 500
        },
        chartOptions: {
          chart: {
            height: Math.max(250, categories.length * 25)
          },
          xAxis: {
            labels: {
              style: {
                fontSize: '10px'
              }
            }
          },
          plotOptions: {
            bar: {
              dataLabels: {
                style: {
                  fontSize: '9px'
                }
              }
            }
          },
          legend: {
            align: 'center',
            verticalAlign: 'bottom',
            layout: 'horizontal'
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
