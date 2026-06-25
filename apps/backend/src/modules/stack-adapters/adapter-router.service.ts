import { Injectable, Logger } from '@nestjs/common';
import { StackDetectorService, DetectedStack, StackSignal } from '../stack-detector/stack-detector.service';
import { BaseAdapter, PageInput, AdapterOutput, GeneratedFile } from './adapter.interface';

// ─── ADAPTER ROUTER ───────────────────────────────────────────────────────
//
// This is the single entry point for all code generation.
// Call: router.generate(domain, pageInput)
// It detects the stack, picks the right adapter, returns correct files.
//
// Every customer gets a package they can actually use — regardless of stack.

@Injectable()
export class AdapterRouterService {
  private readonly logger = new Logger(AdapterRouterService.name);

  constructor(private readonly detector: StackDetectorService) {}

  async generate(domain: string, inputs: PageInput[]): Promise<{
    signal:  StackSignal;
    output:  AdapterOutput;
    summary: string;
  }> {
    // 1. Detect stack
    const signal = await this.detector.detect(domain);
    this.logger.log(`Stack detected for ${domain}: ${signal.stack} (${signal.confidence}% confidence)`);

    // 2. Pick adapter
    const adapter = this.getAdapter(signal);
    this.logger.log(`Using adapter: ${adapter.stackName}`);

    // 3. Generate all files
    const files: GeneratedFile[] = [];
    for (const input of inputs) {
      files.push(adapter.generatePage(input));
    }
    files.push(adapter.generateSchemaHelper(domain));
    files.push(adapter.generateSitemapEntry(domain, inputs.map(i => i.slug)));

    // 4. Build output
    const output: AdapterOutput = {
      files,
      installSteps:     adapter.getInstallSteps(domain, files),
      notes:            this.getAdapterNotes(signal),
      canAutoDeploy:    adapter.canAutoDeploy,
      autoDeployMethod: adapter.autoDeployMethod,
    };

    return {
      signal,
      output,
      summary: `${signal.stack} detected (${signal.confidence}% confidence) — ${files.length} files generated for ${adapter.stackName}`,
    };
  }

  getAdapter(signal: StackSignal): BaseAdapter {
    switch (signal.stack) {
      case 'nextjs':     return new NextjsAdapterImpl(signal);
      case 'wordpress':  return new WordPressAdapterImpl(signal);
      case 'webflow':    return new WebflowAdapterImpl(signal);
      case 'nuxt':       return new NuxtAdapterImpl(signal);
      case 'astro':      return new AstroAdapterImpl(signal);
      case 'shopify':    return new ShopifyAdapterImpl(signal);
      case 'wix':        return new WixAdapterImpl(signal);
      case 'squarespace':return new SquarespaceAdapterImpl(signal);
      case 'gatsby':     return new GatsbyAdapterImpl(signal);
      default:           return new HTMLAdapterImpl(signal);
    }
  }

  private getAdapterNotes(signal: StackSignal): string[] {
    const notes: string[] = [`Stack detected: ${signal.stack} (${signal.confidence}% confidence)`];
    if (signal.confidence < 70)  notes.push('Low confidence detection — verify stack before deploying');
    if (signal.extras?.wpPlugins?.length) notes.push(`WordPress plugins detected: ${signal.extras.wpPlugins.join(', ')}`);
    if (signal.extras?.isHeadless) notes.push('Headless WordPress detected — use Next.js adapter files, not PHP templates');
    if (signal.extras?.cdnProvider) notes.push(`CDN: ${signal.extras.cdnProvider}`);
    return notes;
  }
}

// ─── CONCRETE ADAPTER IMPLEMENTATIONS ────────────────────────────────────

class NextjsAdapterImpl extends BaseAdapter {
  readonly stackName: string = 'Next.js'; readonly fileExt = 'tsx';
  readonly canAutoDeploy = true;  readonly autoDeployMethod = 'github_pr' as const;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    const isApp = this.signal.extras?.hasAppRouter ?? true;
    const path  = isApp ? `src/app${input.slug}/page.tsx` : `pages${input.slug}.tsx`;

