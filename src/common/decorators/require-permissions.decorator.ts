import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'propora:permissions';
export const PERMISSIONS_MODE_KEY = 'propora:permissions-mode';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: string[]) => {
  const decorators = [
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSIONS_MODE_KEY, 'any'),
  ];

  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: PropertyDescriptor,
  ) => {
    for (const decorator of decorators) {
      (
        decorator as (
          target: object,
          propertyKey?: string | symbol,
          descriptor?: PropertyDescriptor,
        ) => void
      )(target, propertyKey, descriptor);
    }
  };
};
