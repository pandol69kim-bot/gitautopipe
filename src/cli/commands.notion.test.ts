import { describe, expect, it } from 'vitest';

import { mapNotionSyncError } from './commands';

describe('mapNotionSyncError', () => {
  it('object_not_found를 공유/ID 점검 안내로 변환한다', () => {
    const error = {
      code: 'object_not_found',
      message: 'Could not find database with ID: 356ce5bf-5072-808c-b2f3-ed6c2913e96f',
      request_id: 'req-123',
      additional_data: {
        integration_id: 'integration-456',
      },
    };

    const mapped = mapNotionSyncError(error, '356ce5bf-5072-808c-b2f3-ed6c2913e96f');

    expect(mapped.message).toContain('Notion 데이터베이스에 접근할 수 없습니다');
    expect(mapped.message).toContain('gitautopipe');
    expect(mapped.message).toContain('NOTION_DATABASE_ID');
    expect(mapped.message).toContain('integration_id=integration-456');
    expect(mapped.message).toContain('request_id=req-123');
  });

  it('기타 에러는 원본 Error를 유지한다', () => {
    const original = new Error('boom');

    const mapped = mapNotionSyncError(original, 'db-id');

    expect(mapped).toBe(original);
  });
});