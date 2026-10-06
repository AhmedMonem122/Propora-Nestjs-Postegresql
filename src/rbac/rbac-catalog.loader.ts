import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PermissionSeed {
  name: string;
  resource: string;
  action: string;
  description: string;
}

export interface RoleTemplate {
  name: string;
  description: string;
  permissions: string[];
}

export interface RbacSeedCatalog {
  permissions: PermissionSeed[];
  roleTemplates: RoleTemplate[];
  platformAdminRole: RoleTemplate;
}

export function loadRbacSeedCatalog(): RbacSeedCatalog {
  const filePath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'prisma',
    'rbac-seed.json',
  );
  return JSON.parse(readFileSync(filePath, 'utf-8')) as RbacSeedCatalog;
}

export function resolveTemplatePermissions(template: RoleTemplate, allPermissionNames: string[]): string[] {
  if (template.permissions.includes('*')) {
    return allPermissionNames;
  }
  return template.permissions;
}
