export interface PaymentPaidEvent {
  organizationId: string;
  paymentId: string;
  leaseId: string;
  amount: number;
  currency: string;
}

export interface MaintenanceAssignedEvent {
  organizationId: string;
  requestId: string;
  assigneeId: string;
  assigneeEmail?: string;
  title: string;
}

export interface UserRegisteredEvent {
  organizationId: string;
  organizationName: string;
  userId: string;
  email: string;
  firstName: string;
}

export interface UserInvitedEvent {
  organizationId: string;
  organizationName: string;
  email: string;
  firstName: string;
  temporaryPassword?: string;
}

export interface PasswordChangedEvent {
  organizationId: string | null;
  userId: string;
  email: string;
}

export interface PasswordResetRequestedEvent {
  email: string;
  firstName: string;
  otp: string;
  ttlMinutes: number;
}

export interface DomainEventMap {
  'payment.paid': PaymentPaidEvent;
  'maintenance.assigned': MaintenanceAssignedEvent;
  'user.registered': UserRegisteredEvent;
  'user.invited': UserInvitedEvent;
  'user.passwordChanged': PasswordChangedEvent;
  'user.passwordResetRequested': PasswordResetRequestedEvent;
}

export type DomainEventName = keyof DomainEventMap;
