import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// ─── AUTO-DEPLOY: optional paid add-on (+$50/mo on any plan) ─────────────
//
// WHAT CUSTOMER PROVIDES:
//   1. CMS type (auto-detected by StackDetector — no input needed)
//   2. CMS API credential (one-time setup, stored encrypted)
//   3. Approval mode: 'auto' | 'review'   (default: 'review' = email link)
//   4. Max actions per day (default: 3)
//   5. Rollback threshold (default: -20% traffic in 7 days)
//
// WHAT VELTRO DOES:
//   - Generates correct format for detected stack (Next.js TSX, WP PHP, etc.)
//   - Creates GitHub PR (for code-based stacks) OR publishes via CMS REST API
//   - Monitors performance for 7 days
//   - Auto-reverts if rollback threshold breached
//
// PRICING:
//   - Default (all plans): ZIP delivery by WhatsApp + email
//   - Auto-deploy add-on:  +$50/mo on Starter or Pro
//   - Agency plan:         Auto-deploy included
//   - Enterprise:          Full autopilot included

export type DeployTarget =
  | 'github_pr'      // Next.js, Nuxt, Astro, Gatsby — creates PR, customer merges
  | 'wordpress_api'  // WordPress REST API — publishes page directly
  | 'webflow_api'    // Webflow CMS API
  | 'contentful_api' // Contentful Management API
  | 'ghost_api'      // Ghost Admin API
  | 'shopify_api';   // Shopify Storefront (for landing pages)

export type ApprovalMode = 'auto' | 'review';   // review = email approval link first

export interface AutoDeployConfig {
  enabled:          boolean;
  target:           DeployTarget;
  // Credentials (encrypted at rest, never logged)
  credential: {
    apiUrl?:    string;   // WordPress: https://site.com, Webflow: collection ID
    apiKey:     string;   // encrypted
    apiSecret?: string;   // encrypted (WP: app password, GitHub: token)
    repoOwner?: string;   // GitHub only
    repoName?:  string;   // GitHub only
    repoBranch: string;   // default: 'main'
  };
  approvalMode:     ApprovalMode;
  maxActionsPerDay: number;        // safety rail, default 3
  rollbackThreshold: number;       // -0.20 = rollback if -20% clicks in 7d
  notifyEmail:      string;
  notifyWhatsApp?:  string;
}

export interface DeployResult {
  success:     boolean;
  deployedUrl?: string;
  prUrl?:       string;   // GitHub PR URL if target = github_pr
  postId?:      string;
  error?:       string;
  requiresApproval: boolean;
  approvalUrl?: string;   // link customer clicks to approve
}

