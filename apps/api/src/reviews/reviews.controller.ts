import { Controller, Post, Get, Body, Param, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Customer: submit a review after job completion' })
  create(@Request() req, @Body() body: any) {
    return this.service.create(req.user.id, body);
  }

  @Get('vendor/:vendorId')
  @ApiOperation({ summary: 'Get reviews for a vendor' })
  getForVendor(@Param('vendorId') vendorId: string) {
    return this.service.getForVendor(vendorId);
  }

  @Get('my/:serviceRequestId')
  @ApiOperation({ summary: 'Customer: check if they already reviewed a job' })
  getMyReview(@Request() req, @Param('serviceRequestId') id: string) {
    return this.service.getMyReview(req.user.id, id);
  }
}
