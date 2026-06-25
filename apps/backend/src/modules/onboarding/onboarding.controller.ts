import { Controller, Post, Get, Body, Req, Param, Query, UseGuards, Redirect, Logger } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { ConnectorRegistryService } from '../connectors/connector-registry.service';
import { GSCConnector } from '../connectors/gsc/gsc.connector';
import { JwtAuthGuard } from '../auth/auth.module';

@Controller('onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboarding:  OnboardingService,
    private readonly connectors:  ConnectorRegistryService,
    private readonly gsc:         GSCConnector,
  ) {}

  // ── GET CURRENT STATE ─────────────────────────────────────────────────
  @Get('state')
  @UseGuards(JwtAuthGuard)
  async getState(@Req() req: any) {
    return this.onboarding.getState(req.user.id);
  }

  // ── ADVANCE STEP ──────────────────────────────────────────────────────
  @Post('step/:step')
  @UseGuards(JwtAuthGuard)
  async advance(@Req() req: any, @Param('step') step: string, @Body() body: unknown) {
    return this.onboarding.advance(req.user.id, step as any, body);
  }

  // ── SKIP OPTIONAL STEP ────────────────────────────────────────────────
  @Post('skip/:step')
  @UseGuards(JwtAuthGuard)
  async skip(@Req() req: any, @Param('step') step: string) {
    return this.onboarding.skipStep(req.user.id, step as any);
  }

  // ── GOOGLE OAUTH START (GSC + GA4) ────────────────────────────────────
  @Get('connect/google')
  @UseGuards(JwtAuthGuard)
  async startGoogleOAuth(@Req() req: any) {
    const redirectUri = `${process.env.APP_URL}/api/onboarding/connect/google/callback`;
    const url = this.connectors.getGoogleOAuthUrl(req.user.id, redirectUri);
    return { authUrl: url };
  }

  // ── GOOGLE OAUTH CALLBACK ─────────────────────────────────────────────
  @Get('connect/google/callback')
  @Redirect()
  async googleCallback(@Query('code') code: string, @Query('state') state: string) {
    const appUrl      = process.env.APP_URL ?? 'https://veltro.io';
    const redirectUri = `${appUrl}/api/onboarding/connect/google/callback`;

    try {
      if (!state || !code) throw new Error('Missing code or state');
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      const userId    = stateData.userId;
      if (!userId) throw new Error('No userId in state');

      await this.gsc.exchangeCode(userId, code, redirectUri);
      // Advance onboarding step to CONNECT_GA4
      await this.onboarding.advance(userId, 'CONNECT_GSC', { connected: true });
      this.logger.log(`Google OAuth connected for user ${userId}`);
      return { url: `${appUrl}/?onboard=CONNECT_GA4&connected=true` };
    } catch (err) {
      this.logger.error(`Google OAuth failed: ${err}`);
      return { url: `${appUrl}/?onboard=CONNECT_GSC&error=oauth_failed` };
    }
  }

  // ── SHOPIFY OAUTH START ───────────────────────────────────────────────
  @Get('connect/shopify')
  @UseGuards(JwtAuthGuard)
  async startShopifyOAuth(@Req() req: any, @Query('shop') shop: string) {
    if (!shop) return { error: 'shop parameter required' };
    const redirectUri = `${process.env.APP_URL}/api/onboarding/connect/shopify/callback`;
    const url = this.connectors.getShopifyOAuthUrl(shop, req.user.id, redirectUri);
    return { authUrl: url };
  }

  // ── BING API KEY SAVE ─────────────────────────────────────────────────
  @Post('connect/bing')
  @UseGuards(JwtAuthGuard)
  async saveBingKey(@Req() req: any, @Body() body: { apiKey: string }) {
    if (!body?.apiKey) return { error: 'apiKey required' };
    // Save via connector registry
    await this.connectors.saveApiKey(req.user.id, 'bing', body.apiKey);
    return { connected: true };
  }

  // ── AHREFS API KEY SAVE ───────────────────────────────────────────────
  @Post('connect/ahrefs')
  @UseGuards(JwtAuthGuard)
  async saveAhrefsKey(@Req() req: any, @Body() body: { apiKey: string }) {
    if (!body?.apiKey) return { error: 'apiKey required' };
    await this.connectors.saveApiKey(req.user.id, 'ahrefs', body.apiKey);
    return { connected: true };
  }

  // ── CONNECTOR HEALTH CHECK ────────────────────────────────────────────
  @Get('connectors')
  @UseGuards(JwtAuthGuard)
  async getConnectors(@Req() req: any) {
    const health = await this.connectors.getConnectorHealth(req.user.id);
    const confidence = this.connectors.getRevenueConfidence(health);
    return { connectors: health, revenueConfidence: confidence };
  }
}
