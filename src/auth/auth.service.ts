import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import bcryptjs from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { loadRbacSeedCatalog, resolveTemplatePermissions } from '../rbac/rbac-catalog.loader.js';
import { slugify } from '../common/utils/slugify.util.js';
import { toUserResponse, UserResponseDto } from '../common/dto/user-response.dto.js';
import {
  ChangePasswordDto,
} from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rbacService: RbacService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcryptjs.hash(
      dto.password,
      this.saltRounds(),
    );
    const slug = await this.generateUniqueSlug(dto.organizationName);
    const catalog = loadRbacSeedCatalog();
    const allPermissionNames = catalog.permissions.map(
      (permission) => permission.name,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, slug },
      });

      const roles = [];
      for (const template of catalog.roleTemplates) {
        const permissionNames = resolveTemplatePermissions(
          template,
          allPermissionNames,
        );
        const role = await tx.role.create({
          data: {
            name: template.name,
            description: template.description,
            isSystem: true,
            organizationId: organization.id,
            rolePermissions: {
              create: permissionNames.map((name) => ({
                permission: { connect: { name } },
              })),
            },
          },
        });
        roles.push(role);
      }

      const ownerRole = roles.find(
        (role) => role.name === 'ORGANIZATION_OWNER',
      );

      if (!ownerRole) {
        throw new Error(
          'ORGANIZATION_OWNER role template is missing from the RBAC catalog',
        );
      }

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'ACTIVE',
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: ownerRole.id },
      });

      return { organization, user, roles };
    });

    const tokens = await this.issueTokens(result.user);
    const userResponse = await this.buildUserResponse(result.user.id);

    return { tokens, user: userResponse };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcryptjs.compare(
      dto.password,
      user.passwordHash,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `Your account is ${user.status.toLowerCase()}. Contact your organization administrator.`,
      );
    }

    if (user.organization && user.organization.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Your organization is suspended. Contact the platform administrator.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    const userResponse = await this.buildUserResponse(user.id);

    return { tokens, user: userResponse };
  }

  async refresh(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    const userResponse = await this.buildUserResponse(user.id);

    return { tokens, user: userResponse };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken) },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const userResponse = await this.buildUserResponse(userId);
    const permissions = await this.rbacService.getUserPermissions(userId);

    return { ...userResponse, permissions };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const validPassword = await bcryptjs.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!validPassword) {
      throw new ForbiddenException('Current password is incorrect');
    }

    const passwordHash = await bcryptjs.hash(dto.newPassword, this.saltRounds());

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async issueTokens(user: {
    id: string;
    organizationId: string | null;
    email: string;
  }): Promise<IssuedTokens> {
    const accessExpiresIn = this.configService.get(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.configService.get(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        organizationId: user.organizationId ?? null,
        email: user.email,
      },
      { expiresIn: accessExpiresIn },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + parseDurationMs(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: Math.floor(parseDurationMs(accessExpiresIn) / 1000),
      expiresAt,
    };
  }

  private async buildUserResponse(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return toUserResponse(user);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let counter = 2;

    while (
      await this.prisma.organization.findUnique({ where: { slug } })
    ) {
      slug = `${base}-${counter++}`;
    }

    return slug;
  }

  private saltRounds(): number {
    return Number(this.configService.get<number>('BCRYPT_SALT_ROUNDS', 12));
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid duration unit: ${unit}`);
  }
}
