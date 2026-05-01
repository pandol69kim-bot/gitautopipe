import { Command } from 'commander';
import inquirer from 'inquirer';
import { WorkflowOrchestrator } from '../workflows/orchestrator';
import { ConfigManager } from './config-manager';
import { logger } from './logger';
import type { LogLevel } from './logger';
import type { OutputFormat } from './formatter';
import {
  runScan,
  runSync,
  runAnalyze,
  runDeploy,
  runWorkflow,
  runStatus,
} from './commands';
import { runInteractive } from './interactive';

const program = new Command();
const configManager = new ConfigManager();
const orchestrator = new WorkflowOrchestrator();

program
  .name('selfish-club')
  .description('셀피시 클럽 AI 에이전트 협업 시스템 CLI')
  .version('1.0.0')
  .option('-o, --output <format>', '출력 포맷 (table|json|minimal)', 'table')
  .option('--log-level <level>', '로그 레벨 (debug|info|warn|error)', 'info')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    logger.setLevel((opts['logLevel'] as LogLevel) ?? 'info');
    const config = configManager.init();
    logger.debug(`설정 로드 완료: ${configManager.getConfigPath()}`);
    logger.debug(`logLevel: ${config.logLevel}`);
  });

program
  .command('scan')
  .description('Obsidian 볼트 폴더를 스캔합니다')
  .option('--folder <folder>', '스캔할 폴더 이름')
  .action(async (opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = await runScan(opts, { orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('sync')
  .description('외부 서비스와 동기화합니다')
  .option('--target <target>', '동기화 대상 (github|notion|all)', 'github')
  .action(async (opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = await runSync(opts, { orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('analyze')
  .description('지정 주차의 볼트 데이터를 분석합니다')
  .option('--week <week>', '분석할 주차 번호', (v) => parseInt(v, 10))
  .action(async (opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = await runAnalyze(opts, { orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('deploy')
  .description('Skill/Insight 사이트를 Vercel에 배포합니다')
  .option('--preview', '프리뷰 배포로 실행', false)
  .action(async (opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = await runDeploy(opts, { orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('workflow')
  .description('워크플로우를 실행합니다')
  .argument('<workflowId>', '실행할 워크플로우 ID')
  .action(async (workflowId: string, _opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = await runWorkflow({ workflowId }, { orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('status')
  .description('시스템 상태를 확인합니다')
  .action((_opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const result = runStatus({ orchestrator, outputFormat: output });
    console.log(result);
  });

program
  .command('interactive')
  .alias('i')
  .description('인터랙티브 모드로 실행합니다')
  .action(async (_opts, cmd) => {
    const output = (cmd.parent?.opts()['output'] as OutputFormat) ?? 'table';
    const promptFn = (questions: Parameters<typeof inquirer.prompt>[0]) =>
      inquirer.prompt(questions) as Promise<Record<string, unknown>>;

    const selected = await runInteractive(promptFn);
    if (selected.command === 'exit') {
      logger.info('종료합니다.');
      return;
    }
    const deps = { orchestrator, outputFormat: output };
    let result: string;
    switch (selected.command) {
      case 'scan':
        result = await runScan(selected.options, deps);
        break;
      case 'sync':
        result = await runSync(selected.options, deps);
        break;
      case 'analyze':
        result = await runAnalyze(selected.options, deps);
        break;
      case 'deploy':
        result = await runDeploy(selected.options, deps);
        break;
      case 'workflow':
        result = await runWorkflow(selected.options, deps);
        break;
      case 'status':
        result = runStatus(deps);
        break;
    }
    console.log(result!);
  });

export { program };

if (require.main === module) {
  program.parse(process.argv);
}
