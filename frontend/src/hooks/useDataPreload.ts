import { useEffect } from 'react'

// Simple hook that can preload data when needed
export function useDataPreload(shouldPreload: boolean) {
  useEffect(() => {
    if (shouldPreload) {
      // Preload logic can be added here if needed
      // For now, this is just a placeholder
    }
  }, [shouldPreload])
}