    const content = isApp ? `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${input.title} | ${this.domainName(input.domain)}',
  description: 'Discover ${input.keyword} instantly. Verified contacts with email, phone and WhatsApp. Free trial.',
  keywords: ${JSON.stringify([input.keyword, ...input.satellites.slice(0,4)])},
  alternates: { canonical: 'https://${input.domain}${input.slug}' },
};

const FAQ = ${JSON.stringify(input.faq, null, 2)};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context":"https://schema.org","@type":"FAQPage",
        "mainEntity": FAQ.map(f => ({"@type":"Question","name":f.q,"acceptedAnswer":{"@type":"Answer","text":f.a}}))
      })}} />
      <main>
        <h1>${input.title}</h1>
        <p>${input.content.slice(0, 300)}</p>
        ${input.images.length ? `<img src="${input.images[0].url}" alt="${input.images[0].alt}" width="1200" height="630" />` : ''}
        <section>
          <h2>Frequently Asked Questions</h2>
          {FAQ.map((f,i) => <div key={i}><h3>{f.q}</h3><p>{f.a}</p></div>)}
        </section>
      </main>
    </>
  );
}` : `import Head from 'next/head';
const FAQ = ${JSON.stringify(input.faq, null, 2)};
export default function Page() {
  return (<><Head>
    <title>${input.title} | ${this.domainName(input.domain)}</title>
    <meta name="description" content="Discover ${input.keyword} instantly." />
    <link rel="canonical" href="https://${input.domain}${input.slug}" />
  </Head><main>
    <h1>${input.title}</h1>
    {FAQ.map((f,i)=><div key={i}><h3>{f.q}</h3><p>{f.a}</p></div>)}
  </main></>);}`;

    return { path, content, description: `Next.js ${isApp?'App':'Pages'} Router page for "${input.keyword}"` };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'src/components/seo/VeltroSchema.tsx',
      content: `export function SoftwareAppSchema() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({
    "@context":"https://schema.org","@type":"SoftwareApplication",
    "name":"${this.domainName(domain)}","applicationCategory":"BusinessApplication",
    "operatingSystem":"Web","url":"https://${domain}",
    "description":"Real-time B2B lead intelligence platform.",
    "offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},
    "inLanguage":["en","fr"]
  })}}/>;
}`,
      description: 'Add <SoftwareAppSchema /> to layout.tsx inside <head>',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    const entries = slugs.map(s=>`  <url><loc>https://${domain}${s}</loc><priority>0.8</priority></url>`).join('\n');
    return { path: 'public/sitemap-veltro.xml', content: `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`, description: 'Merge into public/sitemap.xml' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Copy all .tsx files into your src/app (App Router) or pages (Pages Router) directory',
      'Copy VeltroSchema.tsx into src/components/seo/',
      'Add <SoftwareAppSchema /> to your root layout.tsx inside <head>',
      'Merge sitemap-veltro.xml entries into public/sitemap.xml',
      'Run: git add . && git commit -m "feat: Veltro SEO pages" && git push',
      `Submit new URLs to Google Search Console after deploy`,
    ];
  }
}

class WordPressAdapterImpl extends BaseAdapter {
  readonly stackName = 'WordPress'; readonly fileExt = 'php';
  readonly canAutoDeploy = true;    readonly autoDeployMethod = 'cms_api' as const;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    const wpSlug = this.slug(input.keyword);
    const hasYoast = this.signal.extras?.wpPlugins?.includes('Yoast SEO');

