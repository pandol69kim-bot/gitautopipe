"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = format;
function format(data, outputFormat) {
    switch (outputFormat) {
        case 'json':
            return JSON.stringify(data, null, 2);
        case 'table':
            return formatTable(data);
        case 'minimal':
            return formatMinimal(data);
    }
}
function formatTable(data) {
    if (Array.isArray(data)) {
        if (data.length === 0)
            return '(no data)';
        const keys = Object.keys(data[0]);
        const header = keys.join('\t');
        const rows = data.map((row) => keys.map((k) => String(row[k] ?? '')).join('\t'));
        return [header, ...rows].join('\n');
    }
    if (typeof data === 'object' && data !== null) {
        return Object.entries(data)
            .map(([k, v]) => `${k}\t${String(v)}`)
            .join('\n');
    }
    return String(data);
}
function formatMinimal(data) {
    if (Array.isArray(data)) {
        return `count: ${data.length}`;
    }
    if (typeof data === 'object' && data !== null) {
        return Object.entries(data)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(', ');
    }
    return String(data);
}
//# sourceMappingURL=formatter.js.map