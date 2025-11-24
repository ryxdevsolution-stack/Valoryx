'use client'

import { ReactNode } from 'react'
import { LoadingOverlay } from './LoadingOverlay'

export function LoadingInitializer({ children }: { children: ReactNode }) {
  return (
    <>
      <LoadingOverlay />
      {children}
    </>
  )
}