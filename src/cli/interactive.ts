export interface PromptQuestion {
  type: string;
  name: string;
  message: string;
  choices?: string[];
}

export type PromptFn = (questions: PromptQuestion[]) => Promise<Record<string, unknown>>;

export type InteractiveResult =
  | { command: 'scan'; options: { folder?: string } }
  | { command: 'sync'; options: { target?: string } }
  | { command: 'analyze'; options: { week?: number } }
  | { command: 'deploy'; options: { preview?: boolean } }
  | { command: 'workflow'; options: { workflowId: string } }
  | {
      command: 'schedule';
      options:
        | { operation: 'list' }
        | { operation: 'add'; workflowId: string; cron: string }
        | { operation: 'remove'; workflowId: string }
        | { operation: 'run-due'; at?: string }
        | { operation: 'start'; intervalSeconds?: number };
    }
  | { command: 'status'; options: Record<string, never> }
  | { command: 'exit'; options: Record<string, never> };

export async function runInteractive(prompt: PromptFn): Promise<InteractiveResult> {
  const { command } = (await prompt([
    {
      type: 'list',
      name: 'command',
      message: '실행할 명령어를 선택하세요:',
      choices: ['scan', 'sync', 'analyze', 'deploy', 'workflow', 'schedule', 'status', 'exit'],
    },
  ])) as { command: string };

  switch (command) {
    case 'scan': {
      const { folder } = (await prompt([
        { type: 'input', name: 'folder', message: '스캔할 폴더 (기본값: all):' },
      ])) as { folder: string };
      return { command: 'scan', options: { folder: folder || undefined } };
    }

    case 'sync': {
      const { target } = (await prompt([
        {
          type: 'list',
          name: 'target',
          message: '동기화 대상:',
          choices: ['github', 'notion', 'all'],
        },
      ])) as { target: string };
      return { command: 'sync', options: { target } };
    }

    case 'analyze': {
      const { week } = (await prompt([
        { type: 'input', name: 'week', message: '분석할 주차 번호 (기본값: 현재):' },
      ])) as { week: string };
      return { command: 'analyze', options: { week: week ? Number(week) : undefined } };
    }

    case 'deploy': {
      const { preview } = (await prompt([
        { type: 'confirm', name: 'preview', message: '프리뷰 배포로 실행하시겠습니까?' },
      ])) as { preview: boolean };
      return { command: 'deploy', options: { preview } };
    }

    case 'workflow': {
      const { workflowId } = (await prompt([
        {
          type: 'list',
          name: 'workflowId',
          message: '실행할 워크플로우:',
          choices: [
            'onGitHubSync',
            'onNotionSync',
            'onMissionUpdate',
            'onMeetingSync',
            'onSkillUpdate',
            'weeklyDigest',
          ],
        },
      ])) as { workflowId: string };
      return { command: 'workflow', options: { workflowId } };
    }

    case 'schedule': {
      const { operation } = (await prompt([
        {
          type: 'list',
          name: 'operation',
          message: '스케줄 작업을 선택하세요:',
          choices: ['list', 'add', 'remove', 'run-due', 'start'],
        },
      ])) as { operation: string };

      switch (operation) {
        case 'list':
          return { command: 'schedule', options: { operation: 'list' } };

        case 'add': {
          const { workflowId, cron } = (await prompt([
            {
              type: 'list',
              name: 'workflowId',
              message: '스케줄에 등록할 워크플로우:',
              choices: [
                'onGitHubSync',
                'onNotionSync',
                'onMissionUpdate',
                'onMeetingSync',
                'onSkillUpdate',
                'weeklyDigest',
              ],
            },
            {
              type: 'input',
              name: 'cron',
              message: 'cron 표현식 (예: 0 9 * * *):',
            },
          ])) as { workflowId: string; cron: string };
          return { command: 'schedule', options: { operation: 'add', workflowId, cron } };
        }

        case 'remove': {
          const { workflowId } = (await prompt([
            {
              type: 'list',
              name: 'workflowId',
              message: '스케줄에서 제거할 워크플로우:',
              choices: [
                'onGitHubSync',
                'onNotionSync',
                'onMissionUpdate',
                'onMeetingSync',
                'onSkillUpdate',
                'weeklyDigest',
              ],
            },
          ])) as { workflowId: string };
          return { command: 'schedule', options: { operation: 'remove', workflowId } };
        }

        case 'run-due': {
          const { at } = (await prompt([
            {
              type: 'input',
              name: 'at',
              message: '기준 시각 ISO 문자열 (비우면 현재 시각):',
            },
          ])) as { at: string };
          return { command: 'schedule', options: { operation: 'run-due', at: at || undefined } };
        }

        case 'start': {
          const { intervalSeconds } = (await prompt([
            {
              type: 'input',
              name: 'intervalSeconds',
              message: '폴링 간격 초 (기본값: 60):',
            },
          ])) as { intervalSeconds: string };
          return {
            command: 'schedule',
            options: {
              operation: 'start',
              intervalSeconds: intervalSeconds ? Number(intervalSeconds) : undefined,
            },
          };
        }

        default:
          return { command: 'schedule', options: { operation: 'list' } };
      }
    }

    case 'status':
      return { command: 'status', options: {} as Record<string, never> };

    default:
      return { command: 'exit', options: {} as Record<string, never> };
  }
}