    return {
      path: `wordpress/page-${wpSlug}.php`,
      content: `<?php
/**
 * Veltro SEO: ${input.title}
 * Upload to: wp-content/themes/YOUR-THEME/page-${wpSlug}.php
 * Then create a Page with slug "${wpSlug}" and select this template.
 */
get_header();
$faq = ${JSON.stringify(input.faq)};
$schema = json_encode(['@context'=>'https://schema.org','@type'=>'FAQPage',
  'mainEntity'=>array_map(fn($f)=>['@type'=>'Question','name'=>$f['q'],
    'acceptedAnswer'=>['@type'=>'Answer','text'=>$f['a']]],$faq)
], JSON_UNESCAPED_UNICODE);
?>
<script type="application/ld+json"><?php echo $schema; ?></script>
<main>
  <h1><?php the_title(); ?></h1>
  <p><?php echo esc_html('${input.content.slice(0,200).replace(/'/g,"\\'")}...'); ?></p>
  <section class="faq">
    <h2><?php echo esc_html('${input.lang==='fr'?'Questions fréquentes':'Frequently Asked Questions'}'); ?></h2>
    <?php foreach ($faq as $item): ?>
      <div><h3><?php echo esc_html($item['q']); ?></h3><p><?php echo esc_html($item['a']); ?></p></div>
    <?php endforeach; ?>
  </section>
</main>
<?php get_footer(); ?>
`,
      description: `WordPress page template for "${input.keyword}"${hasYoast?' (Yoast SEO meta pre-configured)':''}`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'wordpress/functions-veltro.php',
      content: `<?php
// Add to functions.php — injects SoftwareApplication schema sitewide
function veltro_schema() {
  echo '<script type="application/ld+json">'.json_encode([
    '@context'=>'https://schema.org','@type'=>'SoftwareApplication',
    'name'=>'${this.domainName(domain)}','applicationCategory'=>'BusinessApplication',
    'operatingSystem'=>'Web','url'=>'https://${domain}',
    'offers'=>['@type'=>'Offer','price'=>'0','priceCurrency'=>'USD'],
    'inLanguage'=>['en','fr']
  ],JSON_UNESCAPED_UNICODE).'</script>';
}
add_action('wp_head','veltro_schema');`,
      description: 'Paste into functions.php — adds SoftwareApplication schema sitewide',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return {
      path: 'wordpress/new-urls.txt',
      content: `# Veltro — New URLs (auto-indexed by Yoast/Rank Math after pages are published)\n${slugs.map(s=>`https://${domain}${s}`).join('\n')}`,
      description: 'Verify these appear in your WordPress sitemap after publishing',
    };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    const steps = [
      'Upload page-*.php files to: wp-content/themes/YOUR-THEME/',
      'Go to Pages → Add New for each page. Set the slug and select its template.',
      'Copy functions-veltro.php content into your theme\'s functions.php',
      'Verify pages appear in Yoast / Rank Math sitemap after publishing',
    ];
    if (this.signal.extras?.wpPlugins?.includes('Elementor')) {
      steps.push('Elementor detected — paste page content into an HTML widget instead of using the PHP template if preferred');
    }
    return steps;
  }
}

class WebflowAdapterImpl extends BaseAdapter {
  readonly stackName = 'Webflow'; readonly fileExt = 'json';
  readonly canAutoDeploy = true;  readonly autoDeployMethod = 'cms_api' as const;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `webflow/cms-item-${this.slug(input.keyword)}.json`,
      content: JSON.stringify({
        _instructions: 'POST this JSON to: POST /api/v2/collections/{collectionId}/items via Webflow CMS API',
        isArchived: false, isDraft: false,
        fieldData: {
          name: input.title,
          slug: this.slug(input.keyword),
          'body-content': input.content,
          'meta-title': `${input.title} | ${this.domainName(input.domain)}`,
          'meta-description': `Discover ${input.keyword} instantly. Free trial.`,
          'faq-items': input.faq,
        },
      }, null, 2),
      description: `Webflow CMS item payload for "${input.keyword}" — POST via Webflow API or add manually`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'webflow/schema-embed-code.html',
      content: `<!-- Add this to your Webflow page's <head> embed code or site-wide head code -->
<script type="application/ld+json">
${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication','name':this.domainName(domain),'applicationCategory':'BusinessApplication','operatingSystem':'Web','url':`https://${domain}`,'offers':{'@type':'Offer','price':'0','priceCurrency':'USD'}},null,2)}
</script>`,
      description: 'Add to Webflow: Settings → Custom Code → Head Code (site-wide)',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'webflow/new-urls.txt', content: slugs.map(s=>`https://${domain}${s}`).join('\n'), description: 'Webflow auto-generates sitemap — verify URLs appear after publishing' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Option A (manual): In Webflow CMS, create a new collection item for each .json file. Copy the field values.',
      'Option B (API): POST each .json file to your Webflow collection via the CMS API (see INSTALL.md for curl command)',
      'Add schema-embed-code.html content to Settings → Custom Code → Head Code',
      'Publish your Webflow site after adding items',
      'Webflow generates sitemap automatically — verify new pages appear',
    ];
  }
}

