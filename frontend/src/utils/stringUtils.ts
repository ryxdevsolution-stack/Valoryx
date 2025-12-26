/**
 * String utility functions for formatting text
 */

/**
 * Convert text to title case (first letter of each word capitalized)
 * Handles names professionally
 *
 * @param text - The text to convert
 * @returns The text in title case
 *
 * @example
 * titleCase("john doe") // "John Doe"
 * titleCase("JOHN DOE") // "John Doe"
 * titleCase("laptop") // "Laptop"
 */
export function titleCase(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  // Strip extra spaces and convert to title case
  return text
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format text as title case on input change
 * Use this in onChange handlers for input fields
 *
 * @param value - The input value
 * @returns The formatted value in title case
 */
export function formatNameInput(value: string): string {
  if (!value) return '';

  // Apply title case as user types
  return titleCase(value);
}
