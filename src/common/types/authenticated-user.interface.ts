export interface AuthenticatedUser {
  userId: string;
  organizationId: string | null;
  email: string;
}
