export interface AuthenticatedUser {
  userId: string | null;
  platformAdminId?: string | null;
  organizationId: string | null;
  email: string;
  isPlatformAdmin: boolean;
}
