import { Module } from '@nestjs/common';
import { NoteTemplatesController } from './note-templates.controller';
import { NoteTemplatesService } from './note-templates.service';

@Module({
  controllers: [NoteTemplatesController],
  providers: [NoteTemplatesService],
})
export class NoteTemplatesModule {}
