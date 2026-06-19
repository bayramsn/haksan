import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  createDmSchema,
  createGroupSchema,
  updateGroupSchema,
  addMembersSchema,
  setMemberRoleSchema,
  sendMessageSchema,
  messagesQuerySchema,
  editMessageSchema,
  reactionSchema,
  type CreateDmInput,
  type CreateGroupInput,
  type UpdateGroupInput,
  type AddMembersInput,
  type SetMemberRoleInput,
  type SendMessageInput,
  type MessagesQuery,
  type EditMessageInput,
  type ReactionInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError } from '../../shared/utils/errors';
import { ChatService } from './chat.service';

/**
 * Kurum içi sohbet. Erişim tüm kimliği doğrulanmış çalışanlara açık (izin matrisi
 * kullanılmaz). Grup kurma yalnız süper admin; grup yönetimi süper admin veya grup
 * admini; grupta yazma `onlyAdminsCanPost`'a göre — bunlar serviste denetlenir.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  private requireSuperAdmin(user: AuthContext) {
    if (!user.roles.includes('super_admin')) {
      throw new ForbiddenError('Grup yalnızca Süper Admin tarafından kurulabilir');
    }
  }

  @Get('directory')
  directory(@CurrentUser() user: AuthContext) {
    return this.chat.directory(user);
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthContext) {
    return this.chat.listConversations(user);
  }

  @Post('conversations/dm')
  createDm(@Body(new ZodValidationPipe(createDmSchema)) body: CreateDmInput, @CurrentUser() user: AuthContext) {
    return this.chat.getOrCreateDm(user, body.userId);
  }

  @Post('conversations/group')
  createGroup(@Body(new ZodValidationPipe(createGroupSchema)) body: CreateGroupInput, @CurrentUser() user: AuthContext) {
    this.requireSuperAdmin(user);
    return this.chat.createGroup(user, body);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.chat.getConversation(user, id);
  }

  @Patch('conversations/:id')
  updateGroup(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateGroupSchema)) body: UpdateGroupInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.updateGroup(user, id, body);
  }

  @Post('conversations/:id/members')
  addMembers(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMembersSchema)) body: AddMembersInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.addMembers(user, id, body.userIds);
  }

  @Delete('conversations/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: AuthContext) {
    return this.chat.removeMember(user, id, userId);
  }

  @Patch('conversations/:id/members/:userId/role')
  setMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(setMemberRoleSchema)) body: SetMemberRoleInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.setMemberRole(user, id, userId, body.role);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: MessagesQuery,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.listMessages(user, id, query);
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.sendMessage(user, id, body);
  }

  @Post('conversations/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.chat.markRead(user, id);
  }

  @Patch('messages/:id')
  editMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(editMessageSchema)) body: EditMessageInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.editMessage(user, id, body.body);
  }

  @Post('messages/:id/reactions')
  toggleReaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reactionSchema)) body: ReactionInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.chat.toggleReaction(user, id, body.emoji);
  }

  @Delete('messages/:id')
  deleteMessage(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.chat.deleteMessage(user, id);
  }
}
