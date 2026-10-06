import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ nullable: true })
  organizationId: string | null;

  @ApiProperty()
  status: string;

  @ApiProperty({ type: [String] })
  roles: string[];
}

interface UserWithRoles {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  organizationId: string | null;
  status: string;
  userRoles?: Array<{ role: { name: string } }>;
}

export function toUserResponse(user: UserWithRoles): UserResponseDto {
  const dto = new UserResponseDto();
  dto.id = user.id;
  dto.email = user.email;
  dto.firstName = user.firstName;
  dto.lastName = user.lastName;
  dto.phone = user.phone;
  dto.organizationId = user.organizationId;
  dto.status = user.status;
  dto.roles = (user.userRoles ?? []).map((userRole) => userRole.role.name);
  return dto;
}
