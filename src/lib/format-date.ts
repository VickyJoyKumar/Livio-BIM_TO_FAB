/**
 * Simple date formatting helper.
 * Avoids dependencies for a single utility.
 */
export function format(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

export function formatDate(input: string | null | undefined): string {
  return format(input);
}
