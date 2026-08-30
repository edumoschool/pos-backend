import { Controller, Post, Body, Get, HttpCode, HttpStatus, Req, Param, Delete, ParseUUIDPipe, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SseService } from './sse.service';
import { LoginDto, RegisterDto } from './dto';
import { Public, CurrentUser } from './decorators';
import { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sseService: SseService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new owner with tenant' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone and password' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('userId') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session (blacklist JWT)' })
  logout(@CurrentUser('sessionId') sessionId: string) {
    return this.authService.logout(sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions for current user' })
  logoutAll(@CurrentUser('userId') userId: string) {
    return this.authService.logoutAll(userId);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all active sessions for current user' })
  getActiveSessions(
    @CurrentUser('userId') userId: string,
    @CurrentUser('sessionId') sessionId: string,
  ) {
    return this.authService.getActiveSessions(userId, sessionId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  revokeSession(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.authService.revokeSession(userId, sessionId);
  }

  @Sse('events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SSE stream for session/user status events (force logout)' })
  events(
    @CurrentUser('userId') userId: string,
    @CurrentUser('sessionId') sessionId: string,
  ): Observable<MessageEvent> {
    return this.sseService.subscribe(userId, sessionId);
  }
}
