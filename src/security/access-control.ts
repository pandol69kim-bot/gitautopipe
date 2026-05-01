import type { AccessDecision, AccessRequest, UserIdentity } from '../types/security';

export function authorizeAccess(user: UserIdentity, request: AccessRequest): AccessDecision {
  if (user.role === 'Admin') {
    return { allowed: true };
  }

  if (request.action === 'read') {
    return { allowed: true };
  }

  if (user.role === 'Viewer') {
    return { allowed: false, reason: 'Viewer는 읽기 전용입니다.' };
  }

  const isOwner = request.resourceOwnerId === undefined || request.resourceOwnerId === user.id;
  if (!isOwner) {
    return { allowed: false, reason: 'Member는 자신의 리소스만 수정할 수 있습니다.' };
  }

  if (request.action === 'manage') {
    return { allowed: false, reason: 'Member는 관리 권한이 없습니다.' };
  }

  return { allowed: true };
}