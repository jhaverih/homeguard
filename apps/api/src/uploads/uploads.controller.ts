import {
  Controller, Post, UseInterceptors, UploadedFile, UseGuards, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Query('folder') folder = 'general') {
    const key = await this.service.upload(file, folder);
    const url = await this.service.getSignedUrl(key);
    return { key, url };
  }
}
