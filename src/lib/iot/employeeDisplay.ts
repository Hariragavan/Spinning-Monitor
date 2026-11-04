// Display helpers for employees. employeeId stays the key for filtering and
// API params; employeeName is display-only.

type Value = string | number | null | undefined;

function clean(value: Value): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

export function hasDistinctEmployeeName(employeeId: Value, employeeName: Value): boolean {
  const name = clean(employeeName);
  return !!name && name !== clean(employeeId);
}

/** Main text: the name when one is set, otherwise the ID. */
export function employeeDisplayName(employeeId: Value, employeeName: Value, fallback = 'EMP'): string {
  return hasDistinctEmployeeName(employeeId, employeeName) ? clean(employeeName) : (clean(employeeId) || fallback);
}

/** Single-line text for dropdowns, tooltips, chart labels and exports: "Name (ID)" or just "ID". */
export function employeeLabel(employeeId: Value, employeeName: Value, fallbackPrefix?: string): string {
  const id = clean(employeeId);
  const name = clean(employeeName);
  if (!hasDistinctEmployeeName(employeeId, employeeName)) {
    return id ? (fallbackPrefix ? `${fallbackPrefix} ${id}` : id) : (name || 'Unknown');
  }
  return id ? `${name} (${id})` : name;
}

export function employeeInitials(employeeId: Value, employeeName: Value, fallback = 'EMP'): string {
  const value = employeeDisplayName(employeeId, employeeName, fallback);
  if (!value) return fallback;
  const parts = value.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return value.slice(0, 2).toUpperCase();
}

