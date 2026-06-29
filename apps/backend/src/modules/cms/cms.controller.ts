import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CmsService, CmsPageInput } from './cms.service';

@Controller('cms')
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  private uid(req: any): string { return req.user?.id ?? req.user?.sub; }

  // ── Public read by custom domain (the published site renderer) ────────
  @Get('site/:domain/:slug')
  getByDomain(@Param('domain') domain: string, @Param('slug') slug: string, @Query('locale') locale = 'fr') {
    return this.cms.getPublishedByDomain(domain, slug, locale);
  }

  // ── Public read (scoped by owner via path param) ──────────────────────
  @Get('page/:owner/:slug')
  getPage(@Param('owner') owner: string, @Param('slug') slug: string, @Query('locale') locale = 'fr') {
    return this.cms.getPublished(owner, slug, locale);
  }

  // ── Tenant authoring (owner = authenticated user) ─────────────────────
  @Get('pages')
  @UseGuards(JwtAuthGuard)
  list(@Req() req: any, @Query('locale') locale?: string) { return this.cms.list(this.uid(req), locale); }

  @Post('pages')
  @UseGuards(JwtAuthGuard)
  upsert(@Req() req: any, @Body() input: CmsPageInput) { return this.cms.upsert(this.uid(req), input); }

  @Post('pages/:slug/:locale/publish')
  @UseGuards(JwtAuthGuard)
  publish(@Req() req: any, @Param('slug') slug: string, @Param('locale') locale: string) {
    return this.cms.publish(this.uid(req), slug, locale);
  }

  @Delete('pages/:slug/:locale')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req: any, @Param('slug') slug: string, @Param('locale') locale: string) {
    return this.cms.remove(this.uid(req), slug, locale);
  }
}
