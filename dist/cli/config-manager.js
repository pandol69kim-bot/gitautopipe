"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = exports.CONFIG_FILENAME = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const ConfigSchema = zod_1.z.object({
    vault: zod_1.z.object({
        rootPath: zod_1.z.string(),
        folders: zod_1.z.array(zod_1.z.string()),
    }),
    github: zod_1.z.object({
        owner: zod_1.z.string(),
        repo: zod_1.z.string(),
        branch: zod_1.z.string().default('main'),
    }),
    notion: zod_1.z
        .object({
        apiKey: zod_1.z.string().optional(),
        databaseId: zod_1.z.string().optional(),
    })
        .optional(),
    linkedin: zod_1.z
        .object({
        tone: zod_1.z.enum(['professional', 'casual', 'thought-leader']).default('professional'),
    })
        .optional(),
    logLevel: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
exports.CONFIG_FILENAME = 'selfish-club.config.json';
const DEFAULT_CONFIG = {
    vault: {
        rootPath: './vault',
        folders: ['Mission', 'Skills', 'Insights', 'Meetings'],
    },
    github: { owner: '', repo: '', branch: 'main' },
    logLevel: 'info',
};
class ConfigManager {
    configPath;
    constructor(configDir = process.cwd()) {
        this.configPath = path_1.default.join(configDir, exports.CONFIG_FILENAME);
    }
    load() {
        if (!fs_1.default.existsSync(this.configPath)) {
            return structuredClone(DEFAULT_CONFIG);
        }
        const raw = JSON.parse(fs_1.default.readFileSync(this.configPath, 'utf-8'));
        return ConfigSchema.parse(raw);
    }
    save(config) {
        const validated = ConfigSchema.parse(config);
        fs_1.default.writeFileSync(this.configPath, JSON.stringify(validated, null, 2), 'utf-8');
    }
    exists() {
        return fs_1.default.existsSync(this.configPath);
    }
    init() {
        if (!this.exists()) {
            this.save(DEFAULT_CONFIG);
        }
        return this.load();
    }
    getConfigPath() {
        return this.configPath;
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config-manager.js.map