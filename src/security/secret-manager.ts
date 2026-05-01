import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

import type {
  SecretManagerOptions,
  Secrets,
  SecretSource,
  ValidationResult,
} from '../types/security';

const DEFAULT_REQUIRED_KEYS = ['GITHUB_TOKEN', 'CLAUDE_API_KEY', 'NOTION_TOKEN'];
const CIPHER_ALGORITHM = 'aes-256-gcm';

export class SecretManager {
  private readonly env: NodeJS.ProcessEnv;
  private readonly requiredKeys: string[];
  private readonly encryptionKey?: Buffer;
  private secrets: Secrets = {};

  constructor(private readonly options: SecretManagerOptions = {}) {
    this.env = options.env ?? process.env;
    this.requiredKeys = options.requiredKeys ?? DEFAULT_REQUIRED_KEYS;
    this.encryptionKey = options.encryptionKey
      ? createHash('sha256').update(options.encryptionKey).digest()
      : undefined;
  }

  async loadSecrets(source: SecretSource): Promise<Secrets> {
    if (source === 'vault') {
      if (!this.options.vaultProvider) {
        throw new Error('vaultProvider가 설정되지 않았습니다.');
      }

      this.secrets = { ...(await this.options.vaultProvider.load()) };
      return { ...this.secrets };
    }

    this.secrets = Object.entries(this.env).reduce<Secrets>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        acc[key] = value;
      }
      return acc;
    }, {});

    return { ...this.secrets };
  }

  async validateSecrets(requiredKeys: string[] = this.requiredKeys): Promise<ValidationResult> {
    const source = Object.keys(this.secrets).length > 0 ? this.secrets : await this.loadSecrets('env');
    this.secrets = { ...source };
    const missingKeys = requiredKeys.filter((key) => !source[key]);

    return {
      isValid: missingKeys.length === 0,
      missingKeys,
    };
  }

  async rotateSecret(key: string, nextValue: string): Promise<void> {
    if (!nextValue || nextValue.trim().length === 0) {
      throw new Error(`${key}의 새 값이 비어 있습니다.`);
    }

    this.secrets = {
      ...this.secrets,
      [key]: nextValue,
    };
  }

  encryptSecret(label: string, value: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
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

  decryptSecret(payload: string, expectedLabel?: string): string {
    const [labelPart, ivPart, tagPart, encryptedPart] = payload.split('.');
    if (!labelPart || !ivPart || !tagPart || !encryptedPart) {
      throw new Error('암호화된 시크릿 형식이 올바르지 않습니다.');
    }

    const label = Buffer.from(labelPart, 'base64').toString('utf8');
    if (expectedLabel && expectedLabel !== label) {
      throw new Error(`시크릿 레이블이 일치하지 않습니다: expected=${expectedLabel}, actual=${label}`);
    }

    const key = this.getEncryptionKey();

    const decipher = createDecipheriv(
      CIPHER_ALGORITHM,
      key,
      Buffer.from(ivPart, 'base64')
    );
    decipher.setAAD(Buffer.from(label));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  getSecret(key: string): string | undefined {
    return this.secrets[key];
  }

  getMaskedSecrets(): Secrets {
    return Object.entries(this.secrets).reduce<Secrets>((acc, [key, value]) => {
      acc[key] = maskValue(value);
      return acc;
    }, {});
  }

  private getEncryptionKey(): Buffer {
    if (!this.encryptionKey) {
      throw new Error('encryptionKey가 설정되지 않았습니다.');
    }

    return this.encryptionKey;
  }
}

function maskValue(value: string): string {
  if (value.length <= 6) {
    return '*'.repeat(value.length);
  }

  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}