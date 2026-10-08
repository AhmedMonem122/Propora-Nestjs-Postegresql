import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit:action';
export const AUDIT_ENTITY_KEY = 'audit:entity';

export interface AuditOptions {
  /**
   * Entity type recorded in the log (e.g. `payment`).
   * When set at class level, the action is derived from the HTTP method
   * (`payment.create`, `payment.update`, …) unless a method-level
   * `@Audit()` overrides it.
   */
  entity?: string;
  /** Route param holding the entity id. Defaults to `id`. */
  entityParam?: string;
}

/** Method-level override: records this exact action after success. */
export const Audit = (action: string, options?: AuditOptions) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, ...options });

/** Class-level default entity for automatic CRUD action derivation. */
export const AuditEntity = (entity: string, options?: AuditOptions) =>
  SetMetadata(AUDIT_ENTITY_KEY, { entity, ...options });