@Injectable()
export class AutoDeployService {
  private readonly logger = new Logger(AutoDeployService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── MAIN ENTRY POINT ────────────────────────────────────────────────

  async deploy(
    cfg:      AutoDeployConfig,
    pageSlug: string,
    content:  string,         // generated code in correct format
    title:    string,
    keyword:  string,
  ): Promise<DeployResult> {

    if (!cfg.enabled) return { success: false, error: 'Auto-deploy not enabled', requiresApproval: false };

    // Check daily action limit
    const todayCount = await this.countTodayActions(cfg.notifyEmail);
    if (todayCount >= cfg.maxActionsPerDay) {
      return {
        success: false,
        error:   `Daily limit reached (${cfg.maxActionsPerDay} actions/day). Next action tomorrow.`,
        requiresApproval: false,
      };
    }

    // Review mode: create approval link, don't deploy yet
    if (cfg.approvalMode === 'review') {
      const approvalToken = await this.createApprovalToken({ cfg, pageSlug, content, title, keyword });
      return {
        success:          false,
        requiresApproval: true,
        approvalUrl:      `https://veltro.io/approve/${approvalToken}`,
        error:            'Approval required — link sent to your email and WhatsApp',
      };
    }

    // Auto mode: deploy immediately
    return this.executeDeployment(cfg, pageSlug, content, title, keyword);
  }

  async executeDeployment(
    cfg: AutoDeployConfig, pageSlug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    this.logger.log(`Auto-deploying "${keyword}" to ${cfg.target}`);

    switch (cfg.target) {
      case 'github_pr':      return this.deployGitHubPR(cfg, pageSlug, content, title, keyword);
      case 'wordpress_api':  return this.deployWordPress(cfg, pageSlug, content, title, keyword);
      case 'webflow_api':    return this.deployWebflow(cfg, pageSlug, content, title, keyword);
      case 'contentful_api': return this.deployContentful(cfg, pageSlug, content, title, keyword);
      case 'ghost_api':      return this.deployGhost(cfg, pageSlug, content, title, keyword);
      default:               return { success: false, error: `Deploy target "${cfg.target}" not supported`, requiresApproval: false };
    }
  }

  // ─── GITHUB PR (Next.js, Nuxt, Astro) ────────────────────────────────
  // Creates a branch + PR — customer reviews and merges
  // Works without giving Veltro direct server access

  private async deployGitHubPR(
    cfg: AutoDeployConfig, slug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    const { apiKey: token, repoOwner, repoName, repoBranch } = cfg.credential;
    if (!repoOwner || !repoName) return { success: false, error: 'GitHub repo not configured', requiresApproval: false };

    const branch    = `veltro/seo-${slug.replace(/\//g, '-').replace(/^-/, '')}-${Date.now()}`;
    const filePath  = `src/app${slug}/page.tsx`;
    const base      = repoBranch ?? 'main';
    const headers   = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
    const apiBase   = `https://api.github.com/repos/${repoOwner}/${repoName}`;

    try {
      // 1. Get base branch SHA
      const refRes = await fetch(`${apiBase}/git/ref/heads/${base}`, { headers });
      if (!refRes.ok) return { success: false, error: `GitHub: cannot read branch ${base}`, requiresApproval: false };
      const sha = (await refRes.json() as any).object.sha;

      // 2. Create feature branch
      await fetch(`${apiBase}/git/refs`, {
        method: 'POST', headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });

      // 3. Get existing file SHA (if exists — needed for update)
      let existingSha: string | undefined;
      const existRes = await fetch(`${apiBase}/contents/${filePath}?ref=${branch}`, { headers });
      if (existRes.ok) existingSha = (await existRes.json() as any).sha;

      // 4. Create or update file
      const fileBody: any = {
        message: `feat(seo): Veltro — "${keyword}" page\n\nGenerated by Veltro SEO Hunter\nEst. annual revenue: see PR description`,
        content: Buffer.from(content).toString('base64'),
        branch,
      };
      if (existingSha) fileBody.sha = existingSha;

      const fileRes = await fetch(`${apiBase}/contents/${filePath}`, {
        method: 'PUT', headers, body: JSON.stringify(fileBody),
      });
      if (!fileRes.ok) return { success: false, error: `GitHub file create failed: ${fileRes.status}`, requiresApproval: false };

      // 5. Create PR
      const prRes = await fetch(`${apiBase}/pulls`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: `[Veltro SEO] ${title}`,
          body:  `## Veltro SEO Hunter — Auto-generated page\n\n**Keyword:** \`${keyword}\`\n**Slug:** \`${slug}\`\n\n### How to deploy\n1. Review this PR\n2. Merge to deploy the page live\n3. Submit URL to Google Search Console after merge\n\n_Generated by Veltro · Jiogue LLC_`,
          head:  branch,
          base,
        }),
      });

