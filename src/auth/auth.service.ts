import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcryptjs from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { RbacService } from '../rbac/rbac.service.js';
import { loadRbacSeedCatalog, resolveTemplatePermissions } from '../rbac/rbac-catalog.loader.js';
import { slugify } from '../common/utils/slugify.util.js';
import {
  REGISTER_ROLE_TO_TEMPLATE,
  TEMPLATE_TO_REGISTER_ROLE,
  type RegisterRole,
} from '../common/constants/organization.constants.js';
import { toUserResponse, UserResponseDto } from '../common/dto/user-response.dto.js';
import { EventBus } from '../common/events/event-bus.js';
import { runInBackground } from '../common/utils/background.util.js';
import { AuditService } from '../audit/audit.service.js';
import {
  ChangePasswordDto,
} from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: Date;
}

interface TokenOwner {
  id: string;
  organizationId: string | null;
  email: string;
  tokenVersion?: number | null;
  platformAdminId?: string | null;
}

type RefreshKind = 'user' | 'platform';

/**
 * Refresh-token rotation with reuse detection (OAuth 2.0 best practice):
 * presenting an already-rotated token means it was stolen, so the whole
 * token family is revoked immediately instead of handing out new tokens.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly rbacService: RbacService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    // Role-aware public signup, two paths:
    // - OWNER without an inviteCode provisions a brand-new ORGANIZATION and
    //   becomes its owner (an org must never be ownerless).
    // - Any other role WITH a valid inviteCode joins that organization with
    //   the requested role — the secure way to add staff without the owner
    //   typing accounts in by hand.
    // "ADMIN" is not in the RegisterDto enum, so class-validator rejects it
    // with a 400 before this code runs; platform admins are seeded.
    if (this.configService.get('REGISTRATION_ENABLED', 'true') !== 'true') {
      throw new ForbiddenException('Public registration is disabled');
    }

    const email = dto.email.toLowerCase();
    const requestedRole: RegisterRole = dto.role ?? 'OWNER';

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    if (dto.inviteCode) {
      return this.registerJoin(dto, email, requestedRole, ip);
    }

    if (requestedRole !== 'OWNER') {
      throw new ForbiddenException(
        `Registering as ${requestedRole} requires an invite code from that organization`,
      );
    }

    const passwordHash = await bcryptjs.hash(
      dto.password,
      this.saltRounds(),
    );
    const slug = await this.generateUniqueSlug(dto.organizationName as string);
    const catalog = loadRbacSeedCatalog();
    const allPermissionNames = catalog.permissions.map(
      (permission) => permission.name,
    );

    // Organization provisioning writes roles × permissions in one unit.
    // Against remote Postgres (Neon) this can exceed Prisma's 5s default
    // interactive-transaction timeout, so it gets an explicit budget.
    const result = await this.prisma.$transaction(
      async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName as string,
          slug,
          inviteCode: await this.uniqueInviteCode(tx),
        },
      });

      await tx.organizationSetting.create({
        data: { organizationId: organization.id },
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
    },
    { timeout: 30_000 },
    );

    const tokens = await this.issueTokens(result.user);
    const userResponse = await this.buildUserResponse(result.user.id);

    await this.audit.log({
      organizationId: result.organization.id,
      userId: result.user.id,
      action: 'auth.register',
      entityType: 'organization',
      entityId: result.organization.id,
      ipAddress: ip ?? null,
    });

    runInBackground(
      this.events.emit('user.registered', {
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        userId: result.user.id,
        email,
        firstName: dto.firstName,
      }),
    );

    return { tokens, user: userResponse, loginRole: 'OWNER' as RegisterRole, target: '/dashboard' };
  }

  /**
   * Join path: the invite code identifies a live organization, the requested
   * role must exist inside it. Guessing a code only ever yields membership —
   * never ownership of anything new — and codes are high-entropy + owner
   * regenerable, so enumeration is impractical.
   */
  private async registerJoin(
    dto: RegisterDto,
    email: string,
    requestedRole: RegisterRole,
    ip?: string,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { inviteCode: dto.inviteCode as string },
    });

    if (!organization || organization.status !== 'ACTIVE') {
      throw new ForbiddenException('Invalid or expired invite code');
    }

    const templateName = REGISTER_ROLE_TO_TEMPLATE[requestedRole];
    const role = await this.prisma.role.findFirst({
      where: { organizationId: organization.id, name: templateName },
    });

    if (!role) {
      throw new ForbiddenException(
        `The ${requestedRole} role is not available in this organization`,
      );
    }

    const passwordHash = await bcryptjs.hash(dto.password, this.saltRounds());

    const user = await this.prisma.user.create({
      data: {
        organizationId: organization.id,
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: 'ACTIVE',
        userRoles: { create: [{ roleId: role.id }] },
      },
    });

    const tokens = await this.issueTokens(user);
    const userResponse = await this.buildUserResponse(user.id);

    await this.audit.log({
      organizationId: organization.id,
      userId: user.id,
      action: 'auth.registerJoin',
      entityType: 'organization',
      entityId: organization.id,
      ipAddress: ip ?? null,
    });

    runInBackground(
      this.events.emit('user.registered', {
        organizationId: organization.id,
        organizationName: organization.name,
        userId: user.id,
        email,
        firstName: dto.firstName,
      }),
    );

    return { tokens, user: userResponse, loginRole: requestedRole, target: '/dashboard' };
  }

  /** Collision-safe invite-code minting (unique index is the backstop). */
  private async uniqueInviteCode(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateInviteCode();
      const clash = await tx.organization.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new Error('Could not mint a unique organization invite code');
  }

  async login(dto: LoginDto, ip?: string) {
    // ADMIN never reaches the org user table: the unified form routes it to
    // the platform session in the controller, and this guard is the backstop.
    // (Checked before the user lookup on purpose — admins don't exist here.)
    if (dto.role === 'ADMIN') {
      throw new ForbiddenException(
        'Administrators sign in through the platform session',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        organization: true,
        userRoles: { include: { role: true } },
      },
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

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Your account is suspended. Contact the platform administrator.',
      );
    }

    // Self-deleted accounts (INACTIVE + deletedAt) come back to life on the
    // next successful login. Admin-deactivated ones (deletedAt NULL) stay out.
    let reactivated = false;
    if (user.status !== 'ACTIVE') {
      if (user.status === 'INACTIVE' && user.deletedAt) {
        reactivated = true;
      } else {
        throw new ForbiddenException(
          'Your account was deactivated by an administrator. Contact your organization administrator.',
        );
      }
    }

    if (user.organization && user.organization.status !== 'ACTIVE') {
      throw new ForbiddenException(
        'Your organization is suspended. Contact the platform administrator.',
      );
    }

    // Role dropdown on the unified login form: prove you hold the role you
    // picked, otherwise a staff member could walk the UI as an owner.
    let loginRole: RegisterRole = 'OWNER';
    if (dto.role) {
      const heldTemplates = new Set(
        user.userRoles.map((userRole) => userRole.role.name),
      );
      const requiredTemplate = REGISTER_ROLE_TO_TEMPLATE[dto.role];
      if (!heldTemplates.has(requiredTemplate)) {
        throw new ForbiddenException(
          `Your account does not hold the ${dto.role} role in ${user.organization?.name ?? 'your organization'}`,
        );
      }
      loginRole = dto.role;
    } else {
      const primary = user.userRoles[0]?.role.name;
      loginRole = primary
        ? (TEMPLATE_TO_REGISTER_ROLE[primary] ?? 'OWNER')
        : 'OWNER';
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(reactivated ? { status: 'ACTIVE', deletedAt: null } : {}),
      },
    });

    const tokens = await this.issueTokens(user);
    const userResponse = await this.buildUserResponse(user.id);

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: reactivated ? 'auth.reactivated' : 'auth.login',
        ipAddress: ip ?? null,
      });
    }

    return { tokens, user: userResponse, loginRole, target: '/dashboard' };
  }

  async refresh(refreshToken?: string, ip?: string) {
    const stored = await this.consumeRefreshToken(refreshToken, 'user');

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId as string },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is no longer active');
    }

    const tokens = await this.issueTokens(user);
    const userResponse = await this.buildUserResponse(user.id);

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.refresh',
        ipAddress: ip ?? null,
      });
    }

    return { tokens, user: userResponse };
  }

  async logout(refreshToken?: string, ip?: string) {
    if (!refreshToken) {
      return;
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      const stored = await this.prisma.refreshToken.findFirst({
        where: { tokenHash: hashToken(refreshToken) },
        include: { user: true },
      });
      if (stored?.user?.organizationId) {
        await this.audit.log({
          organizationId: stored.user.organizationId,
          userId: stored.user.id,
          action: 'auth.logout',
          ipAddress: ip ?? null,
        });
      }
    }
  }

  async me(userId: string) {
    const userResponse = await this.buildUserResponse(userId);
    const permissions = await this.rbacService.getUserPermissions(userId);

    // getUserPermissions returns a Set (right for .has() lookups), but a
    // Set serializes to `{}` — the client would see zero permissions.
    return { ...userResponse, permissions: [...permissions] };
  }

  async updateMe(userId: string, dto: UpdateMeDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      include: { userRoles: { include: { role: true } } },
    });

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId,
        action: 'auth.profileUpdated',
        ipAddress: ip ?? null,
      });
    }

    return toUserResponse(updated);
  }

  /**
   * Soft delete: the row stays (history, audit trail, FK integrity) but the
   * account becomes INACTIVE with deletedAt set — which is exactly what lets
   * the next login reactivate it, unlike admin deactivation.
   */
  async deleteMe(userId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'INACTIVE',
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId,
        action: 'auth.accountDeleted',
        ipAddress: ip ?? null,
      });
    }
  }

  /**
   * Starts an OTP password reset. ALWAYS succeeds silently — the response
   * never reveals whether the email exists (anti-enumeration).
   */
  async requestPasswordReset(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || user.status === 'SUSPENDED' || !user.organizationId) {
      this.logger.warn(
        'Password reset requested for unknown or ineligible account',
      );
      return;
    }

    // Single active code per user: invalidate previous unconsumed ones.
    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const otp = randomInt(100000, 1000000).toString();
    const ttlMinutes = Number(
      this.configService.get('PASSWORD_RESET_TTL_MINUTES', 10),
    );
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(otp),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });

    runInBackground(
      this.events.emit('user.passwordResetRequested', {
        email: user.email,
        firstName: user.firstName,
        otp,
        ttlMinutes,
      }),
    );
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or code');
    }

    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    const maxAttempts = Number(
      this.configService.get('OTP_MAX_ATTEMPTS', 5),
    );
    if (!token || token.attempts >= maxAttempts) {
      if (token) {
        await this.prisma.passwordResetToken.delete({ where: { id: token.id } });
      }
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (!otpMatches(dto.otp, token.tokenHash)) {
      await this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid email or code');
    }

    const passwordHash = await bcryptjs.hash(dto.newPassword, this.saltRounds());

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          status: 'ACTIVE',
          deletedAt: null,
          tokenVersion: { increment: 1 },
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Proving email ownership logs them straight in.
    const tokens = await this.issueTokens({ ...user, tokenVersion: user.tokenVersion + 1 });
    const userResponse = await this.buildUserResponse(user.id);

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId: user.id,
        action: 'auth.passwordReset',
        ipAddress: ip ?? null,
      });
    }

    runInBackground(
      this.events.emit('user.passwordChanged', {
        organizationId: user.organizationId,
        userId: user.id,
        email: user.email,
      }),
    );

    return { tokens, user: userResponse };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string) {
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
        // Bumping the version kills every outstanding access token at once;
        // the revoked refresh rows below stop any further rotation.
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (user.organizationId) {
      await this.audit.log({
        organizationId: user.organizationId,
        userId,
        action: 'auth.passwordChanged',
        ipAddress: ip ?? null,
      });
    }

    runInBackground(
      this.events.emit('user.passwordChanged', {
        organizationId: user.organizationId,
        userId,
        email: user.email,
      }),
    );
  }

  async platformLogin(dto: LoginDto, ip?: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const validPassword = await bcryptjs.compare(
      dto.password,
      admin.passwordHash,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.status !== 'ACTIVE') {
      throw new ForbiddenException('Platform admin account is not active');
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens({
      id: admin.id,
      organizationId: null,
      email: admin.email,
      platformAdminId: admin.id,
    });

    this.logger.log(`Platform admin login: ${admin.email} (${ip ?? 'unknown ip'})`);

    return {
      tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    };
  }

  async platformRefresh(refreshToken?: string, ip?: string) {
    const stored = await this.consumeRefreshToken(refreshToken, 'platform');

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: stored.platformAdminId as string },
    });

    if (!admin || admin.status !== 'ACTIVE') {
      throw new UnauthorizedException('Platform admin is no longer active');
    }

    const tokens = await this.issueTokens({
      id: admin.id,
      organizationId: null,
      email: admin.email,
      platformAdminId: admin.id,
    });

    this.logger.log(`Platform admin token refresh: ${admin.email} (${ip ?? 'unknown ip'})`);

    return {
      tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    };
  }

  async platformLogout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: hashToken(refreshToken),
        platformAdminId: { not: null },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Validates a presented refresh token and rotates it (single use).
   * A revoked-but-unexpired token means reuse → possible theft → the whole
   * token family is revoked before rejecting.
   */
  private async consumeRefreshToken(token: string | undefined, kind: RefreshKind) {
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    if (looksLikeJwt(token)) {
      throw new UnauthorizedException(
        'A refresh token is required here — access tokens are not accepted',
      );
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const belongsToKind =
      kind === 'user' ? Boolean(stored.userId) : Boolean(stored.platformAdminId);
    if (!belongsToKind) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.revokedAt) {
      await this.revokeTokenFamily(stored);
      this.logger.warn(
        `Refresh token reuse detected (${kind}); revoked the whole token family`,
      );
      throw new UnauthorizedException(
        'Refresh token reuse detected. All sessions were revoked as a precaution — please sign in again.',
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return stored;
  }

  private async revokeTokenFamily(stored: {
    userId: string | null;
    platformAdminId: string | null;
  }) {
    if (stored.userId) {
      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        this.prisma.user.update({
          where: { id: stored.userId },
          data: { tokenVersion: { increment: 1 } },
        }),
      ]);
    } else if (stored.platformAdminId) {
      await this.prisma.refreshToken.updateMany({
        where: { platformAdminId: stored.platformAdminId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async issueTokens(owner: TokenOwner): Promise<IssuedTokens> {
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
        sub: owner.id,
        organizationId: owner.organizationId ?? null,
        email: owner.email,
        tokenVersion: owner.tokenVersion ?? 0,
        ...(owner.platformAdminId
          ? { platformAdminId: owner.platformAdminId }
          : {}),
      },
      { expiresIn: accessExpiresIn },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      Date.now() + parseDurationMs(refreshExpiresIn),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: owner.platformAdminId ? null : owner.id,
        platformAdminId: owner.platformAdminId ?? null,
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

/** High-entropy public organization join codes (regenerable). */
function generateInviteCode(): string {
  return randomBytes(18).toString('base64url');
}

/** Constant-time OTP comparison over the stored SHA-256 hex digests. */
function otpMatches(otp: string, tokenHash: string): boolean {
  try {
    return timingSafeEqual(
      Buffer.from(hashToken(otp), 'hex'),
      Buffer.from(tokenHash, 'hex'),
    );
  } catch {
    return false;
  }
}

/** Access (JWT) tokens have exactly two dots; opaque refresh tokens have none. */
function looksLikeJwt(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 3 &&
    parts.every((part) => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part))
  );
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
