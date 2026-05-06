"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractive = runInteractive;
async function runInteractive(prompt) {
    const { command } = (await prompt([
        {
            type: 'list',
            name: 'command',
            message: '실행할 명령어를 선택하세요:',
            choices: ['scan', 'sync', 'analyze', 'deploy', 'workflow', 'schedule', 'status', 'exit'],
        },
    ]));
    switch (command) {
        case 'scan': {
            const { folder } = (await prompt([
                { type: 'input', name: 'folder', message: '스캔할 폴더 (기본값: all):' },
            ]));
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
            ]));
            return { command: 'sync', options: { target } };
        }
        case 'analyze': {
            const { week } = (await prompt([
                { type: 'input', name: 'week', message: '분석할 주차 번호 (기본값: 현재):' },
            ]));
            return { command: 'analyze', options: { week: week ? Number(week) : undefined } };
        }
        case 'deploy': {
            const { preview } = (await prompt([
                { type: 'confirm', name: 'preview', message: '프리뷰 배포로 실행하시겠습니까?' },
            ]));
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
            ]));
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
            ]));
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
                    ]));
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
                    ]));
                    return { command: 'schedule', options: { operation: 'remove', workflowId } };
                }
                case 'run-due': {
                    const { at } = (await prompt([
                        {
                            type: 'input',
                            name: 'at',
                            message: '기준 시각 ISO 문자열 (비우면 현재 시각):',
                        },
                    ]));
                    return { command: 'schedule', options: { operation: 'run-due', at: at || undefined } };
                }
                case 'start': {
                    const { intervalSeconds } = (await prompt([
                        {
                            type: 'input',
                            name: 'intervalSeconds',
                            message: '폴링 간격 초 (기본값: 60):',
                        },
                    ]));
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
            return { command: 'status', options: {} };
        default:
            return { command: 'exit', options: {} };
    }
}
//# sourceMappingURL=interactive.js.map