      if (!prRes.ok) return { success: false, error: `GitHub PR create failed: ${prRes.status}`, requiresApproval: false };
      const pr = await prRes.json() as any;
      return { success: true, prUrl: pr.html_url, requiresApproval: true, approvalUrl: pr.html_url };

    } catch (err) {
      return { success: false, error: String(err), requiresApproval: false };
    }
  }

  // ─── WORDPRESS REST API ──────────────────────────────────────────────

  private async deployWordPress(
    cfg: AutoDeployConfig, slug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    const { apiUrl, apiKey, apiSecret } = cfg.credential;
    if (!apiUrl) return { success: false, error: 'WordPress URL not configured', requiresApproval: false };

    try {
      const res = await fetch(`${apiUrl}/wp-json/wp/v2/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          title, content, slug: slug.replace(/^\//, ''), status: 'publish',
          meta: { _yoast_wpseo_focuskw: keyword, _yoast_wpseo_metadesc: `${title} — real-time B2B intelligence.` },
        }),
      });

      if (!res.ok) return { success: false, error: `WP API ${res.status}: ${(await res.text()).slice(0, 200)}`, requiresApproval: false };
      const page = await res.json() as any;
      return { success: true, deployedUrl: page.link, postId: String(page.id), requiresApproval: false };
    } catch (err) {
      return { success: false, error: String(err), requiresApproval: false };
    }
  }

  // ─── WEBFLOW CMS API ─────────────────────────────────────────────────

  private async deployWebflow(
    cfg: AutoDeployConfig, slug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    const { apiUrl: collectionId, apiKey } = cfg.credential;
    if (!collectionId) return { success: false, error: 'Webflow collection ID not configured', requiresApproval: false };

    try {
      const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'accept-version': '1.0.0' },
        body: JSON.stringify({
          isArchived: false, isDraft: false,
          fieldData: { name: title, slug: slug.replace(/^\//, ''), 'body-content': content, 'meta-title': `${title} | Veltro`, 'meta-description': `${title} — discover leads.` },
        }),
      });

      if (!res.ok) return { success: false, error: `Webflow API ${res.status}`, requiresApproval: false };
      const item = await res.json() as any;
      return { success: true, postId: item._id, deployedUrl: `https://${slug}`, requiresApproval: false };
    } catch (err) {
      return { success: false, error: String(err), requiresApproval: false };
    }
  }

  // ─── CONTENTFUL ──────────────────────────────────────────────────────

  private async deployContentful(
    cfg: AutoDeployConfig, slug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    const { apiUrl: spaceId, apiKey } = cfg.credential;
    if (!spaceId) return { success: false, error: 'Contentful space ID not configured', requiresApproval: false };
    const h = { 'Content-Type': 'application/vnd.contentful.management.v1+json', Authorization: `Bearer ${apiKey}`, 'X-Contentful-Content-Type': 'seoPage' };

    try {
      const createRes = await fetch(`https://api.contentful.com/spaces/${spaceId}/environments/master/entries`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ fields: { title: { 'en-US': title }, slug: { 'en-US': slug.replace(/^\//, '') }, body: { 'en-US': content }, keyword: { 'en-US': keyword } } }),
      });
      if (!createRes.ok) return { success: false, error: `Contentful ${createRes.status}`, requiresApproval: false };
      const entry = await createRes.json() as any;
      await fetch(`https://api.contentful.com/spaces/${spaceId}/environments/master/entries/${entry.sys.id}/published`, {
        method: 'PUT', headers: { Authorization: `Bearer ${apiKey}`, 'X-Contentful-Version': String(entry.sys.version) },
      });
      return { success: true, postId: entry.sys.id, requiresApproval: false };
    } catch (err) {
      return { success: false, error: String(err), requiresApproval: false };
    }
  }

  // ─── GHOST ───────────────────────────────────────────────────────────

  private async deployGhost(
    cfg: AutoDeployConfig, slug: string, content: string, title: string, keyword: string,
  ): Promise<DeployResult> {
    const { apiUrl, apiKey } = cfg.credential;
    if (!apiUrl) return { success: false, error: 'Ghost URL not configured', requiresApproval: false };

    try {
      const res = await fetch(`${apiUrl}/ghost/api/admin/pages/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Ghost ${apiKey}` },
        body: JSON.stringify({ pages: [{ title, slug: slug.replace(/^\//, ''), html: content, status: 'published', meta_title: `${title}`, meta_description: `${title} — real-time B2B intelligence.` }] }),
      });
      if (!res.ok) return { success: false, error: `Ghost ${res.status}`, requiresApproval: false };
      const data = await res.json() as any;
      return { success: true, postId: data.pages[0].id, deployedUrl: data.pages[0].url, requiresApproval: false };
    } catch (err) {
      return { success: false, error: String(err), requiresApproval: false };
    }
  }

  // ─── APPROVAL TOKEN ──────────────────────────────────────────────────

  private async createApprovalToken(data: any): Promise<string> {
    const token = `approve_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const user = await this.prisma.user.findFirst({ where: { email: data.cfg?.notifyEmail } });
    if (!user) throw new Error('User not found for approval token');
    await this.prisma.deployApproval.create({
      data: { userId: user.id, token, payload: data, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    });
    return token;
  }

  private async countTodayActions(email: string): Promise<number> {
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return 0;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return this.prisma.deployLog.count({ where: { userId: user.id, createdAt: { gte: start } } });
  }
}
