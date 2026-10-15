import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.interface.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';

const REFRESH_COOKIE = 'propora_refresh_token';
const COOKIE_PATH = '/api/v1/auth';
// Platform session cookies (same names/paths as PlatformAuthController —
// the unified ADMIN login must plant the cookie the platform refresh
// endpoint actually reads, or the session dies on the first reload).
const PLATFORM_REFRESH_COOKIE = 'propora_platform_refresh';
const PLATFORM_COOKIE_PATH = '/api/v1/platform/auth';

/**
 * Account model (unified login, role-aware):
 * - POST /register is PUBLIC with a role dropdown (OWNER creates an org,
 *   every other role needs an inviteCode to join). "ADMIN" is rejected by
 *   validation (400); platform admins are seeded server-side.
 * - POST /login is UNIFIED with a role dropdown: ADMIN signs into the
 *   platform session (target /platform), org roles are verified against the
 *   membership (403 on mismatch) and land on /dashboard.
 * - POST /platform/auth/login still exists for back-compat.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary:
      'Register: OWNER creates an organization, other roles join via inviteCode',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, req.ip);
    this.setRefreshCookie(res, result.tokens.refreshToken, result.tokens.expiresAt);
    return {
      ...this.toResponse(result.tokens, result.user),
      loginRole: result.loginRole,
      target: result.target,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Unified login with role dropdown (ADMIN → platform session, org roles verified)',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // ADMIN on the unified form signs into the PLATFORM session (same
    // accounts as POST /platform/auth/login) and lands on /platform.
    if (dto.role === 'ADMIN') {
      const { tokens, admin } = await this.authService.platformLogin(
        dto,
        req.ip,
      );
      this.setPlatformRefreshCookie(
        res,
        tokens.refreshToken,
        tokens.expiresAt,
      );
      return {
        ...this.toResponse(tokens, admin),
        loginRole: 'ADMIN',
        target: '/platform',
      };
    }
    const result = await this.authService.login(dto, req.ip);
    this.setRefreshCookie(res, result.tokens.refreshToken, result.tokens.expiresAt);
    return {
      ...this.toResponse(result.tokens, result.user),
      loginRole: result.loginRole,
      target: result.target,
    };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary:
      'Rotate the refresh token. Cookie is primary; body fallback for mobile (both must agree if sent). Returns a NEW access + refresh pair.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.resolveRefreshToken(req, dto);
    const { tokens, user } = await this.authService.refresh(
      refreshToken,
      req.ip,
    );
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return this.toResponse(tokens, user);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.resolveRefreshToken(req, dto, true);
    await this.authService.logout(refreshToken, req.ip);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Email a 6-digit reset code (always 200, never reveals emails)',
  })
  @ApiOkResponse({ description: 'Acknowledgement' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService
      .requestPasswordReset(dto)
      .then(() => ({
        message:
          'If an account exists for this email, a reset code was sent.',
      }));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset the password with the emailed code (logs you in)',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.resetPassword(dto, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return this.toResponse(tokens, user);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user with roles and permissions' })
  @ApiOkResponse({ type: AuthResponseDto })
  async me(@CurrentUser() user: AuthenticatedUser) {
    if (!user.userId) {
      throw new UnauthorizedException('Organization account required');
    }
    return this.authService.me(user.userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: 'Update your own profile (name, phone)' })
  @ApiOkResponse({ description: 'Updated profile' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateMeDto,
    @Req() req: Request,
  ) {
    if (!user.userId) {
      throw new UnauthorizedException('Organization account required');
    }
    return this.authService.updateMe(user.userId, dto, req.ip);
  }

  @ApiBearerAuth()
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete your account (deactivates; login reactivates)',
  })
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!user.userId) {
      throw new UnauthorizedException('Organization account required');
    }
    await this.authService.deleteMe(user.userId, req.ip);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiOkResponse({ description: 'Password updated' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    if (!user.userId) {
      throw new UnauthorizedException('Organization account required');
    }
    await this.authService.changePassword(user.userId, dto, req.ip);
  }

  /**
   * The cookie is the primary transport; the body is a fallback for clients
   * without cookies (mobile). When both are sent they MUST agree — silently
   * preferring one over the other is what made "I sent my access token and
   * still got a new token" possible.
   */
  private resolveRefreshToken(
    req: Request,
    dto: RefreshTokenDto,
    optional = false,
  ): string | undefined {
    const fromCookie = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const fromBody = dto.refreshToken;

    if (fromCookie && fromBody && fromCookie !== fromBody) {
      throw new UnauthorizedException(
        'Conflicting refresh tokens: the cookie and the body do not match',
      );
    }

    const token = fromCookie ?? fromBody;
    if (!token && !optional) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return token;
  }

  private toResponse(
    tokens: { accessToken: string; refreshToken: string; expiresIn: number },
    user: unknown,
  ) {
    return {
      accessToken: tokens.accessToken,
      // Browser clients use the httpOnly cookie; mobile/CLI clients store
      // this value and send it back in the body of POST /auth/refresh.
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      user,
    };
  }

  private setRefreshCookie(
    res: Response,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const { sameSite, secure } = this.cookieOptions();
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: expiresAt.getTime() - Date.now(),
      path: COOKIE_PATH,
    });
  }

  /**
   * Plants the platform refresh cookie for unified ADMIN logins. Without
   * this, the in-memory platform token works until the first reload, then
   * POST /platform/auth/refresh finds no cookie and the session is gone.
   */
  private setPlatformRefreshCookie(
    res: Response,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const { sameSite, secure } = this.cookieOptions();
    res.cookie(PLATFORM_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: expiresAt.getTime() - Date.now(),
      path: PLATFORM_COOKIE_PATH,
    });
  }

  /**
   * Web + mobile on one backend, dashboard on another origin: cross-site
   * cookies need `SameSite=None; Secure`, same-site deployments keep `Lax`.
   */
  private cookieOptions(): { sameSite: 'lax' | 'none'; secure: boolean } {
    const configured = this.configService
      .get<string>('COOKIE_SAMESITE', 'lax')
      .toLowerCase();
    if (configured === 'none') {
      return { sameSite: 'none', secure: true };
    }
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    return { sameSite: 'lax', secure: isProduction };
  }
}