class NuxtAdapterImpl extends BaseAdapter {
  readonly stackName = 'Nuxt.js'; readonly fileExt = 'vue';
  readonly canAutoDeploy = true;  readonly autoDeployMethod = 'github_pr' as const;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `pages${input.slug}.vue`,
      content: `<template>
  <div>
    <Head>
      <Title>${input.title} | ${this.domainName(input.domain)}</Title>
      <Meta name="description" :content="'Discover ${input.keyword} instantly. Free trial.'" />
      <Link rel="canonical" :href="'https://${input.domain}${input.slug}'" />
    </Head>
    <main>
      <h1>${input.title}</h1>
      <p>${input.content.slice(0,200)}</p>
      <section>
        <h2>${input.lang==='fr'?'Questions fréquentes':'Frequently Asked Questions'}</h2>
        <div v-for="(item, i) in faq" :key="i">
          <h3>{{ item.q }}</h3>
          <p>{{ item.a }}</p>
        </div>
      </section>
    </main>
  </div>
</template>
<script setup lang="ts">
const faq = ${JSON.stringify(input.faq, null, 2)};
useSchemaOrg([{ '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }]);
</script>`,
      description: `Nuxt 3 page for "${input.keyword}" with useSchemaOrg`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'plugins/veltro-schema.ts',
      content: `// Add to nuxt.config.ts: plugins: ['~/plugins/veltro-schema']
export default defineNuxtPlugin(() => {
  useSchemaOrg([{ '@type': 'SoftwareApplication', name: '${this.domainName(domain)}', applicationCategory: 'BusinessApplication', url: 'https://${domain}' }]);
});`,
      description: 'Register in nuxt.config.ts plugins array',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'public/sitemap-veltro.xml', content: `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${slugs.map(s=>`  <url><loc>https://${domain}${s}</loc></url>`).join('\n')}\n</urlset>`, description: 'Merge into public/sitemap.xml or configure @nuxtjs/sitemap' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Copy .vue files into your pages/ directory (Nuxt auto-routes them)',
      'Install @unhead/schema-org if not already: npm install @unhead/schema-org',
      'Register veltro-schema.ts in nuxt.config.ts plugins',
      'Run: git add . && git commit -m "feat: Veltro SEO pages" && git push',
    ];
  }
}

class AstroAdapterImpl extends BaseAdapter {
  readonly stackName = 'Astro'; readonly fileExt = 'astro';
  readonly canAutoDeploy = true; readonly autoDeployMethod = 'github_pr' as const;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `src/pages${input.slug}.astro`,
      content: `---
const title = "${input.title}";
const description = "Discover ${input.keyword} instantly. Free trial.";
const faq = ${JSON.stringify(input.faq)};
const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage",
  "mainEntity": faq.map(f => ({ "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } })) };
---
<html lang="${input.lang}">
<head>
  <meta charset="UTF-8" />
  <title>{title} | ${this.domainName(input.domain)}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href="https://${input.domain}${input.slug}" />
  <script type="application/ld+json" set:html={JSON.stringify(faqSchema)} />
</head>
<body>
  <main>
    <h1>{title}</h1>
    <p>${input.content.slice(0,200)}</p>
    <section>
      <h2>${input.lang==='fr'?'Questions fréquentes':'Frequently Asked Questions'}</h2>
      {faq.map(item => <div><h3>{item.q}</h3><p>{item.a}</p></div>)}
    </section>
  </main>
</body>
</html>`,
      description: `Astro page for "${input.keyword}"`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'src/components/VeltroSchema.astro',
      content: `---\nconst schema = {"@context":"https://schema.org","@type":"SoftwareApplication","name":"${this.domainName(domain)}","applicationCategory":"BusinessApplication","url":"https://${domain}","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}};\n---\n<script type="application/ld+json" set:html={JSON.stringify(schema)} />`,
      description: 'Add <VeltroSchema /> to your base layout',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'public/sitemap-veltro.xml', content: `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${slugs.map(s=>`  <url><loc>https://${domain}${s}</loc></url>`).join('\n')}\n</urlset>`, description: 'Merge into sitemap or use @astrojs/sitemap' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Copy .astro files into your src/pages/ directory',
      'Add <VeltroSchema /> to your base layout inside <head>',
      'Astro auto-routes pages — no config needed',
      'Run: git add . && git commit -m "feat: Veltro SEO pages" && git push',
    ];
  }
}

