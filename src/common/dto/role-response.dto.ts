import { ApiProperty } from '@nestjs/swagger';

export class RoleResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  isSystem: boolean;

  @ApiProperty({ type: [String] })
  permissions: string[];

  @ApiProperty({ nullable: true })
  userCount: number | null;
}

interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rolePermissions?: Array<{ permission: { name: string } }>;
  _count?: { userRoles: number };
}

export function toRoleResponse(role: RoleWithPermissions): RoleResponseDto {
  const dto = new RoleResponseDto();
  dto.id = role.id;
  dto.name = role.name;
  dto.description = role.description;
  dto.isSystem = role.isSystem;
  dto.permissions = (role.rolePermissions ?? []).map(
    (rolePermission) => rolePermission.permission.name,
  );
  dto.userCount = role._count?.userRoles ?? null;
  return dto;
}
