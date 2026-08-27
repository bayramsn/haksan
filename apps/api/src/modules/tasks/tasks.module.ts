import { Module } from '@nestjs/common';
import { TaskRemindersService } from './task-reminders.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskRemindersService],
  exports: [TasksService],
})
export class TasksModule {}
