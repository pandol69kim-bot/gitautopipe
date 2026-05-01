export type OutputFormat = 'table' | 'json' | 'minimal';

export function format(data: unknown, outputFormat: OutputFormat): string {
  switch (outputFormat) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'table':
      return formatTable(data);
    case 'minimal':
      return formatMinimal(data);
  }
}

function formatTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '(no data)';
    const keys = Object.keys(data[0] as object);
    const header = keys.join('\t');
    const rows = (data as Record<string, unknown>[]).map((row) =>
      keys.map((k) => String(row[k] ?? '')).join('\t')
    );
    return [header, ...rows].join('\n');
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => `${k}\t${String(v)}`)
      .join('\n');
  }
  return String(data);
}

function formatMinimal(data: unknown): string {
  if (Array.isArray(data)) {
    return `count: ${data.length}`;
  }
  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  }
  return String(data);
}
