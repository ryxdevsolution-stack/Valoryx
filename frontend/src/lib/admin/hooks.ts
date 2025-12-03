'use client';

// Shared hooks for admin module
import { useState, useEffect, useCallback, useRef } from 'react';
import { buildQueryParams } from './utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// ============================================
// GENERIC FETCH HOOK
// ============================================
interface UseFetchOptions<T> {
  initialData?: T;
  autoFetch?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseFetchResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFetch<T>(
  url: string,
  options: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const { initialData, autoFetch = true, onSuccess, onError } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [url, onSuccess, onError]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================
// PAGINATED FETCH HOOK
// ============================================
interface PaginatedData<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface UsePaginatedFetchOptions<T> extends UseFetchOptions<PaginatedData<T>> {
  limit?: number;
  filters?: Record<string, string | number | boolean | undefined>;
}

interface UsePaginatedFetchResult<T> extends Omit<UseFetchResult<PaginatedData<T>>, 'data'> {
  data: T[];
  total: number;
  page: number;
  pages: number;
  setPage: (page: number) => void;
  setFilters: (filters: Record<string, string | number | boolean | undefined>) => void;
}

export function usePaginatedFetch<T>(
  baseUrl: string,
  options: UsePaginatedFetchOptions<T> = {}
): UsePaginatedFetchResult<T> {
  const { limit = 10, filters: initialFilters = {}, ...fetchOptions } = options;
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);

  const queryParams = buildQueryParams({ page, limit, ...filters });
  const url = `${baseUrl}${queryParams ? `?${queryParams}` : ''}`;

  const { data, loading, error, refetch } = useFetch<PaginatedData<T>>(url, fetchOptions);

  return {
    data: data?.data || [],
    total: data?.total || 0,
    page: data?.page || page,
    pages: data?.pages || 0,
    loading,
    error,
    refetch,
    setPage,
    setFilters: (newFilters) => {
      setFilters(newFilters);
      setPage(1); // Reset to first page when filters change
    },
  };
}

// ============================================
// MUTATION HOOK (POST, PUT, DELETE)
// ============================================
type MutationMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface UseMutationOptions<TData, TResponse> {
  onSuccess?: (data: TResponse) => void;
  onError?: (error: Error) => void;
  method?: MutationMethod;
}

interface UseMutationResult<TData, TResponse> {
  mutate: (data?: TData) => Promise<TResponse | undefined>;
  loading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useMutation<TData = unknown, TResponse = unknown>(
  url: string,
  options: UseMutationOptions<TData, TResponse> = {}
): UseMutationResult<TData, TResponse> {
  const { onSuccess, onError, method = 'POST' } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(async (data?: TData): Promise<TResponse | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      onError?.(error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [url, method, onSuccess, onError]);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { mutate, loading, error, reset };
}

// ============================================
// AUTO-REFRESH HOOK
// ============================================
interface UseAutoRefreshOptions {
  interval?: number; // in milliseconds
  enabled?: boolean;
}

export function useAutoRefresh(
  callback: () => void | Promise<void>,
  options: UseAutoRefreshOptions = {}
): { start: () => void; stop: () => void; isRunning: boolean } {
  const { interval = 30000, enabled = true } = options;
  const [isRunning, setIsRunning] = useState(enabled);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    setIsRunning(true);
    intervalRef.current = setInterval(callback, interval);
  }, [callback, interval]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    }
    return () => stop();
  }, [enabled, start, stop]);

  return { start, stop, isRunning };
}

// ============================================
// DEBOUNCED VALUE HOOK
// ============================================
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================
// LOCAL STORAGE HOOK
// ============================================
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
      return valueToStore;
    });
  }, [key]);

  return [storedValue, setValue];
}

// ============================================
// TOAST/NOTIFICATION HOOK
// ============================================
interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  duration?: number;
}

interface UseToastResult {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2);
    const newToast: Toast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return { toasts, addToast, removeToast, clearToasts };
}

// ============================================
// FORM STATE HOOK
// ============================================
interface UseFormOptions<T> {
  initialValues: T;
  onSubmit: (values: T) => Promise<void> | void;
  validate?: (values: T) => Partial<Record<keyof T, string>>;
}

interface UseFormResult<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isDirty: boolean;
  handleChange: (field: keyof T, value: T[keyof T]) => void;
  handleBlur: (field: keyof T) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: () => void;
  setValues: (values: Partial<T>) => void;
}

export function useForm<T extends Record<string, unknown>>(
  options: UseFormOptions<T>
): UseFormResult<T> {
  const { initialValues, onSubmit, validate } = options;
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = useCallback((field: keyof T, value: T[keyof T]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear error when field changes
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const handleBlur = useCallback((field: keyof T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Validate all fields
    if (validate) {
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        // Mark all fields as touched
        const allTouched = Object.keys(values).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {} as Partial<Record<keyof T, boolean>>
        );
        setTouched(allTouched);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
      setIsDirty(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit]);

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsDirty(false);
  }, [initialValues]);

  const updateValues = useCallback((newValues: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...newValues }));
    setIsDirty(true);
  }, []);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setValues: updateValues,
  };
}

// ============================================
// CONFIRMATION DIALOG HOOK
// ============================================
interface UseConfirmResult {
  isOpen: boolean;
  confirm: (options: {
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'warning' | 'info';
  }) => void;
  close: () => void;
  dialogProps: {
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  };
}

export function useConfirm(): UseConfirmResult {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogProps, setDialogProps] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    title: '',
    message: '',
    variant: 'danger',
    onConfirm: () => {},
  });

  const confirm = useCallback((options: {
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
    variant?: 'danger' | 'warning' | 'info';
  }) => {
    setDialogProps({
      title: options.title,
      message: options.message,
      variant: options.variant || 'danger',
      onConfirm: async () => {
        await options.onConfirm();
        setIsOpen(false);
      },
    });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return { isOpen, confirm, close, dialogProps };
}
