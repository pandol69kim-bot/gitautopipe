"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretManager = void 0;
const crypto_1 = require("crypto");
const DEFAULT_REQUIRED_KEYS = ['GITHUB_TOKEN', 'OPENAI_API_KEY', 'NOTION_TOKEN'];
const CIPHER_ALGORITHM = 'aes-256-gcm';
class SecretManager {
    options;
    env;
    requiredKeys;
    encryptionKey;
    secrets = {};
    constructor(options = {}) {
        this.options = options;
        this.env = options.env ?? process.env;
        this.requiredKeys = options.requiredKeys ?? DEFAULT_REQUIRED_KEYS;
        this.encryptionKey = options.encryptionKey
            ? (0, crypto_1.createHash)('sha256').update(options.encryptionKey).digest()
            : undefined;
    }
    async loadSecrets(source) {
        if (source === 'vault') {
            if (!this.options.vaultProvider) {
                throw new Error('vaultProvider가 설정되지 않았습니다.');
            }
            this.secrets = { ...(await this.options.vaultProvider.load()) };
            return { ...this.secrets };
        }
        this.secrets = Object.entries(this.env).reduce((acc, [key, value]) => {
            if (typeof value === 'string' && value.trim().length > 0) {
                acc[key] = value;
            }
            return acc;
        }, {});
        return { ...this.secrets };
    }
    async validateSecrets(requiredKeys = this.requiredKeys) {
        const source = Object.keys(this.secrets).length > 0 ? this.secrets : await this.loadSecrets('env');
        this.secrets = { ...source };
        const missingKeys = requiredKeys.filter((key) => !source[key]);
        return {
            isValid: missingKeys.length === 0,
            missingKeys,
        };
    }
    async rotateSecret(key, nextValue) {
        if (!nextValue || nextValue.trim().length === 0) {
            throw new Error(`${key}의 새 값이 비어 있습니다.`);
        }
        this.secrets = {
            ...this.secrets,
            [key]: nextValue,
        };
    }
    encryptSecret(label, value) {
        const key = this.getEncryptionKey();
        const iv = (0, crypto_1.randomBytes)(12);
        const cipher = (0, crypto_1.createCipheriv)(CIPHER_ALGORITHM, key, iv);
        cipher.setAAD(Buffer.from(label));
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [
            Buffer.from(label, 'utf8').toString('base64'),
            iv.toString('base64'),
            tag.toString('base64'),
            encrypted.toString('base64'),
        ].join('.');
    }
    decryptSecret(payload, expectedLabel) {
        const [labelPart, ivPart, tagPart, encryptedPart] = payload.split('.');
        if (!labelPart || !ivPart || !tagPart || !encryptedPart) {
            throw new Error('암호화된 시크릿 형식이 올바르지 않습니다.');
        }
        const label = Buffer.from(labelPart, 'base64').toString('utf8');
        if (expectedLabel && expectedLabel !== label) {
            throw new Error(`시크릿 레이블이 일치하지 않습니다: expected=${expectedLabel}, actual=${label}`);
        }
        const key = this.getEncryptionKey();
        const decipher = (0, crypto_1.createDecipheriv)(CIPHER_ALGORITHM, key, Buffer.from(ivPart, 'base64'));
        decipher.setAAD(Buffer.from(label));
        decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encryptedPart, 'base64')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }
    getSecret(key) {
        return this.secrets[key];
    }
    getMaskedSecrets() {
        return Object.entries(this.secrets).reduce((acc, [key, value]) => {
            acc[key] = maskValue(value);
            return acc;
        }, {});
    }
    getEncryptionKey() {
        if (!this.encryptionKey) {
            throw new Error('encryptionKey가 설정되지 않았습니다.');
        }
        return this.encryptionKey;
    }
}
exports.SecretManager = SecretManager;
function maskValue(value) {
    if (value.length <= 6) {
        return '*'.repeat(value.length);
    }
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
}
//# sourceMappingURL=secret-manager.js.map