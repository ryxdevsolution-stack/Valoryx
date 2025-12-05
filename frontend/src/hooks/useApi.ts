'use client';

/**
 * RYX Billing - Unified API Hook
 * Provides authenticated API access with standardized loading/error states
 *
 * Uses the centralized axios instance which handles:
 * - Token management (automatic header injection)
 * - 401 handling (automatic logout)
 * - Loading indicators (opt-in)
 * - Request timeout
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { AxiosRequestConfig, AxiosError } from 'axios';
import { STORAGE_KEYS } from '@/config';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    pagination?: {
      page: number;
      per_page: number;
      total: number;
      total_pages: number;
      has_next: boolean;
      has_prev: boolean;
    };
  };
}

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseApiOptions {
  /** Show global loading indicator */
  showLoading?: boolean;
  /** Loading message to display */
  loadingMessage?: string;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Dependencies that trigger refetch */
  deps?: unknown[];
  /** Callback on success */
  onSuccess?: (data: unknown) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

// ============================================================================
// MAIN HOOK: useApi
// ============================================================================

/**
 * Hook for making authenticated API requests
 *
 * @example
 * // GET request
 * const { data, loading, error, execute } = useApi<Product[]>('/api/stock');
 *
 * @example
 * // POST request with data
 * const { execute, loading, error } = useApi<Bill>('/api/billing/create', {
 *   autoFetch: false
 * });
 * const handleSubmit = async (data) => {
 *   const result = await execute({ method: 'POST', data });
 * };
 */
export function useApi<T = unknown>(
  url: string,
  options: UseApiOptions = {}
): UseApiState<T> & {
  execute: (config?: Partial<AxiosRequestConfig>) => Promise<T | null>;
  reset: () => void;
} {
  const {
    showLoading = false,
    loadingMessage,
    autoFetch = true,
    deps = [],
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: autoFetch,
    error: null,
  });

  const mountedRef = useRef(true);

  const execute = useCallback(
    async (config?: Partial<AxiosRequestConfig>): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await api<ApiResponse<T>>({
          url,
          method: 'GET',
          showLoading,
          loadingMessage,
          ...config,
        });

        const result = response.data;

        if (!mountedRef.current) return null;

        if (result.success) {
          const data = result.data as T;
          setState({ data, loading: false, error: null });
          onSuccess?.(data);
          return data;
        } else {
          const errorMsg = result.message || result.error || 'Request failed';
          setState({ data: null, loading: false, error: errorMsg });
          onError?.(errorMsg);
          return null;
        }
      } catch (err) {
        if (!mountedRef.current) return null;

        const error = err as AxiosError<{ message?: string; error?: string }>;
        const errorMsg =
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'An error occurred';

        setState({ data: null, loading: false, error: errorMsg });
        onError?.(errorMsg);
        return null;
      }
    },
    [url, showLoading, loadingMessage, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  // Auto-fetch on mount and when deps change
  useEffect(() => {
    mountedRef.current = true;

    if (autoFetch) {
      execute();
    }

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, ...deps]);

  return { ...state, execute, reset };
}

// ============================================================================
// HOOK: useApiMutation
// ============================================================================

/**
 * Hook for API mutations (POST, PUT, DELETE)
 * Does not auto-fetch, meant for form submissions and actions
 *
 * @example
 * const { mutate, loading, error } = useApiMutation<Bill>('/api/billing/create');
 *
 * const handleSubmit = async (formData) => {
 *   const result = await mutate(formData);
 *   if (result) {
 *     toast.success('Bill created!');
 *   }
 * };
 */
export function useApiMutation<TData = unknown, TResult = unknown>(
  url: string,
  options: Omit<UseApiOptions, 'autoFetch' | 'deps'> & {
    method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  } = {}
): {
  mutate: (data?: TData) => Promise<TResult | null>;
  loading: boolean;
  error: string | null;
  reset: () => void;
} {
  const { method = 'POST', showLoading = false, loadingMessage, onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (data?: TData): Promise<TResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await api<ApiResponse<TResult>>({
          url,
          method,
          data,
          showLoading,
          loadingMessage,
        });

        const result = response.data;

        if (result.success) {
          onSuccess?.(result.data);
          return result.data as TResult;
        } else {
          const errorMsg = result.message || result.error || 'Request failed';
          setError(errorMsg);
          onError?.(errorMsg);
          return null;
        }
      } catch (err) {
        const axiosError = err as AxiosError<{ message?: string; error?: string }>;
        const errorMsg =
          axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          axiosError.message ||
          'An error occurred';

        setError(errorMsg);
        onError?.(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [url, method, showLoading, loadingMessage, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { mutate, loading, error, reset };
}

// ============================================================================
// HOOK: useAuthenticatedFetch
// ============================================================================

/**
 * Simple wrapper around native fetch with authentication
 * For cases where you need more control than axios provides
 *
 * @example
 * const { fetchWithAuth } = useAuthenticatedFetch();
 * const response = await fetchWithAuth('/api/custom-endpoint', { method: 'POST' });
 */
export function useAuthenticatedFetch() {
  const fetchWithAuth = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const token = localStorage.getItem(STORAGE_KEYS.token);

      const headers = new Headers(options.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    []
  );

  return { fetchWithAuth };
}

// ============================================================================
// HOOK: usePaginatedApi
// ============================================================================

export interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * Hook for paginated API endpoints
 *
 * @example
 * const { data, pagination, setPage, loading } = usePaginatedApi<Customer>('/api/customer/list');
 */
export function usePaginatedApi<T = unknown>(
  baseUrl: string,
  options: UseApiOptions & {
    initialPage?: number;
    initialPerPage?: number;
  } = {}
): UseApiState<T[]> & {
  pagination: PaginationState;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  execute: () => Promise<T[] | null>;
  reset: () => void;
} {
  const { initialPage = 1, initialPerPage = 50, ...apiOptions } = options;

  const [pagination, setPagination] = useState<PaginationState>({
    page: initialPage,
    perPage: initialPerPage,
    total: 0,
    totalPages: 0,
  });

  const url = `${baseUrl}?page=${pagination.page}&per_page=${pagination.perPage}`;

  const { data, loading, error, execute: baseExecute, reset: baseReset } = useApi<T[]>(url, {
    ...apiOptions,
    deps: [pagination.page, pagination.perPage, ...(apiOptions.deps || [])],
  });

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPerPage = useCallback((perPage: number) => {
    setPagination((prev) => ({ ...prev, perPage, page: 1 }));
  }, []);

  const reset = useCallback(() => {
    baseReset();
    setPagination((prev) => ({ ...prev, page: initialPage, total: 0, totalPages: 0 }));
  }, [baseReset, initialPage]);

  return {
    data,
    loading,
    error,
    pagination,
    setPage,
    setPerPage,
    execute: baseExecute as () => Promise<T[] | null>,
    reset,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useApi;
