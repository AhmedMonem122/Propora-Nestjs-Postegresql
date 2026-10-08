import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service.js';

export interface JwtPayload {
  sub: string;
  organizationId: string | null;
  email: string;
  tokenVersion?: number;
  platformAdminId?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.platformAdminId) {
      const admin = await this.prisma.platformAdmin.findUnique({
        where: { id: payload.platformAdminId },
      });

      if (!admin || admin.status !== 'ACTIVE') {
        throw new UnauthorizedException('Platform admin is no longer active');
      }

      return {
        userId: null,
        platformAdminId: admin.id,
        organizationId: null,
        email: admin.email,
        isPlatformAdmin: true,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    if (user.organizationId !== (payload.organizationId ?? null)) {
      throw new UnauthorizedException('Invalid token claims');
    }

    // Tokens issued before a password change carry an older version and are
    // rejected immediately instead of lingering until expiry.
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return {
      userId: user.id,
      platformAdminId: null,
      organizationId: user.organizationId,
      email: user.email,
      isPlatformAdmin: false,
    };
  }
}
