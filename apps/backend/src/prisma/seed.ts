/**
 * VELTRO — Database Seed  (Jiogue LLC · Bible V2)
 * Run: npm run db:seed
 * Idempotent — safe to run multiple times.
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

// Lightweight hash for the seed admin (replace with bcrypt in app auth flow).
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

async function main() {
  // ── 1. Admin user ───────────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@veltro.io';
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      name: 'Veltro Admin',
      role: 'ADMIN',
      passwordHash: hash(process.env.SEED_ADMIN_PASSWORD ?? 'change-me-now'),
      onboardDone: true,
    },
  });
  console.log(`✓ admin user: ${adminEmail}`);

  // ── 2. FAQ / Q&A (EN + FR) ──────────────────────────────────────────
  const faqs = [
    { category: 'general', q_en: 'What is Veltro?', a_en: 'Veltro is an AI-powered SEO and GEO growth engine. It turns any URL or keyword into an executable content and conversion strategy — including AI-generated videos — and tells you what to do each week to generate the most revenue from search.',
      q_fr: "Qu'est-ce que Veltro ?", a_fr: "Veltro est un moteur de croissance SEO et GEO propulsé par l'IA. Il transforme n'importe quelle URL ou mot-clé en stratégie de contenu exécutable — vidéos comprises — et vous indique chaque semaine l'action la plus rentable." },
    { category: 'general', q_en: 'How is Veltro different from Ahrefs or SEMrush?', a_en: 'Those tools score individual keywords and leave the work to you. Veltro groups keywords into clusters, scores each cluster, generates the content brief and the video, and delivers a ready-to-deploy package. It is a doing tool, not a reporting tool.',
      q_fr: 'En quoi Veltro diffère-t-il d\'Ahrefs ou SEMrush ?', a_fr: "Ces outils notent des mots-clés isolés et vous laissent le travail. Veltro regroupe les mots-clés en clusters, les score, génère le brief de contenu et la vidéo, et livre un package prêt à déployer. C'est un outil d'action, pas de reporting." },
    { category: 'geo', q_en: 'What is GEO and why does it matter?', a_en: 'GEO (Generative Engine Optimization) is about getting your pages cited by AI answer engines like ChatGPT, Claude, Perplexity and Gemini. Veltro detects AI traffic, scores your citation readiness, and generates answer-first content designed to be quoted.',
      q_fr: 'Qu\'est-ce que le GEO et pourquoi est-ce important ?', a_fr: "Le GEO (Generative Engine Optimization) vise à faire citer vos pages par les moteurs de réponse IA comme ChatGPT, Claude, Perplexity et Gemini. Veltro détecte le trafic IA, évalue votre potentiel de citation et génère un contenu pensé pour être cité." },
    { category: 'payments', q_en: 'Which payment methods are supported?', a_en: 'Through PayBridge you can pay with MTN MoMo, Orange Money, Wave, or card — choose your method at checkout. For EU/CA/US, card payments are also available. Pricing auto-adjusts to your local currency.',
      q_fr: 'Quels moyens de paiement sont acceptés ?', a_fr: 'Via PayBridge, vous payez par MTN MoMo, Orange Money, Wave ou carte — au choix au moment du paiement. Pour l\'UE/CA/US, la carte est également disponible. Les tarifs s\'adaptent à votre devise locale.' },
    { category: 'video', q_en: 'How are the videos made?', a_en: 'Veltro writes the script with Claude, narrates it with ElevenLabs, pulls free stock footage from Pexels and Pixabay, and renders the final MP4 with Remotion — in landscape, portrait and square. No camera, no editing software, no per-render fees.',
      q_fr: 'Comment les vidéos sont-elles créées ?', a_fr: "Veltro écrit le script avec Claude, le narre avec ElevenLabs, récupère des séquences libres de droits sur Pexels et Pixabay, et assemble le MP4 final avec Remotion — en format paysage, portrait et carré. Sans caméra, sans logiciel de montage, sans frais par rendu." },
    { category: 'languages', q_en: 'Which languages does Veltro support?', a_en: 'Veltro works in 22 languages, including English, French, Arabic (right-to-left), Chinese, Swahili, Hausa, Yoruba, Igbo, Amharic, Kinyarwanda and Malagasy — built for multilingual and African markets.',
      q_fr: 'Quelles langues Veltro prend-il en charge ?', a_fr: 'Veltro fonctionne en 22 langues, dont le français, l\'anglais, l\'arabe (de droite à gauche), le chinois, le swahili, le haoussa, le yoruba, l\'igbo, l\'amharique, le kinyarwanda et le malgache — pensé pour les marchés multilingues et africains.' },
    { category: 'general', q_en: 'How long until I see results?', a_en: 'For low-competition clusters and geo-targeted programmatic pages, first organic results typically appear within 30 days. A 500-page programmatic site for a francophone African market can dominate in about 60 days.',
      q_fr: 'En combien de temps vois-je des résultats ?', a_fr: 'Pour les clusters peu concurrentiels et les pages programmatiques géo-ciblées, les premiers résultats organiques apparaissent généralement sous 30 jours. Un site programmatique de 500 pages pour un marché francophone africain peut dominer en environ 60 jours.' },
  ];

  let order = 0;
  for (const f of faqs) {
    for (const loc of ['en', 'fr'] as const) {
      const question = loc === 'en' ? f.q_en : f.q_fr;
      const answer = loc === 'en' ? f.a_en : f.a_fr;
      const existing = await prisma.faqItem.findFirst({ where: { locale: loc, question } });
      if (existing) {
        await prisma.faqItem.update({ where: { id: existing.id }, data: { answer, category: f.category, order } });
      } else {
        await prisma.faqItem.create({ data: { locale: loc, category: f.category, question, answer, order, published: true } });
      }
    }
    order++;
  }
  console.log(`✓ ${faqs.length} FAQ items (EN + FR)`);

  // ── 3. Testimonials (EN + FR) ───────────────────────────────────────
  const testimonials = [
    { name: 'Aïcha Traoré', role: 'Founder', company: 'Wave-adjacent fintech', country: 'SN', rating: 5, featured: true,
      en: 'We went from zero organic leads to 40 qualified prospects a month in eight weeks. The geo-targeted clusters were the unlock.',
      fr: 'Nous sommes passés de zéro lead organique à 40 prospects qualifiés par mois en huit semaines. Les clusters géo-ciblés ont tout changé.' },
    { name: 'Daniel Okafor', role: 'Head of Growth', company: 'B2B SaaS', country: 'NG', rating: 5, featured: true,
      en: 'The weekly report is the only dashboard my team actually acts on. Every number comes with a decision attached.',
      fr: 'Le rapport hebdomadaire est le seul tableau de bord sur lequel mon équipe agit réellement. Chaque chiffre vient avec une décision.' },
    { name: 'Camille Dubois', role: 'Marketing Director', company: 'E-commerce', country: 'FR', rating: 5, featured: true,
      en: 'One cluster, one video, every week. The Remotion videos look professional and cost us nothing per render.',
      fr: 'Un cluster, une vidéo, chaque semaine. Les vidéos Remotion sont professionnelles et ne nous coûtent rien par rendu.' },
    { name: 'Jean-Marc Fotso', role: 'CEO', company: 'Agency, Douala', country: 'CM', rating: 5, featured: false,
      en: 'PayBridge meant our Cameroonian clients could finally pay with MoMo. That alone doubled our conversion.',
      fr: 'PayBridge a permis à nos clients camerounais de payer enfin avec MoMo. Cela a doublé notre conversion à lui seul.' },
    { name: 'Sarah Chen', role: 'Solo founder', company: 'Indie SaaS', country: 'CA', rating: 5, featured: false,
      en: 'I deploy the fix ZIP in about 30 minutes a week. Veltro does the thinking; I do the shipping.',
      fr: "Je déploie le pack ZIP en environ 30 minutes par semaine. Veltro réfléchit, moi j'expédie." },
  ];

  let tOrder = 0;
  for (const t of testimonials) {
    for (const loc of ['en', 'fr'] as const) {
      const quote = loc === 'en' ? t.en : t.fr;
      const existing = await prisma.testimonial.findFirst({ where: { locale: loc, name: t.name } });
      const data = { locale: loc, name: t.name, role: t.role, company: t.company, country: t.country, quote, rating: t.rating, featured: t.featured, published: true, order: tOrder };
      if (existing) await prisma.testimonial.update({ where: { id: existing.id }, data });
      else await prisma.testimonial.create({ data });
    }
    tOrder++;
  }
  console.log(`✓ ${testimonials.length} testimonials (EN + FR)`);

  // ── 4. CMS sample page ──────────────────────────────────────────────
  for (const loc of ['en', 'fr'] as const) {
    const slug = 'about';
    const existing = await prisma.cmsPage.findFirst({ where: { ownerId: admin.id, slug, locale: loc } });
    const data = {
      ownerId: admin.id, slug, locale: loc, status: 'PUBLISHED' as const, publishedAt: new Date(),
      title: loc === 'en' ? 'About Veltro' : 'À propos de Veltro',
      body: loc === 'en'
        ? '## Built for revenue\nVeltro answers one question every week: what should you do today to generate the most revenue from search?'
        : '## Conçu pour le revenu\nVeltro répond à une question chaque semaine : quelle action mener aujourd\'hui pour générer le plus de revenus grâce à la recherche ?',
      seoTitle: loc === 'en' ? 'About Veltro — Revenue Discovery Engine' : 'À propos de Veltro — Moteur de revenus',
      seoDescription: loc === 'en' ? 'Veltro turns search into revenue with working code, not reports.' : 'Veltro transforme la recherche en revenus avec des pages prêtes à publier.',
    };
    if (existing) await prisma.cmsPage.update({ where: { id: existing.id }, data });
    else await prisma.cmsPage.create({ data });
  }
  console.log('✓ CMS sample page (about)');
}

main()
  .then(() => console.log('\n✅ Seed complete'))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
