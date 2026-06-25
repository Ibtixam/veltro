import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ── FAQ / Q&A (public, locale-aware, GEO-structured) ──────────────────
  async faq(locale = 'en', category?: string) {
    let items = await this.prisma.faqItem.findMany({
      where: { locale, published: true, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
    if (!items.length && locale !== 'en') {
      items = await this.prisma.faqItem.findMany({ where: { locale: 'en', published: true }, orderBy: [{ category: 'asc' }, { order: 'asc' }] });
    }
    return items;
  }

  /** FAQPage JSON-LD for GEO/SEO — boosts AI citation. */
  async faqJsonLd(locale = 'en') {
    const items = await this.faq(locale);
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map((i: { question: string; answer: string }) => ({
        '@type': 'Question', name: i.question,
        acceptedAnswer: { '@type': 'Answer', text: i.answer },
      })),
    };
  }

  upsertFaq(data: any) {
    return data.id
      ? this.prisma.faqItem.update({ where: { id: data.id }, data })
      : this.prisma.faqItem.create({ data });
  }
  deleteFaq(id: string) { return this.prisma.faqItem.delete({ where: { id } }); }

  // ── Testimonials (public, locale-aware) ───────────────────────────────
  async testimonials(locale = 'en', featuredOnly = false) {
    let items = await this.prisma.testimonial.findMany({
      where: { locale, published: true, ...(featuredOnly ? { featured: true } : {}) },
      orderBy: [{ featured: 'desc' }, { order: 'asc' }],
    });
    if (!items.length && locale !== 'en') {
      items = await this.prisma.testimonial.findMany({ where: { locale: 'en', published: true }, orderBy: [{ featured: 'desc' }, { order: 'asc' }] });
    }
    return items;
  }

  upsertTestimonial(data: any) {
    return data.id
      ? this.prisma.testimonial.update({ where: { id: data.id }, data })
      : this.prisma.testimonial.create({ data });
  }
  deleteTestimonial(id: string) { return this.prisma.testimonial.delete({ where: { id } }); }
}
