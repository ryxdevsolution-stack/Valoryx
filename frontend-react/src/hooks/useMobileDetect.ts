import { useState, useEffect } from 'react';

interface MobileDetectResult {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  isElectron: boolean;
  supportsWebBluetooth: boolean;
  supportsCamera: boolean;
  screenWidth: number;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
const DEBOUNCE_MS = 150;

function getScreenWidth(): number {
  if (typeof window === 'undefined') return 0;
  return window.innerWidth;
}

function detectCapabilities(): Omit<MobileDetectResult, 'isMobile' | 'isTablet' | 'isDesktop' | 'screenWidth'> {
  if (typeof window === 'undefined') {
    return {
      isTouchDevice: false,
      isElectron: false,
      supportsWebBluetooth: false,
      supportsCamera: false,
    };
  }

  return {
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    isElectron: !!(window as unknown as Record<string, unknown>).electronAPI,
    supportsWebBluetooth: 'bluetooth' in navigator,
    supportsCamera: !!(navigator.mediaDevices?.getUserMedia),
  };
}

function buildState(width: number, capabilities: ReturnType<typeof detectCapabilities>): MobileDetectResult {
  return {
    isMobile: width < MOBILE_BREAKPOINT,
    isTablet: width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT,
    isDesktop: width >= TABLET_BREAKPOINT,
    screenWidth: width,
    ...capabilities,
  };
}

export function useMobileDetect(): MobileDetectResult {
  const [state, setState] = useState<MobileDetectResult>(() => {
    const width = getScreenWidth();
    return buildState(width, detectCapabilities());
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        setState((prev) => {
          if (prev.screenWidth === width) return prev;
          return buildState(width, detectCapabilities());
        });
      }, DEBOUNCE_MS);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return state;
}
