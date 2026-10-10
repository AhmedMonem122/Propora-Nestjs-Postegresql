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

/**
 * Account model (deliberately simple — the secure default for B2B SaaS):
 * - POST /register is PUBLIC but can only create an ORGANIZATION + its owner.
 *   There is no role picker: employees are invited by admins (POST /users),
 *   platform admins are seeded server-side. Self-registering as an admin is
 *   impossible by design.
 * - POST /login takes email + password only (no role dropdown — the server
 *   already knows your roles; GET /me returns them for client-side routing).
 * - Platform admins sign in separately at POST /platform/auth/login.
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
    summary: 'Register a new organization and its owner (public signup)',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.register(dto, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return this.toResponse(tokens, user);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate with email and password (roles come from GET /me)',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.login(dto, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return this.toResponse(tokens, user);
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
