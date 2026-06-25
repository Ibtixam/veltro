import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CmsPageInput {
  slug: string;
  locale: string;
  title: string;
  body: string;          // markdown or HTML
  status?: 'DRAFT' | 'PUBLISHED';
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * CMS — per-tenant editorial content. Every operation is scoped by ownerId
 * so customers can never read or write each other's pages.
 */
@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a custom domain → owner (tenant). Used by the public site renderer. */
  async getPublishedByDomain(domain: string, slug: string, locale: string) {
    const host = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const site = await this.prisma.site.findFirst({
      where: { domain: { contains: host } },
      orderBy: { createdAt: 'asc' },
    });
    if (!site) throw new NotFoundException(`No site registered for domain "${host}"`);
    return this.getPublished(site.userId, slug, locale);
  }

  /** Public: fetch a published page for a given owner by slug + locale (fr → en fallback). */
  async getPublished(ownerId: string, slug: string, locale: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { ownerId, slug, locale, status: 'PUBLISHED' },
    }) ?? await this.prisma.cmsPage.findFirst({ where: { ownerId, slug, locale: 'fr', status: 'PUBLISHED' } })
      ?? await this.prisma.cmsPage.findFirst({ where: { ownerId, slug, locale: 'en', status: 'PUBLISHED' } });
    if (!page) throw new NotFoundException(`No published page for "${slug}"`);
    return page;
  }

  /** Admin/owner: list this tenant's pages (any status). */
  list(ownerId: string, locale?: string) {
    return this.prisma.cmsPage.findMany({
      where: { ownerId, ...(locale ? { locale } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  }

  upsert(ownerId: string, input: CmsPageInput) {
    return this.prisma.cmsPage.upsert({
      where: { ownerId_slug_locale: { ownerId, slug: input.slug, locale: input.locale } },
      create: { ...input, ownerId, status: input.status ?? 'DRAFT' },
      update: { ...input },
    });
  }

  publish(ownerId: string, slug: string, locale: string) {
    return this.prisma.cmsPage.update({
      where: { ownerId_slug_locale: { ownerId, slug, locale } },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  remove(ownerId: string, slug: string, locale: string) {
    return this.prisma.cmsPage.delete({ where: { ownerId_slug_locale: { ownerId, slug, locale } } });
  }
}
