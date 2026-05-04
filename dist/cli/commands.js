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
exports.runScan = runScan;
exports.runSync = runSync;
exports.runAnalyze = runAnalyze;
exports.runDeploy = runDeploy;
exports.runWorkflow = runWorkflow;
exports.runStatus = runStatus;
const path = __importStar(require("path"));
const formatter_1 = require("./formatter");
const vault_scanner_1 = require("../core/vault-scanner");
function createVaultScannerFromEnv() {
    const basePath = path.resolve(process.env['VAULT_PATH'] ?? './vault');
    return new vault_scanner_1.VaultScanner({
        basePath,
        folders: {
            mission: process.env['VAULT_FOLDER_MISSION'] ?? 'mission',
            meetings: process.env['VAULT_FOLDER_MEETINGS'] ?? 'meetings',
            skillInsight: process.env['VAULT_FOLDER_SKILL_INSIGHT'] ?? 'skillInsight',
            sharing: process.env['VAULT_FOLDER_SHARING'] ?? 'sharing',
            analysis: process.env['VAULT_FOLDER_ANALYSIS'] ?? 'analysis',
            linkedin: process.env['VAULT_FOLDER_LINKEDIN'] ?? 'linkedin',
        },
    });
}
async function runScan(opts, deps) {
    const scanner = createVaultScannerFromEnv();
    const folderTypes = ['mission', 'meetings', 'skillInsight', 'sharing', 'analysis', 'linkedin'];
    const targets = opts.folder ? [opts.folder] : folderTypes;
    const counts = {};
    for (const folderType of targets) {
        const files = await scanner.scanFolder(folderType);
        counts[folderType] = files.length;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const result = {
        action: 'scan',
        folder: opts.folder ?? 'all',
        files: counts,
        total,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runSync(opts, deps) {
    const target = opts.target ?? 'github';
    await deps.orchestrator.emit(`${target}:sync`, { target });
    const result = {
        action: 'sync',
        target,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runAnalyze(opts, deps) {
    await deps.orchestrator.executeWorkflow('onMissionUpdate', { week: opts.week });
    const result = {
        action: 'analyze',
        week: opts.week ?? 'current',
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runDeploy(opts, deps) {
    await deps.orchestrator.emit('skill:updated', { preview: opts.preview ?? false });
    const result = {
        action: 'deploy',
        preview: opts.preview ?? false,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runWorkflow(opts, deps) {
    const execution = await deps.orchestrator.executeWorkflow(opts.workflowId, opts.payload);
    return (0, formatter_1.format)(execution, deps.outputFormat);
}
function runStatus(deps) {
    const schedules = deps.orchestrator.getSchedules();
    const predefined = ['onMissionUpdate', 'onMeetingSync', 'onSkillUpdate', 'weeklyDigest'];
    const workflows = predefined.map((id) => ({
        id,
        registered: !!deps.orchestrator.getWorkflow(id),
        historyCount: deps.orchestrator.getExecutionHistory(id).length,
    }));
    const result = {
        workflows,
        schedules: schedules.length,
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
//# sourceMappingURL=commands.js.map