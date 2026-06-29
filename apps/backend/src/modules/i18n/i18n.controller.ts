import { Controller, Get, Query, BadRequestException, Res, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { I18nService } from './i18n.service';

// Tier 2 locales served dynamically (Tier 1 are embedded in the frontend)
const TIER2_LOCALES = new Set([
  'pt','es','de','ru','ja','ko','tr','vi','nl','it',
  'hi','ha','yo','ig','am','rw','mg',
]);

// Also accept Tier 1 requests in case the frontend needs a refresh
const ALL_LOCALES = new Set([
  ...TIER2_LOCALES,
  'en','fr','ar','zh','sw',
]);

@Controller('i18n')
export class I18nController {
  private readonly logger = new Logger(I18nController.name);

  constructor(private readonly i18nService: I18nService) {}

  @Get()
  async getTranslation(
    @Query('locale') locale: string,
    @Res() reply: FastifyReply,
  ) {
    if (!locale) {
      throw new BadRequestException('locale query param is required');
    }

    const normalized = locale.toLowerCase().trim();

    if (!ALL_LOCALES.has(normalized)) {
      throw new BadRequestException(
        `Unsupported locale: ${normalized}. Supported: ${[...ALL_LOCALES].join(', ')}`,
      );
    }

    try {
      const translations = await this.i18nService.getTranslation(normalized);

      // Cache headers: browser and CDN can cache for 7 days
      // stale-while-revalidate: serve stale for 1 day while re-fetching
      reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400')
        .header('Vary', 'Accept-Encoding')
        .send(translations);
    } catch (e: any) {
      this.logger.error(`i18n error for ${normalized}: ${e.message}`);
      // Return English as fallback rather than 500
      reply
        .status(200)
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Cache-Control', 'no-cache')
        .send({ _fallback: true, _locale: normalized });
    }
  }

  /**
   * POST /api/i18n/invalidate?locale=xx&secret=...
   * Allows cache bust after prompt improvements
   */
  @Get('invalidate')
  async invalidate(
    @Query('locale') locale: string,
    @Query('secret') secret: string,
    @Res() reply: FastifyReply,
  ) {
    if (secret !== process.env.I18N_INVALIDATE_SECRET) {
      reply.status(403).send({ error: 'Forbidden' });
      return;
    }
    if (!locale || !ALL_LOCALES.has(locale)) {
      throw new BadRequestException('Invalid locale');
    }
    await this.i18nService.invalidate(locale);
    reply.send({ ok: true, invalidated: locale });
  }
}