class HTMLAdapterImpl extends BaseAdapter {
  readonly stackName = 'HTML'; readonly fileExt = 'html';
  readonly canAutoDeploy = false; readonly autoDeployMethod = undefined;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `html${input.slug}/index.html`,
      content: `<!DOCTYPE html>
<html lang="${input.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${input.title} | ${this.domainName(input.domain)}</title>
  <meta name="description" content="Discover ${input.keyword} instantly. Free trial.">
  <link rel="canonical" href="https://${input.domain}${input.slug}">
  <script type="application/ld+json">${this.buildFAQSchemaJSON(input.faq)}</script>
</head>
<body>
  <main>
    <h1>${input.title}</h1>
    <p>${input.content.slice(0,300)}</p>
    <section>
      <h2>${input.lang==='fr'?'Questions fréquentes':'Frequently Asked Questions'}</h2>
      ${input.faq.map(f=>`<div><h3>${f.q}</h3><p>${f.a}</p></div>`).join('\n      ')}
    </section>
  </main>
</body>
</html>`,
      description: `Plain HTML page for "${input.keyword}" — upload to your server`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'html/schema-snippet.html',
      content: `<!-- Paste into every page's <head> -->\n<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication','name':this.domainName(domain),'applicationCategory':'BusinessApplication','url':`https://${domain}`,'offers':{'@type':'Offer','price':'0','priceCurrency':'USD'}})}</script>`,
      description: 'Copy into every page <head>',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'html/sitemap.xml', content: `<?xml version="1.0"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${slugs.map(s=>`  <url><loc>https://${domain}${s}</loc></url>`).join('\n')}\n</urlset>`, description: 'Upload to your server root, submit to Google Search Console' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Upload each html/ folder to your web server (FTP, cPanel, or file manager)',
      'Paste schema-snippet.html content into every page\'s <head> tag',
      'Upload sitemap.xml to your server root: https://${domain}/sitemap.xml',
      'Submit sitemap URL to Google Search Console',
    ];
  }
}

class ShopifyAdapterImpl extends BaseAdapter {
  readonly stackName = 'Shopify'; readonly fileExt = 'liquid';
  readonly canAutoDeploy = false; readonly autoDeployMethod = undefined;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `shopify/templates/page.${this.slug(input.keyword)}.liquid`,
      content: `{% assign faq = '${JSON.stringify(input.faq).replace(/'/g,"\\'")}' | parse_json %}
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{% for item in faq %}{"@type":"Question","name":{{ item.q | json }},"acceptedAnswer":{"@type":"Answer","text":{{ item.a | json }}}}{% unless forloop.last %},{% endunless %}{% endfor %}]}</script>
<main>
  <h1>${input.title}</h1>
  <p>${input.content.slice(0,200)}</p>
  {% for item in faq %}
  <div><h3>{{ item.q }}</h3><p>{{ item.a }}</p></div>
  {% endfor %}
</main>`,
      description: `Shopify Liquid template for "${input.keyword}" — upload via Shopify Admin > Themes > Edit Code`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return {
      path: 'shopify/snippets/veltro-schema.liquid',
      content: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"${this.domainName(domain)}","applicationCategory":"BusinessApplication","url":"https://${domain}"}</script>`,
      description: 'Add {% render \'veltro-schema\' %} to theme.liquid <head>',
    };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'shopify/pages-to-create.txt', content: `# Create these pages in Shopify Admin > Online Store > Pages\n# Set the template to the matching page.SLUG.liquid template\n${slugs.map(s=>`https://${domain}${s}`).join('\n')}`, description: 'Shopify auto-generates sitemap after pages are published' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Go to Shopify Admin → Online Store → Themes → Edit Code',
      'Upload each .liquid file to the templates/ directory',
      'Go to Online Store → Pages → Add Page for each new page',
      'Set the template to the matching "page.SLUG" template for each page',
      'Add {% render \'veltro-schema\' %} to theme.liquid inside <head>',
    ];
  }
}

