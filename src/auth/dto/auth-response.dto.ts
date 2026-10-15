import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../common/dto/user-response.dto.js';

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({
    description:
      'Refresh token (also set as an httpOnly cookie). Send it in the body of POST /auth/refresh when cookies are unavailable.',
  })
  refreshToken: string;

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;

  @ApiProperty({
    example: 'OWNER',
    description: 'Verified role this session signed in as',
  })
  loginRole: string;

  @ApiProperty({
    example: '/dashboard',
    description: 'Where the client should land: /dashboard or /platform',
  })
  target: string;
}
