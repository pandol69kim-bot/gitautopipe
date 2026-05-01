"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScan = runScan;
exports.runSync = runSync;
exports.runAnalyze = runAnalyze;
exports.runDeploy = runDeploy;
exports.runWorkflow = runWorkflow;
exports.runStatus = runStatus;
const formatter_1 = require("./formatter");
async function runScan(opts, deps) {
    const result = {
        action: 'scan',
        folder: opts.folder ?? 'all',
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