import Highcharts from 'highcharts'

let initialized = false

export function initializeHighcharts() {
  if (typeof window !== 'undefined' && !initialized) {
    // Use require to load modules with .default for proper ES module support
    const addHighchartsMore = require('highcharts/highcharts-more').default || require('highcharts/highcharts-more')
    const addSolidGauge = require('highcharts/modules/solid-gauge').default || require('highcharts/modules/solid-gauge')

    if (typeof addHighchartsMore === 'function') {
      addHighchartsMore(Highcharts)
    }
    if (typeof addSolidGauge === 'function') {
      addSolidGauge(Highcharts)
    }

    initialized = true
  }
  return Highcharts
}

// Dark mode theme configuration for Highcharts
export function getDarkModeChartOptions(isDarkMode: boolean): Partial<Highcharts.Options> {
  if (!isDarkMode) {
    return {}
  }

  return {
    chart: {
      backgroundColor: 'transparent',
      style: {
        fontFamily: 'inherit'
      }
    },
    title: {
      style: {
        color: '#f3f4f6',
        fontWeight: '600'
      }
    },
    subtitle: {
      style: {
        color: '#9ca3af'
      }
    },
    xAxis: {
      gridLineColor: '#374151',
      lineColor: '#374151',
      tickColor: '#374151',
      labels: {
        style: {
          color: '#9ca3af'
        }
      },
      title: {
        style: {
          color: '#9ca3af'
        }
      }
    },
    yAxis: {
      gridLineColor: '#374151',
      lineColor: '#374151',
      tickColor: '#374151',
      labels: {
        style: {
          color: '#9ca3af'
        }
      },
      title: {
        style: {
          color: '#9ca3af'
        }
      }
    },
    tooltip: {
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      style: {
        color: '#f3f4f6'
      }
    },
    legend: {
      itemStyle: {
        color: '#f3f4f6'
      },
      itemHoverStyle: {
        color: '#ffffff'
      },
      itemHiddenStyle: {
        color: '#6b7280'
      }
    },
    plotOptions: {
      series: {
        dataLabels: {
          color: '#f3f4f6',
          style: {
            textOutline: '1px #111827'
          }
        }
      }
    }
  }
}
