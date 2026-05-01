"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanTextForSecrets = scanTextForSecrets;
const SECRET_PATTERNS = [
    { type: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9_]{30,255}|github_pat_[A-Za-z0-9_]{20,255}/g },
    { type: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,255}/g },
    { type: 'notion-token', pattern: /secret_[A-Za-z0-9]{20,255}/g },
];
function scanTextForSecrets(text) {
    const findings = [];
    for (const entry of SECRET_PATTERNS) {
        for (const match of text.matchAll(entry.pattern)) {
            findings.push({
                type: entry.type,
                match: match[0],
                index: match.index ?? 0,
            });
        }
    }
    return findings.sort((left, right) => left.index - right.index);
}
//# sourceMappingURL=secret-scanner.js.map