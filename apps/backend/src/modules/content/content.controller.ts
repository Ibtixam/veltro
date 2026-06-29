import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  // ── Public ────────────────────────────────────────────────────────────
  @Get('faq')          faq(@Query('locale') l = 'en', @Query('category') c?: string) { return this.content.faq(l, c); }
  @Get('faq/jsonld')   faqJsonLd(@Query('locale') l = 'en') { return this.content.faqJsonLd(l); }
  @Get('testimonials') testimonials(@Query('locale') l = 'en', @Query('featured') f?: string) { return this.content.testimonials(l, f === 'true'); }

  // ── Admin ─────────────────────────────────────────────────────────────
  @Post('admin/faq')   @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  upsertFaq(@Body() b: any) { return this.content.upsertFaq(b); }
  @Delete('admin/faq/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  delFaq(@Param('id') id: string) { return this.content.deleteFaq(id); }

  @Post('admin/testimonials') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  upsertT(@Body() b: any) { return this.content.upsertTestimonial(b); }
  @Delete('admin/testimonials/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
  delT(@Param('id') id: string) { return this.content.deleteTestimonial(id); }
}
