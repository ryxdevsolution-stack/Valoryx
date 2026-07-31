/**
 * Valoryx - Hooks Export
 * Central export for all custom hooks
 */

// API hooks
export {
  useApi,
  useApiMutation,
  useAuthenticatedFetch,
  usePaginatedApi,
  type ApiResponse,
  type UseApiState,
  type UseApiOptions,
  type PaginationState,
} from './useApi';

// Device detection hooks
export { useMobileDetect } from './useMobileDetect';

// Desktop (Electron) Google sign-in handoff
export { useDesktopGoogleHandoff } from './useDesktopGoogleHandoff';
