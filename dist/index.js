"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./utils/env");
async function main() {
    (0, env_1.loadEnv)();
    console.log('셀피시 클럽 AI 에이전트 시스템 시작');
}
main().catch(console.error);
//# sourceMappingURL=index.js.map