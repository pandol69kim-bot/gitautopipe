"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInteractive = runInteractive;
async function runInteractive(prompt) {
    const { command } = (await prompt([
        {
            type: 'list',
            name: 'command',
            message: '실행할 명령어를 선택하세요:',
            choices: ['scan', 'sync', 'analyze', 'deploy', 'workflow', 'status', 'exit'],
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
                    choices: ['onMissionUpdate', 'onMeetingSync', 'onSkillUpdate', 'weeklyDigest'],
                },
            ]));
            return { command: 'workflow', options: { workflowId } };
        }
        case 'status':
            return { command: 'status', options: {} };
        default:
            return { command: 'exit', options: {} };
    }
}
//# sourceMappingURL=interactive.js.map