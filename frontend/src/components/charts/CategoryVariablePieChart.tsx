'use client'

import { useRef } from 'react'
import Highcharts from 'highcharts'
import HighchartsReact from 'highcharts-react-official'
import { useTheme } from '@/contexts/ThemeContext'
import { getDarkModeChartOptions } from '@/lib/highcharts-config'

interface CategoryVariablePieChartProps {
  data: Array<{ name: string; y: number; z: number }>
}

export default function CategoryVariablePieChart({ data }: CategoryVariablePieChartProps) {
  const chartRef = useRef<HighchartsReact.RefObject>(null)
  const { isDarkMode } = useTheme()

  const options: Highcharts.Options = {
    ...getDarkModeChartOptions(isDarkMode),
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Sales by Category',
      align: 'left',
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    tooltip: {
      headerFormat: '',
      pointFormat: '<span style="color:{point.color}">\u25CF</span> <b>{point.name}</b><br/>' +
        'Revenue: <b>₹{point.y}</b><br/>' +
        'Items Sold: <b>{point.z}</b><br/>',
      backgroundColor: isDarkMode ? '#1f2937' : undefined,
      borderColor: isDarkMode ? '#374151' : undefined,
      style: {
        color: isDarkMode ? '#f3f4f6' : undefined
      }
    },
    plotOptions: {
      pie: {
        innerSize: '20%',
        borderRadius: 5,
        dataLabels: {
          enabled: true,
          format: '{point.name}: {point.percentage:.1f}%',
          style: {
            color: isDarkMode ? '#f3f4f6' : undefined,
            textOutline: isDarkMode ? '1px #111827' : undefined
          }
        }
      }
    },
    legend: {
      itemStyle: {
        color: isDarkMode ? '#f3f4f6' : undefined
      },
      itemHoverStyle: {
        color: isDarkMode ? '#ffffff' : undefined
      }
    },
    credits: {
      enabled: false
    },
    series: [{
      type: 'pie',
      name: 'categories',
      data: data.map(item => ({
        name: item.name,
        y: item.y,
        z: item.z
      })),
      colors: [
        '#4caefe',
        '#3dc3e8',
        '#2dd9db',
        '#1feeaf',
        '#0ff3a0',
        '#00e887',
        '#23e274'
      ]
    }]
  }

  return (
    <div className="w-full">
      <HighchartsReact highcharts={Highcharts} options={options} ref={chartRef} />
    </div>
  )
}
