"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.program = void 0;
const commander_1 = require("commander");
const dotenv_1 = require("dotenv");
const inquirer_1 = __importDefault(require("inquirer"));
const orchestrator_1 = require("../workflows/orchestrator");
const config_manager_1 = require("./config-manager");
const logger_1 = require("./logger");
const commands_1 = require("./commands");
const interactive_1 = require("./interactive");
const security_1 = require("./security");
(0, dotenv_1.config)();
const program = new commander_1.Command();
exports.program = program;
const configManager = new config_manager_1.ConfigManager();
const orchestrator = new orchestrator_1.WorkflowOrchestrator();
const securityDeps = (0, security_1.createCliSecurityDeps)();
program
    .name('selfish-club')
    .description('셀피시 클럽 AI 에이전트 작업 시스템 CLI')
    .version('1.0.0')
    .option('-o, --output <format>', '출력 형식 (table|json|minimal)', 'table')
    .option('--log-level <level>', '로그 레벨 (debug|info|warn|error)', 'info')
    .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    logger_1.logger.setLevel(opts['logLevel'] ?? 'info');
    const config = configManager.init();
    for (const schedule of configManager.listWorkflowSchedules()) {
        try {
            orchestrator.scheduleWorkflow(schedule.workflowId, schedule.cron);
        }
        catch (error) {
            logger_1.logger.warn(error instanceof Error
                ? `스케줄 로드 실패 (${schedule.workflowId}): ${error.message}`
                : `스케줄 로드 실패 (${schedule.workflowId})`);
        }
    }
    logger_1.logger.debug(`설정 로드 완료: ${configManager.getConfigPath()}`);
    logger_1.logger.debug(`logLevel: ${config.logLevel}`);
});
program
    .command('scan')
    .description('Obsidian 볼트 폴더를 스캔합니다')
    .option('--folder <folder>', '스캔할 폴더 이름')
    .action(async (opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('scan', opts, async () => (0, commands_1.runScan)(opts, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('sync')
    .description('외부 서비스와 동기화합니다')
    .option('--target <target>', '동기화 대상 (github|notion|all)', 'github')
    .action(async (opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('sync', opts, async () => (0, commands_1.runSync)(opts, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('analyze')
    .description('지정 주차의 볼트 데이터를 분석합니다')
    .option('--week <week>', '분석할 주차 번호', (v) => parseInt(v, 10))
    .action(async (opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('analyze', opts, async () => (0, commands_1.runAnalyze)(opts, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('deploy')
    .description('Skill/Insight 사이트를 Vercel에 배포합니다')
    .option('--preview', '프리뷰 배포로 실행', false)
    .action(async (opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('deploy', opts, async () => (0, commands_1.runDeploy)(opts, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('workflow')
    .description('워크플로우를 실행합니다')
    .argument('<workflowId>', '실행할 워크플로우 ID')
    .action(async (workflowId, _opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const options = { workflowId };
    const result = await executeCliCommand('workflow', options, async () => (0, commands_1.runWorkflow)(options, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
const scheduleCommand = program.command('schedule').description('워크플로우 스케줄을 관리합니다');
scheduleCommand
    .command('list')
    .description('등록된 스케줄을 조회합니다')
    .action(async (_opts, cmd) => {
    const output = cmd.parent?.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('schedule', { operation: 'list' }, async () => Promise.resolve((0, commands_1.runScheduleList)({ orchestrator, outputFormat: output, configManager })));
    console.log(result);
});
scheduleCommand
    .command('add')
    .description('워크플로우 스케줄을 등록하거나 갱신합니다')
    .argument('<workflowId>', '스케줄에 등록할 워크플로우 ID')
    .requiredOption('--cron <expression>', '5필드 cron 표현식')
    .action(async (workflowId, opts, cmd) => {
    const output = cmd.parent?.parent?.opts()['output'] ?? 'table';
    const options = { workflowId, cron: opts.cron, operation: 'add' };
    const result = await executeCliCommand('schedule', options, async () => Promise.resolve((0, commands_1.runScheduleAdd)(options, { orchestrator, outputFormat: output, configManager })));
    console.log(result);
});
scheduleCommand
    .command('remove')
    .description('등록된 워크플로우 스케줄을 해제합니다')
    .argument('<workflowId>', '스케줄에서 제거할 워크플로우 ID')
    .action(async (workflowId, _opts, cmd) => {
    const output = cmd.parent?.parent?.opts()['output'] ?? 'table';
    const options = { workflowId, operation: 'remove' };
    const result = await executeCliCommand('schedule', options, async () => Promise.resolve((0, commands_1.runScheduleRemove)(options, { orchestrator, outputFormat: output, configManager })));
    console.log(result);
});
scheduleCommand
    .command('run-due')
    .description('현재 시각 또는 지정 시각 기준으로 실행 대상 스케줄을 즉시 실행합니다')
    .option('--at <isoDate>', '기준 시각 (ISO 8601)')
    .action(async (opts, cmd) => {
    const output = cmd.parent?.parent?.opts()['output'] ?? 'table';
    const options = { at: opts.at, operation: 'run-due' };
    const result = await executeCliCommand('schedule', options, async () => (0, commands_1.runScheduleRunDue)(options, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
scheduleCommand
    .command('start')
    .description('등록된 스케줄을 주기적으로 확인하며 due 워크플로우를 자동 실행합니다')
    .option('--interval-seconds <seconds>', '폴링 간격(초)', (value) => parseInt(value, 10), 60)
    .action(async (opts, cmd) => {
    const output = cmd.parent?.parent?.opts()['output'] ?? 'table';
    const options = {
        intervalSeconds: opts.intervalSeconds,
        operation: 'start',
    };
    const result = await executeCliCommand('schedule', options, async () => (0, commands_1.runScheduleStart)(options, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('status')
    .description('시스템 상태를 확인합니다')
    .action(async (_opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('status', {}, async () => Promise.resolve((0, commands_1.runStatus)({ orchestrator, outputFormat: output, configManager })));
    console.log(result);
});
program
    .command('notion-check')
    .description('Validate a Notion database or data source ID')
    .option('--id <id>', 'Database or data source ID or URL')
    .action(async (opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const result = await executeCliCommand('notion-check', opts, async () => (0, commands_1.runNotionCheck)(opts, { orchestrator, outputFormat: output, configManager }));
    console.log(result);
});
program
    .command('interactive')
    .alias('i')
    .description('인터랙티브 모드로 실행합니다')
    .action(async (_opts, cmd) => {
    const output = cmd.parent?.opts()['output'] ?? 'table';
    const promptFn = (questions) => inquirer_1.default.prompt(questions);
    const selected = await (0, interactive_1.runInteractive)(promptFn);
    if (selected.command === 'exit') {
        logger_1.logger.info('종료합니다.');
        return;
    }
    const deps = { orchestrator, outputFormat: output, configManager };
    let result;
    switch (selected.command) {
        case 'scan':
            result = await executeCliCommand('scan', selected.options, async () => (0, commands_1.runScan)(selected.options, deps));
            break;
        case 'sync':
            result = await executeCliCommand('sync', selected.options, async () => (0, commands_1.runSync)(selected.options, deps));
            break;
        case 'analyze':
            result = await executeCliCommand('analyze', selected.options, async () => (0, commands_1.runAnalyze)(selected.options, deps));
            break;
        case 'deploy':
            result = await executeCliCommand('deploy', selected.options, async () => (0, commands_1.runDeploy)(selected.options, deps));
            break;
        case 'workflow':
            result = await executeCliCommand('workflow', selected.options, async () => (0, commands_1.runWorkflow)(selected.options, deps));
            break;
        case 'schedule':
            result = await executeCliCommand('schedule', selected.options, async () => {
                switch (selected.options.operation) {
                    case 'list':
                        return (0, commands_1.runScheduleList)(deps);
                    case 'add':
                        return (0, commands_1.runScheduleAdd)(selected.options, deps);
                    case 'remove':
                        return (0, commands_1.runScheduleRemove)(selected.options, deps);
                    case 'run-due':
                        return (0, commands_1.runScheduleRunDue)(selected.options, deps);
                    case 'start':
                        return (0, commands_1.runScheduleStart)(selected.options, deps);
                    default:
                        return (0, commands_1.runScheduleList)(deps);
                }
            });
            break;
        case 'status':
            result = await executeCliCommand('status', selected.options, async () => Promise.resolve((0, commands_1.runStatus)(deps)));
            break;
    }
    console.log(result);
});
if (require.main === module) {
    program.parse(process.argv);
}
async function executeCliCommand(command, options, handler) {
    return (0, security_1.executeSecuredCommand)({
        command,
        resource: buildCommandResource(command, options),
        requiredSecrets: (0, security_1.getRequiredSecretsForCommand)(command, options),
    }, securityDeps, handler);
}
function buildCommandResource(command, options) {
    switch (command) {
        case 'scan':
            return `vault/${String(options['folder'] ?? 'all')}`;
        case 'sync':
            return `sync/${String(options['target'] ?? 'github')}`;
        case 'analyze':
            return `analysis/week-${String(options['week'] ?? 'current')}`;
        case 'deploy':
            return `deploy/${options['preview'] ? 'preview' : 'production'}`;
        case 'workflow':
            return `workflow/${String(options['workflowId'] ?? 'unknown')}`;
        case 'schedule':
            return `schedule/${String(options['operation'] ?? 'unknown')}/${String(options['workflowId'] ?? 'all')}`;
        case 'status':
            return 'system/status';
        case 'notion-check':
            return `notion/check/${String(options['id'] ?? process.env['NOTION_DATABASE_ID'] ?? 'env')}`;
        case 'interactive':
            return 'cli/interactive';
    }
}
//# sourceMappingURL=index.js.map