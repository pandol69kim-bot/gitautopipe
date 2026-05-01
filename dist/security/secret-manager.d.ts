import type { SecretManagerOptions, Secrets, SecretSource, ValidationResult } from '../types/security';
export declare class SecretManager {
    private readonly options;
    private readonly env;
    private readonly requiredKeys;
    private readonly encryptionKey?;
    private secrets;
    constructor(options?: SecretManagerOptions);
    loadSecrets(source: SecretSource): Promise<Secrets>;
    validateSecrets(requiredKeys?: string[]): Promise<ValidationResult>;
    rotateSecret(key: string, nextValue: string): Promise<void>;
    encryptSecret(label: string, value: string): string;
    decryptSecret(payload: string, expectedLabel?: string): string;
    getSecret(key: string): string | undefined;
    getMaskedSecrets(): Secrets;
    private getEncryptionKey;
}
//# sourceMappingURL=secret-manager.d.ts.map