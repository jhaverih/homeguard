import { Body, Controller, Get, NotFoundException, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/role.enum';
import { AdminLevelGuard } from '../common/guards/admin-level.guard';
import { CompleteTrainingDto, TrainingService } from './training.service';
import { TRAINING_ASSETS_DIR } from './training-content';

// Any signed-in vendor user, approved or still onboarding, so a new
// technician can finish training while their company is reviewed.
@ApiTags('Vendor Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
@Controller('vendor/training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  @ApiOperation({ summary: 'My training modules, status and deadline' })
  mine(@Request() req) {
    return this.training.getSummary(req.user.id);
  }

  @Get('team')
  @ApiOperation({ summary: 'Company admin: each team member\'s training progress' })
  team(@Request() req) {
    return this.training.getTeam(req.user.id);
  }

  @Get(':key')
  @ApiOperation({ summary: 'One training module: screens, pictures, narration and questions' })
  module(@Request() req, @Param('key') key: string) {
    return this.training.getModule(req.user.id, key);
  }

  @Post(':key/complete')
  @ApiOperation({ summary: 'Confirm I completed a training module' })
  complete(@Request() req, @Param('key') key: string, @Body() body: CompleteTrainingDto) {
    return this.training.complete(req.user.id, key, body);
  }
}

// Training pictures and narration. Public, like the legal pages: they hold
// nothing private, and the app's audio player can stream them without a token.
@ApiTags('Vendor Training')
@Controller('training/assets')
export class TrainingAssetsController {
  @Get(':key/:file')
  asset(@Param('key') key: string, @Param('file') file: string, @Res() res: Response) {
    if (!/^[a-z0-9-]+$/.test(key) || !/^\d{1,3}\.(webp|mp3)$/.test(file)) throw new NotFoundException();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(`${key}/${file}`, { root: TRAINING_ASSETS_DIR }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Not Found' });
    });
  }
}

// Admin portal: the training record for a vendor user's whole company.
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminLevelGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/vendors')
export class AdminTrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get(':id/training')
  @ApiOperation({ summary: "Training progress and completion records for a vendor's company" })
  forVendor(@Param('id') id: string) {
    return this.training.adminTrainingForUser(id);
  }
}
