export interface TenantContext {
  userId: string | null;
  organizationId: string | null;
  isPlatformAdmin: boolean;
}
