import { Controller, Post, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto, RegisterTokenDto } from './dto';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Post('register-token')
  @ApiOperation({ summary: 'Register Expo push token for current user' })
  registerToken(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterTokenDto,
  ) {
    return this.service.registerToken(userId, dto.token);
  }

  @Delete('remove-token')
  @ApiOperation({ summary: 'Remove Expo push token for current user' })
  removeToken(@CurrentUser('userId') userId: string) {
    return this.service.removeToken(userId);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send push notification to specific tokens' })
  send(@Body() dto: SendNotificationDto) {
    return this.service.send(dto);
  }

  @Post('send/user/:userId')
  @ApiOperation({ summary: 'Send push notification to a specific user' })
  sendToUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SendNotificationDto,
  ) {
    return this.service.sendToUser(userId, dto);
  }

  @Post('send/tenant')
  @ApiOperation({ summary: 'Send push notification to all users in tenant' })
  sendToTenant(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: SendNotificationDto,
  ) {
    return this.service.sendToTenant(tenantId, dto);
  }

  @Post('receipts')
  @ApiOperation({ summary: 'Get push notification receipts by ticket IDs' })
  getReceipts(@Body('ticketIds') ticketIds: string[]) {
    return this.service.getReceipts(ticketIds);
  }
}
