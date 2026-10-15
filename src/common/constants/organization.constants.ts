/**
 * Canonical organization plans and self-service role names.
 *
 * Plans are a closed list on purpose: the platform edit form renders a
 * dropdown and the API rejects anything else, so a typo can never create a
 * phantom "PROO" tier in production data.
 */
export const ORGANIZATION_PLANS = [
  'FREE',
  'STARTER',
  'GROWTH',
  'ENTERPRISE',
] as const;

export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];

/**
 * Roles a stranger may request on the PUBLIC register form. The platform
 * admin role is deliberately absent: `ADMIN` is not a valid enum value, so
 * class-validator rejects `role: "ADMIN"` with a 400 before any code runs.
 */
export const REGISTER_ROLES = [
  'OWNER',
  'PROPERTY_MANAGER',
  'MAINTENANCE_MANAGER',
  'ACCOUNTANT',
  'STAFF',
] as const;

export type RegisterRole = (typeof REGISTER_ROLES)[number];

/** Login accepts everything register does, plus the platform admin. */
export const LOGIN_ROLES = ['ADMIN', ...REGISTER_ROLES] as const;

export type LoginRole = (typeof LOGIN_ROLES)[number];

/**
 * Maps the public role keys to the RBAC catalog template names seeded into
 * every new organization.
 */
export const REGISTER_ROLE_TO_TEMPLATE: Record<RegisterRole, string> = {
  OWNER: 'ORGANIZATION_OWNER',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  MAINTENANCE_MANAGER: 'MAINTENANCE_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  STAFF: 'STAFF',
};

export const TEMPLATE_TO_REGISTER_ROLE: Record<string, RegisterRole> =
  Object.fromEntries(
    Object.entries(REGISTER_ROLE_TO_TEMPLATE).map(([key, template]) => [
      template,
      key as RegisterRole,
    ]),
  );