// Wix and Squarespace: no file deployment possible — deliver instructions + manual HTML
class WixAdapterImpl extends BaseAdapter {
  readonly stackName = 'Wix'; readonly fileExt = 'txt';
  readonly canAutoDeploy = false; readonly autoDeployMethod = undefined;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `wix/page-content-${this.slug(input.keyword)}.txt`,
      content: `WIX PAGE INSTRUCTIONS — "${input.keyword}"
${'='.repeat(60)}

PAGE TITLE: ${input.title}
META DESCRIPTION: Discover ${input.keyword} instantly. Verified contacts with email, phone and WhatsApp. Free trial.
SLUG: ${this.slug(input.keyword)}

HOW TO CREATE THIS PAGE IN WIX:
1. Go to your Wix dashboard → Add Page
2. Set page name: "${input.title}"
3. Set SEO title and description above in SEO settings
4. Paste the content below into a Text element:

${input.content}

FAQ SECTION:
${input.faq.map((f,i)=>`Q${i+1}: ${f.q}\nA${i+1}: ${f.a}`).join('\n\n')}

SCHEMA (paste into Wix → Settings → Advanced SEO → Structured Data):
${this.buildFAQSchemaJSON(input.faq)}
`,
      description: `Wix page creation instructions for "${input.keyword}"`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return { path: 'wix/schema-instructions.txt', content: `Add to Wix: Settings → Advanced → Custom Meta Tags:\n<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication','name':this.domainName(domain),'url':`https://${domain}`})}</script>`, description: 'Wix custom meta tag instructions' };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'wix/urls-to-submit.txt', content: `# After creating pages in Wix, submit these URLs to Google Search Console:\n${slugs.map(s=>`https://${domain}${s}`).join('\n')}`, description: 'Submit to GSC after creating pages' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Wix does not support file deployment — follow the text instructions in each .txt file',
      'Create each page manually in Wix Editor',
      'Add schema markup via Settings → Advanced SEO → Structured Data',
      'Submit new page URLs to Google Search Console after publishing',
    ];
  }
}

class SquarespaceAdapterImpl extends BaseAdapter {
  readonly stackName = 'Squarespace'; readonly fileExt = 'txt';
  readonly canAutoDeploy = false; readonly autoDeployMethod = undefined;

  constructor(private signal: StackSignal) { super(); }

  generatePage(input: PageInput): GeneratedFile {
    return {
      path: `squarespace/page-${this.slug(input.keyword)}.txt`,
      content: `SQUARESPACE PAGE INSTRUCTIONS — "${input.keyword}"
${'='.repeat(60)}

PAGE TITLE: ${input.title}
SEO TITLE: ${input.title} | ${this.domainName(input.domain)}
SEO DESCRIPTION: Discover ${input.keyword} instantly. Free trial.

STEPS:
1. Squarespace → Pages → + (new page) → Blank
2. Title: "${input.title}"
3. Settings → SEO → fill title + description above
4. Add a Text block with the content below
5. Add a Code block with the JSON-LD schema below

PAGE CONTENT:
${input.content}

FAQ (add as Text blocks):
${input.faq.map(f=>`Q: ${f.q}\nA: ${f.a}`).join('\n\n')}

SCHEMA CODE BLOCK:
<script type="application/ld+json">
${this.buildFAQSchemaJSON(input.faq)}
</script>
`,
      description: `Squarespace page instructions for "${input.keyword}"`,
    };
  }

  generateSchemaHelper(domain: string): GeneratedFile {
    return { path: 'squarespace/site-schema.txt', content: `Add via Squarespace: Settings → Advanced → Code Injection → Header:\n<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'SoftwareApplication','name':this.domainName(domain),'url':`https://${domain}`})}</script>`, description: 'Site-wide schema via Code Injection' };
  }

  generateSitemapEntry(domain: string, slugs: string[]): GeneratedFile {
    return { path: 'squarespace/urls-to-submit.txt', content: slugs.map(s=>`https://${domain}${s}`).join('\n'), description: 'Squarespace auto-generates sitemap — submit to GSC after publish' };
  }

  getInstallSteps(domain: string, files: GeneratedFile[]): string[] {
    return [
      'Follow the step-by-step instructions in each .txt file',
      'Add site-wide schema via Settings → Advanced → Code Injection → Header',
      'Squarespace auto-generates sitemap — no manual sitemap needed',
      'Submit new URLs to Google Search Console after publishing',
    ];
  }
}

class GatsbyAdapterImpl extends NextjsAdapterImpl {
  readonly stackName = 'Gatsby';
  generatePage(input: PageInput): GeneratedFile {
    const result = super.generatePage(input);
    return { ...result, path: `src/pages${input.slug}.tsx`, description: `Gatsby page for "${input.keyword}"` };
  }
}
