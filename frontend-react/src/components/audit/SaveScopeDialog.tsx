import { useEffect, useRef } from 'react';
import type { AuditEditScope } from '@/services/billingService';

interface Props {
  open: boolean;
  onClose: () => void;
  onChoice: (choice: AuditEditScope) => void;
  itemCount: number;       // number of edited lines, for the body copy
}

export default function SaveScopeDialog({ open, onClose, onChoice, itemCount }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-scope-title"
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h2 id="save-scope-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          How should this be saved?
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          You edited {itemCount} line item{itemCount === 1 ? '' : 's'}. Pick how to apply the change:
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onChoice('audit_only')}
            className="rounded-md bg-blue-600 px-4 py-3 text-left text-white hover:bg-blue-700"
          >
            <div className="font-semibold">Save as audit note</div>
            <div className="text-xs opacity-90">
              Bill, prints &amp; reports stay unchanged. Only the audit view shows the correction.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChoice('apply')}
            className="rounded-md bg-emerald-600 px-4 py-3 text-left text-white hover:bg-emerald-700"
          >
            <div className="font-semibold">Apply to bill</div>
            <div className="text-xs opacity-90">
              Bill, prints &amp; reports all reflect the new rate. Clears any prior audit note.
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
