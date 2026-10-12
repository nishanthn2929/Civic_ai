/**
 * Utility for formatting UTC datetime strings into Bengaluru / Indian Standard Time (IST).
 * Accurately parses UTC ISO strings whether or not the 'Z' suffix is present.
 */
export function formatDateTime(dateInput, options = {}) {
  if (!dateInput) return '';
  let str = String(dateInput).trim();
  
  // Replace space separator from SQLite datetime string (e.g. '2026-09-24 15:14:01' -> '2026-09-24T15:14:01')
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }
  
  // If the ISO string has no timezone offset (+HH:MM or -HH:MM) and no trailing Z,
  // it originated as UTC from SQLite/FastAPI; append 'Z' so JavaScript converts to local IST.
  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  
  const date = new Date(str);
  if (isNaN(date.getTime())) return String(dateInput);

  const defaultOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata' // Indian Standard Time (UTC+05:30)
  };

  return date.toLocaleString('en-IN', { ...defaultOptions, ...options });
}

export function formatTimeAgo(dateInput) {
  if (!dateInput) return '';
  let str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(str)) {
    str = str.replace(' ', 'T');
  }
  if (!str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) return '';
  
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
