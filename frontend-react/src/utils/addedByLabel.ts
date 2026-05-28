const KEY = 'valoryx.addedByLabel';

export function getAddedByLabel(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setAddedByLabel(value: string): void {
  try {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(KEY, trimmed);
  } catch {
    // localStorage unavailable (private mode) — fail silently
  }
}
