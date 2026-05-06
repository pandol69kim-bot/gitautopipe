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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncNotionBidirectional = syncNotionBidirectional;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const vault_scanner_1 = require("../core/vault-scanner");
async function syncNotionBidirectional(params) {
    const scanner = new vault_scanner_1.VaultScanner({
        basePath: params.paths.vaultBasePath,
        folders: {
            mission: process.env['VAULT_FOLDER_MISSION'] ?? 'mission',
            meetings: params.paths.meetingsFolder ?? 'meetings',
            skillInsight: process.env['VAULT_FOLDER_SKILL_INSIGHT'] ?? 'skillInsight',
            sharing: process.env['VAULT_FOLDER_SHARING'] ?? 'sharing',
            analysis: process.env['VAULT_FOLDER_ANALYSIS'] ?? 'analysis',
            linkedin: process.env['VAULT_FOLDER_LINKEDIN'] ?? 'linkedin',
        },
    });
    const meetingsPath = params.paths.meetingsPath ?? scanner.getFullPath('meetings');
    fs.mkdirSync(meetingsPath, { recursive: true });
    const [remotePages, localFiles] = await Promise.all([
        params.connector.fetchMeetings(params.databaseId),
        scanner.scanFolder('meetings'),
    ]);
    const localMeetings = localFiles.map((file) => ({
        file,
        notionId: readNotionId(file.filePath),
    }));
    const localByNotionId = new Map(localMeetings
        .filter((meeting) => typeof meeting.notionId === 'string' && meeting.notionId.length > 0)
        .map((meeting) => [meeting.notionId, meeting]));
    const remoteById = new Map(remotePages.map((page) => [page.id, page]));
    const summary = {
        remoteFetched: remotePages.length,
        downloadedCreated: 0,
        downloadedUpdated: 0,
        uploadedCreated: 0,
        uploadedUpdated: 0,
        skipped: 0,
    };
    for (const remotePage of remotePages) {
        const localMeeting = localByNotionId.get(remotePage.id);
        if (!localMeeting) {
            const targetPath = buildRemoteTargetPath(meetingsPath, remotePage, localFiles);
            await params.connector.syncToObsidian(remotePage, targetPath);
            summary.downloadedCreated += 1;
            continue;
        }
        if (remotePage.lastEditedAt > localMeeting.file.modifiedAt) {
            await params.connector.syncToObsidian(remotePage, localMeeting.file.filePath);
            summary.downloadedUpdated += 1;
            continue;
        }
        if (localMeeting.file.modifiedAt > remotePage.lastEditedAt) {
            const result = await params.connector.syncFromObsidian(localMeeting.file, params.databaseId);
            if (result.action === 'created') {
                summary.uploadedCreated += 1;
            }
            else {
                summary.uploadedUpdated += 1;
            }
            continue;
        }
        summary.skipped += 1;
    }
    for (const localMeeting of localMeetings) {
        if (localMeeting.notionId && remoteById.has(localMeeting.notionId)) {
            continue;
        }
        const result = await params.connector.syncFromObsidian(localMeeting.file, params.databaseId);
        if (result.action === 'created') {
            summary.uploadedCreated += 1;
        }
        else {
            summary.uploadedUpdated += 1;
        }
    }
    return summary;
}
function readNotionId(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = (0, gray_matter_1.default)(raw);
    const notionId = parsed.data['notionId'];
    return typeof notionId === 'string' && notionId.trim().length > 0 ? notionId.trim() : undefined;
}
function buildRemoteTargetPath(meetingsPath, remotePage, existingFiles) {
    const safeName = sanitizeFileName(remotePage.title || remotePage.id);
    const basePath = path.join(meetingsPath, `${safeName}.md`);
    const normalizedBasePath = path.normalize(basePath);
    const collision = existingFiles.some((file) => path.normalize(file.filePath) === normalizedBasePath);
    if (!collision) {
        return basePath;
    }
    return path.join(meetingsPath, `${safeName}-${remotePage.id}.md`);
}
function sanitizeFileName(value) {
    return value.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}
//# sourceMappingURL=notion-sync.js.map