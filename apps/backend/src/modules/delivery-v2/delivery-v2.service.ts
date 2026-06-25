import { CDNUploadService } from '../cdn-upload/cdn-upload.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ─── DELIVERY CHANNELS ───────────────────────────────────────────────────
//
// Priority order (Ray's Doctrine for African + global SME reality):
// 1. WhatsApp  — default, highest open rate, no spam filters, Africa-first
// 2. Email     — always included, professional paper trail
// 3. SMS       — fallback for no-smartphone contexts
//
// ZIP is never sent as attachment (blocked by carriers + spam filters)
// → ZIP is uploaded to Veltro CDN → customer gets a secure download link

export type DeliveryChannel = 'whatsapp' | 'email' | 'sms';

export interface DeliveryConfig {
  channels:       DeliveryChannel[];   // ['whatsapp', 'email'] by default
  whatsappNumber?: string;             // E.164: +237600000000
  emailAddress:    string;
  smsNumber?:      string;
  lang:            'en' | 'fr';
}

export interface DeliveryPayload {
  userId:        string;
  domain:        string;
  zipUrl:        string;              // CDN link — never raw attachment
  zipExpiry:     Date;               // link expires in 7 days
  cycleDate:     Date;
  planLabel:     string;
  pagesGenerated: number;
  estimatedAnnualRevenue: number;
  topAction: {
    keyword:    string;
    annualGain: number;
    effort:     string;
  };
  huntCycleId: string;
}

@Injectable()
export class DeliveryV2Service {
  private readonly logger = new Logger(DeliveryV2Service.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cdn: CDNUploadService,
  ) {}

  /**
   * Hunt-cycle delivery adapter: uploads the ZIP to CDN (never an attachment)
   * and dispatches via the configured channels. Called by hunt-worker.processor.
   */
  async sendHuntDelivery(input: {
    to: string;
    name: string;
    domain: string;
    plan: string;
    cycleDate: Date;
    huntResult: any;
    zipBuffer: Buffer;
    summary: { domain: string; cycleDate: string; pagesGenerated: number; estimatedTrafficGain: number };
    huntCycleId: string;
  }): Promise<{ sent: DeliveryChannel[]; failed: DeliveryChannel[] }> {
    const { url, expiresAt } = await this.cdn.uploadZip(input.zipBuffer, input.domain, input.cycleDate);

    const topOpp = input.huntResult?.opportunities?.[0] ?? input.huntResult?.[0] ?? {};
    const payload: DeliveryPayload = {
      userId: input.huntCycleId,
      domain: input.domain,
      zipUrl: url,
      zipExpiry: expiresAt,
      cycleDate: input.cycleDate,
      planLabel: input.plan,
      pagesGenerated: input.summary.pagesGenerated,
      estimatedAnnualRevenue: Math.round((input.summary.estimatedTrafficGain ?? 0) * 12),
      topAction: {
        keyword: topOpp.pillarKeyword ?? topOpp.keyword ?? 'top opportunity',
        annualGain: Math.round((topOpp.estimatedMonthlyTraffic ?? 0) * 12),
        effort: topOpp.effort ?? 'medium',
      },
      huntCycleId: input.huntCycleId,
    };

    const cfg: DeliveryConfig = {
      channels: ['email'],
      emailAddress: input.to,
      lang: (input.huntResult?.lang === 'fr' ? 'fr' : 'en'),
    };

    return this.deliver(payload, cfg);
  }

