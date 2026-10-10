import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.interface.js';
import { AuthService } from '../auth/auth.service.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { RefreshTokenDto } from '../auth/dto/refresh.dto.js';

const PLATFORM_REFRESH_COOKIE = 'propora_platform_refresh';
const COOKIE_PATH = '/api/v1/platform/auth';

@ApiTags('platform')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform admin sign in (system level, no organization)' })
  @ApiOkResponse({ description: 'Platform session tokens' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, admin } = await this.authService.platformLogin(dto, req.ip);
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      admin,
    };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the platform refresh token' })
  @ApiOkResponse({ description: 'Platform session tokens' })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = req.cookies?.[PLATFORM_REFRESH_COOKIE] as
      | string
      | undefined;

    if (fromCookie && dto.refreshToken && fromCookie !== dto.refreshToken) {
      throw new UnauthorizedException(
        'Conflicting refresh tokens: the cookie and the body do not match',
      );
    }

    const { tokens, admin } = await this.authService.platformRefresh(
      fromCookie ?? dto.refreshToken,
      req.ip,
    );
    this.setRefreshCookie(res, tokens.refreshToken, tokens.expiresAt);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
      admin,
    };
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the platform refresh token' })
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = req.cookies?.[PLATFORM_REFRESH_COOKIE] as
      | string
      | undefined;
    await this.authService.platformLogout(fromCookie ?? dto.refreshToken);
    res.clearCookie(PLATFORM_REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get the current platform admin profile' })
  @ApiOkResponse({ description: 'Platform admin profile' })
  me(@CurrentUser() user: AuthenticatedUser) {
    if (!user.isPlatformAdmin || !user.platformAdminId) {
      throw new UnauthorizedException('Platform admin required');
    }
    return {
      id: user.platformAdminId,
      email: user.email,
    };
  }

  private setRefreshCookie(
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
      path: COOKIE_PATH,
    });
  }

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
