import type { CaseRecord, Profile, UserRole } from './models';

export class AccessPolicy {
  static canViewCase(profile: Profile, caseRecord: CaseRecord): boolean {
    if (!profile.active) return false;
    if (profile.role === 'platform_admin') return true;
    if (profile.institutionId !== caseRecord.institutionId) return false;
    if (profile.role === 'student') return profile.id === caseRecord.studentId;
    return true;
  }

  static canManageInstitution(role: UserRole): boolean {
    return role === 'institution_admin' || role === 'platform_admin';
  }

  static canManagePlatform(role: UserRole): boolean {
    return role === 'platform_admin';
  }

  static canReviewCase(role: UserRole): boolean {
    return role === 'counselor' || role === 'institution_admin' || role === 'platform_admin';
  }
}