  async deliver(payload: DeliveryPayload, cfg: DeliveryConfig): Promise<{ sent: DeliveryChannel[]; failed: DeliveryChannel[] }> {
    const sent:   DeliveryChannel[] = [];
    const failed: DeliveryChannel[] = [];

    // WhatsApp first (default + primary for Africa)
    if (cfg.channels.includes('whatsapp') && cfg.whatsappNumber) {
      const ok = await this.sendWhatsApp(payload, cfg.whatsappNumber, cfg.lang);
      ok ? sent.push('whatsapp') : failed.push('whatsapp');
    }

    // Email always
    if (cfg.channels.includes('email')) {
      const ok = await this.sendEmail(payload, cfg.emailAddress, cfg.lang);
      ok ? sent.push('email') : failed.push('email');
    }

    // SMS as fallback
    if (cfg.channels.includes('sms') && cfg.smsNumber) {
      const ok = await this.sendSMS(payload, cfg.smsNumber, cfg.lang);
      ok ? sent.push('sms') : failed.push('sms');
    }

    this.logger.log(`Delivered to ${payload.domain}: sent=${sent.join(',')} failed=${failed.join(',')}`);
    return { sent, failed };
  }

  // ─── WHATSAPP ─────────────────────────────────────────────────────────
  // Uses WhatsApp Business API (Meta Cloud API)
  // Template message required for first contact — Veltro pre-approves templates

