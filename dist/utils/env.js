"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
exports.getEnv = getEnv;
const dotenv = __importStar(require("dotenv"));
const zod_1 = require("zod");
const EnvSchema = zod_1.z.object({
    GITHUB_TOKEN: zod_1.z.string().min(1, 'GITHUB_TOKEN is required'),
    CLAUDE_API_KEY: zod_1.z.string().min(1, 'CLAUDE_API_KEY is required'),
    NOTION_TOKEN: zod_1.z.string().min(1, 'NOTION_TOKEN is required'),
    VERCEL_TOKEN: zod_1.z.string().optional(),
});
let cachedEnv = null;
function loadEnv() {
    if (cachedEnv)
        return cachedEnv;
    dotenv.config();
    const result = EnvSchema.safeParse(process.env);
    if (!result.success) {
        const missing = result.error.issues
            .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
            .join('\n');
        throw new Error(`환경 변수 검증 실패:\n${missing}\n\n.env 파일을 확인하세요.`);
    }
    cachedEnv = result.data;
    return cachedEnv;
}
function getEnv() {
    if (!cachedEnv) {
        return loadEnv();
    }
    return cachedEnv;
}
//# sourceMappingURL=env.js.map