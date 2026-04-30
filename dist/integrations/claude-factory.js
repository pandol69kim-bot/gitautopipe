"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createClaudeAnalyzer = createClaudeAnalyzer;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const claude_1 = require("./claude");
function createClaudeAnalyzer(config) {
    const client = new sdk_1.default({ apiKey: config.apiKey });
    return new claude_1.ClaudeAnalyzer(config, client);
}
//# sourceMappingURL=claude-factory.js.map