  private async sendWhatsApp(payload: DeliveryPayload, to: string, lang: 'en' | 'fr'): Promise<boolean> {
    const token    = this.config.get('WHATSAPP_TOKEN', '');
    const phoneId  = this.config.get('WHATSAPP_PHONE_ID', '');
    if (!token || !phoneId) { this.logger.warn('WhatsApp not configured'); return false; }

    const body = lang === 'fr'
      ? this.whatsappBodyFR(payload)
      : this.whatsappBodyEN(payload);

    try {
      const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to.replace(/\D/g, ''),
          type: 'text',
          text: { body },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`WhatsApp failed for ${to}: ${err.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`WhatsApp error: ${err}`);
      return false;
    }
  }

  private whatsappBodyEN(p: DeliveryPayload): string {
    const expiry = p.zipExpiry.toLocaleDateString('en-GB');
    return `🎯 *Veltro ${p.planLabel}* — ${p.domain}

*${p.pagesGenerated} SEO pages ready to deploy*
Est. annual revenue gain: *$${p.estimatedAnnualRevenue.toLocaleString()}*

🔥 Top action: "${p.topAction.keyword}"
→ $${p.topAction.annualGain.toLocaleString()}/year · ${p.topAction.effort} effort

📦 *Download your fix package:*
${p.zipUrl}
_(link expires ${expiry})_

Open the INSTALL.md inside — 30 min to deploy.

_Veltro · Jiogue LLC_`;
  }

  private whatsappBodyFR(p: DeliveryPayload): string {
    const expiry = p.zipExpiry.toLocaleDateString('fr-FR');
    return `🎯 *Veltro ${p.planLabel}* — ${p.domain}

*${p.pagesGenerated} pages SEO prêtes à déployer*
Gain annuel estimé : *${p.estimatedAnnualRevenue.toLocaleString()} $*

🔥 Action prioritaire : « ${p.topAction.keyword} »
→ ${p.topAction.annualGain.toLocaleString()} $/an · effort ${p.topAction.effort}

📦 *Téléchargez votre pack de corrections :*
${p.zipUrl}
_(lien expire le ${expiry})_

Suivez le fichier INSTALL.md inclus — 30 min de déploiement.

_Veltro · Jiogue LLC_`;
  }

  // ─── EMAIL ────────────────────────────────────────────────────────────
  // ZIP as CDN link — never attachment

  private async sendEmail(payload: DeliveryPayload, to: string, lang: 'en' | 'fr'): Promise<boolean> {
    const smtpPass = this.config.get('SMTP_PASS', '');
    if (!smtpPass) { this.logger.warn('SMTP not configured'); return false; }

    const subject = lang === 'fr'
      ? `🎯 Veltro : ${payload.pagesGenerated} pages SEO + $${payload.estimatedAnnualRevenue.toLocaleString()} de revenu potentiel — ${payload.domain}`
      : `🎯 Veltro: ${payload.pagesGenerated} SEO pages ready + $${payload.estimatedAnnualRevenue.toLocaleString()} revenue potential — ${payload.domain}`;

    const html = lang === 'fr' ? this.emailHtmlFR(payload) : this.emailHtmlEN(payload);

    try {
      // Resend API (or any SMTP)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${smtpPass}`,
        },
        body: JSON.stringify({
          from:    this.config.get('EMAIL_FROM', 'veltro@jiogue.com'),
          to,
          subject,
          html,
          // NO attachments — ZIP link in body
        }),
      });

      if (!res.ok) { this.logger.warn(`Email failed: ${(await res.text()).slice(0, 200)}`); return false; }
      return true;
    } catch (err) {
      this.logger.error(`Email error: ${err}`);
      return false;
    }
  }

  // ─── SMS ──────────────────────────────────────────────────────────────
  // Short message + download link via Twilio or Africa's Talking

  private async sendSMS(payload: DeliveryPayload, to: string, lang: 'en' | 'fr'): Promise<boolean> {
    const provider = this.config.get('SMS_PROVIDER', 'twilio');  // 'twilio' | 'africastalking'

    const body = lang === 'fr'
      ? `Veltro: ${payload.pagesGenerated} pages SEO prêtes pour ${payload.domain}. Gain estimé: $${payload.estimatedAnnualRevenue.toLocaleString()}/an. Télécharger: ${payload.zipUrl}`
      : `Veltro: ${payload.pagesGenerated} SEO pages ready for ${payload.domain}. Est. gain: $${payload.estimatedAnnualRevenue.toLocaleString()}/yr. Download: ${payload.zipUrl}`;

    try {
      if (provider === 'twilio') return this.sendTwilio(to, body);
      if (provider === 'africastalking') return this.sendAfricasTalking(to, body);
      return false;
    } catch (err) {
      this.logger.error(`SMS error: ${err}`);
      return false;
    }
  }

  private async sendTwilio(to: string, body: string): Promise<boolean> {
    const sid   = this.config.get('TWILIO_SID', '');
    const token = this.config.get('TWILIO_TOKEN', '');
    const from  = this.config.get('TWILIO_FROM', '');
    if (!sid) return false;

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    return res.ok;
  }

  private async sendAfricasTalking(to: string, body: string): Promise<boolean> {
    const apiKey   = this.config.get('AT_API_KEY', '');
    const username = this.config.get('AT_USERNAME', '');
    if (!apiKey) return false;

    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ username, to, message: body }).toString(),
    });
    return res.ok;
  }

  // ─── EMAIL HTML ──────────────────────────────────────────────────────

  private emailHtmlEN(p: DeliveryPayload): string {
    const expiry = p.zipExpiry.toLocaleDateString('en-GB');
    return `<!DOCTYPE html><html><body style="margin:0;background:#F4F1EB;font-family:DM Mono,monospace;">
<div style="max-width:600px;margin:0 auto;">
<div style="background:#0A0A0B;padding:28px 36px;border-bottom:3px solid #C8FF00;">
  <div style="font-size:22px;font-weight:900;color:#C8FF00;letter-spacing:3px;">VELTRO</div>
  <div style="font-size:11px;color:#6B6B72;margin-top:4px;">${p.planLabel.toUpperCase()} · ${p.domain}</div>
</div>
<div style="background:#1E1E22;padding:24px 36px;">
  <div style="color:#F4F1EB;font-size:15px;margin-bottom:6px;">Your weekly SEO fix is ready.</div>
  <div style="color:#9B9BA0;font-size:12px;line-height:1.7;">
    Veltro generated <strong style="color:#C8FF00;">${p.pagesGenerated} pages</strong> with
    an estimated <strong style="color:#C8FF00;">$${p.estimatedAnnualRevenue.toLocaleString()}/year</strong> revenue upside for <strong style="color:#F5A623;">${p.domain}</strong>.
  </div>
</div>
<div style="background:#0F0F11;padding:20px 36px;border-top:1px solid #2E2E34;border-bottom:1px solid #2E2E34;">
  <div style="font-size:10px;color:#6B6B72;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Top Priority Action</div>
  <div style="font-size:15px;font-weight:700;color:#F4F1EB;">${p.topAction.keyword}</div>
  <div style="font-size:12px;color:#C8FF00;margin-top:4px;">$${p.topAction.annualGain.toLocaleString()}/year · ${p.topAction.effort} effort</div>
</div>
<div style="background:#0A0A0B;padding:28px 36px;text-align:center;">
  <div style="font-size:12px;color:#9B9BA0;margin-bottom:20px;">📦 Your fix package is ready — no email attachment (blocked by carriers).</div>
  <a href="${p.zipUrl}" style="display:inline-block;background:#C8FF00;color:#0A0A0B;padding:14px 36px;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;">
    DOWNLOAD FIX PACKAGE →
  </a>
  <div style="font-size:10px;color:#6B6B72;margin-top:12px;">Link expires ${expiry} · Also sent via WhatsApp if configured</div>
</div>
<div style="background:#0A0A0B;padding:16px 36px;border-top:1px solid #2E2E34;">
  <div style="font-size:10px;color:#6B6B72;display:flex;justify-content:space-between;">
    <span>Veltro · Jiogue LLC</span>
    <a href="https://veltro.io/settings/delivery" style="color:#6B6B72;">Manage delivery</a>
  </div>
</div>
</div></body></html>`;
  }

  private emailHtmlFR(p: DeliveryPayload): string {
    const expiry = p.zipExpiry.toLocaleDateString('fr-FR');
    return `<!DOCTYPE html><html lang="fr"><body style="margin:0;background:#F4F1EB;font-family:DM Mono,monospace;">
<div style="max-width:600px;margin:0 auto;">
<div style="background:#0A0A0B;padding:28px 36px;border-bottom:3px solid #C8FF00;">
  <div style="font-size:22px;font-weight:900;color:#C8FF00;letter-spacing:3px;">VELTRO</div>
  <div style="font-size:11px;color:#6B6B72;margin-top:4px;">${p.planLabel.toUpperCase()} · ${p.domain}</div>
</div>
<div style="background:#1E1E22;padding:24px 36px;">
  <div style="color:#F4F1EB;font-size:15px;margin-bottom:6px;">Votre correction SEO hebdomadaire est prête.</div>
  <div style="color:#9B9BA0;font-size:12px;line-height:1.7;">
    Veltro a généré <strong style="color:#C8FF00;">${p.pagesGenerated} pages</strong> avec un potentiel de revenu estimé à
    <strong style="color:#C8FF00;">${p.estimatedAnnualRevenue.toLocaleString()} $/an</strong> pour <strong style="color:#F5A623;">${p.domain}</strong>.
  </div>
</div>
<div style="background:#0F0F11;padding:20px 36px;border-top:1px solid #2E2E34;border-bottom:1px solid #2E2E34;">
  <div style="font-size:10px;color:#6B6B72;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">Action Prioritaire</div>
  <div style="font-size:15px;font-weight:700;color:#F4F1EB;">${p.topAction.keyword}</div>
  <div style="font-size:12px;color:#C8FF00;margin-top:4px;">${p.topAction.annualGain.toLocaleString()} $/an · effort ${p.topAction.effort}</div>
</div>
<div style="background:#0A0A0B;padding:28px 36px;text-align:center;">
  <div style="font-size:12px;color:#9B9BA0;margin-bottom:20px;">📦 Votre pack est prêt — pas de pièce jointe (bloquées par les opérateurs).</div>
  <a href="${p.zipUrl}" style="display:inline-block;background:#C8FF00;color:#0A0A0B;padding:14px 36px;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;">
    TÉLÉCHARGER LE PACK →
  </a>
  <div style="font-size:10px;color:#6B6B72;margin-top:12px;">Lien expire le ${expiry} · Aussi envoyé via WhatsApp si configuré</div>
</div>
<div style="background:#0A0A0B;padding:16px 36px;border-top:1px solid #2E2E34;">
  <div style="font-size:10px;color:#6B6B72;">Veltro · Jiogue LLC · <a href="https://veltro.io/settings/delivery" style="color:#6B6B72;">Gérer la livraison</a></div>
</div>
</div></body></html>`;
  }
}
