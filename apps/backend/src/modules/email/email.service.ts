import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier, PaymentProvider } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', 'smtp.resend.com'),
      port: parseInt(this.config.get('SMTP_PORT', '587')),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER', 'resend'),
        pass: this.config.get('SMTP_PASS', ''),
      },
    });
  }

  // ─── WEEKLY REPORT EMAIL ──────────────────────────────────────────────
  async sendWeeklyReport(to: string, data: {
    name: string;
    weekStart: Date;
    weekEnd: Date;
    metrics: any;
  }): Promise<void> {
    const { name, weekStart, weekEnd, metrics: m } = data;

    const formatDate = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const delta = (v: number) => v >= 0 ? `<span style="color:#00C896">▲ ${v}%</span>` : `<span style="color:#FF4D6A">▼ ${Math.abs(v)}%</span>`;
    const fmtRevenue = (cents: number) => `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

    const alertsHtml = (m.criticalAlerts ?? []).map((a: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1E2840">
          <span style="background:${a.priority === 'HIGH' ? '#3D1F25' : '#2A2E1A'};color:${a.priority === 'HIGH' ? '#FF4D6A' : '#F5A623'};font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600">${a.priority}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #1E2840;color:#A8B4CC;font-size:13px">${a.message}</td>
      </tr>
    `).join('');

    const topPagesHtml = (m.topPages ?? []).map((p: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1E2840;color:#00FFD1;font-size:12px;font-family:monospace">${p.url}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1E2840;color:#E8EDF8;text-align:right;font-size:13px">${p.sessions.toLocaleString()}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1E2840;color:#7C5CFC;text-align:right;font-size:13px">${p.conversions}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Growth Report</title></head>
<body style="margin:0;padding:0;background:#060910;font-family:'Courier New',monospace">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- HEADER -->
  <tr><td style="background:#0A0D14;border:1px solid #1E2840;border-radius:12px 12px 0 0;padding:28px 32px">
    <table width="100%"><tr>
      <td>
        <div style="background:#00FFD1;width:32px;height:32px;border-radius:6px;display:inline-block;text-align:center;line-height:32px;font-weight:900;color:#060910;font-size:16px;margin-bottom:8px">⚡</div>
        <div style="font-size:20px;font-weight:700;color:#E8EDF8;letter-spacing:-0.5px">SEO Growth Pro</div>
        <div style="font-size:12px;color:#6B7A99;margin-top:2px">Weekly Growth Intelligence Report</div>
      </td>
      <td align="right" style="vertical-align:top">
        <div style="font-size:11px;color:#6B7A99">${formatDate(weekStart)} → ${formatDate(weekEnd)}</div>
        <div style="font-size:11px;color:#00FFD1;margin-top:4px">Week #${getWeekNumber(weekEnd)}</div>
      </td>
    </tr></table>
    <div style="margin-top:16px;font-size:14px;color:#A8B4CC">Bonjour <strong style="color:#E8EDF8">${name}</strong>, voici vos résultats de la semaine :</div>
  </td></tr>

  <!-- KPI STRIP -->
  <tr><td style="background:#111520;border-left:1px solid #1E2840;border-right:1px solid #1E2840;padding:0">
    <table width="100%"><tr>
      <td align="center" style="padding:20px 12px;border-right:1px solid #1E2840">
        <div style="font-size:24px;font-weight:700;color:#00FFD1">${m.sessions.toLocaleString()}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px;margin-top:2px">SESSIONS</div>
        <div style="font-size:11px;margin-top:4px">${delta(m.sessionsDelta)}</div>
      </td>
      <td align="center" style="padding:20px 12px;border-right:1px solid #1E2840">
        <div style="font-size:24px;font-weight:700;color:#7C5CFC">${m.leads.toLocaleString()}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px;margin-top:2px">LEADS</div>
        <div style="font-size:11px;margin-top:4px">${delta(m.leadsDelta)}</div>
      </td>
      <td align="center" style="padding:20px 12px;border-right:1px solid #1E2840">
        <div style="font-size:24px;font-weight:700;color:#F5A623">${m.conversionRate.toFixed(2)}%</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px;margin-top:2px">CONVERSION</div>
        <div style="font-size:11px;margin-top:4px">${delta(m.conversionDelta)}</div>
      </td>
      <td align="center" style="padding:20px 12px">
        <div style="font-size:24px;font-weight:700;color:#00E5A0">${fmtRevenue(m.revenue)}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px;margin-top:2px">REVENUE</div>
        <div style="font-size:11px;margin-top:4px">${delta(m.revenueDelta)}</div>
      </td>
    </tr></table>
  </td></tr>

  <!-- SEO ROW -->
  <tr><td style="background:#0D1120;border-left:1px solid #1E2840;border-right:1px solid #1E2840;padding:0">
    <table width="100%"><tr>
      <td align="center" style="padding:14px 12px;border-right:1px solid #1E2840">
        <div style="font-size:18px;font-weight:700;color:#E8EDF8">${m.organicSessions.toLocaleString()}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px">ORGANIC SESSIONS</div>
        <div style="font-size:11px;margin-top:3px">${delta(m.organicDelta)}</div>
      </td>
      <td align="center" style="padding:14px 12px;border-right:1px solid #1E2840">
        <div style="font-size:18px;font-weight:700;color:#E8EDF8">${m.clicks.toLocaleString()}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px">GSC CLICKS</div>
      </td>
      <td align="center" style="padding:14px 12px;border-right:1px solid #1E2840">
        <div style="font-size:18px;font-weight:700;color:#E8EDF8">${(m.ctr * 100).toFixed(1)}%</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px">CTR</div>
      </td>
      <td align="center" style="padding:14px 12px">
        <div style="font-size:18px;font-weight:700;color:#E8EDF8">${m.avgPosition ? `#${m.avgPosition.toFixed(1)}` : 'N/A'}</div>
        <div style="font-size:10px;color:#6B7A99;letter-spacing:1px">AVG POSITION</div>
      </td>
    </tr></table>
  </td></tr>

  ${alertsHtml ? `
  <!-- ALERTS -->
  <tr><td style="background:#0A0D14;border-left:1px solid #1E2840;border-right:1px solid #1E2840;padding:20px 32px">
    <div style="font-size:11px;color:#6B7A99;letter-spacing:1.5px;margin-bottom:12px">⚠ ALERTES CRITIQUES</div>
    <table width="100%" style="border:1px solid #1E2840;border-radius:8px;overflow:hidden">${alertsHtml}</table>
  </td></tr>` : ''}

  ${topPagesHtml ? `
  <!-- TOP PAGES -->
  <tr><td style="background:#0A0D14;border-left:1px solid #1E2840;border-right:1px solid #1E2840;padding:20px 32px">
    <div style="font-size:11px;color:#6B7A99;letter-spacing:1.5px;margin-bottom:12px">📊 TOP PAGES</div>
    <table width="100%" style="border:1px solid #1E2840;border-radius:8px;overflow:hidden">
      <tr style="background:#111520"><th style="padding:8px 12px;text-align:left;font-size:10px;color:#6B7A99;letter-spacing:1px">PAGE</th><th style="padding:8px 12px;text-align:right;font-size:10px;color:#6B7A99;letter-spacing:1px">SESSIONS</th><th style="padding:8px 12px;text-align:right;font-size:10px;color:#6B7A99;letter-spacing:1px">CONV.</th></tr>
      ${topPagesHtml}
    </table>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="background:#0A0D14;border-left:1px solid #1E2840;border-right:1px solid #1E2840;padding:24px 32px;text-align:center">
    <a href="${process.env.APP_URL ?? 'https://yourdomain.com'}/dashboard" style="display:inline-block;background:#00FFD1;color:#060910;font-weight:700;font-size:14px;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.5px">VOIR LE DASHBOARD COMPLET →</a>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#060910;border:1px solid #1E2840;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center">
    <div style="font-size:11px;color:#3D4E6B">SEO Growth Pro — Rapport automatique hebdomadaire (lundi 8h00)</div>
    <div style="font-size:11px;color:#3D4E6B;margin-top:4px">Conforme RGPD · <a href="${process.env.APP_URL}/unsubscribe" style="color:#6B7A99">Se désabonner</a> · <a href="${process.env.APP_URL}/privacy" style="color:#6B7A99">Politique de confidentialité</a></div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

    await this.transporter.sendMail({
      from: `"SEO Growth Pro" <${this.config.get('EMAIL_FROM', 'reports@seogrowthpro.com')}>`,
      to,
      subject: `📊 Rapport hebdomadaire — ${m.sessions.toLocaleString()} sessions · ${m.leads} leads · ${m.conversionRate.toFixed(2)}% conv.`,
      html,
    });
  }

  // ─── PAYMENT CONFIRMATION ─────────────────────────────────────────────
  async sendPaymentConfirmation(to: string, data: {
    name: string;
    plan: PlanTier;
    currency: string;
    amountCents: number;
    provider: PaymentProvider;
    periodEnd: Date;
  }): Promise<void> {
    const amount = (data.amountCents / 100).toLocaleString('fr-FR');
    const providerLabel: Record<string, string> = {
      PAYBRIDGE_AFRICA: 'PayBridge Africa',
      STRIPE: 'Stripe',
      ORANGE_MONEY: 'Orange Money',
      MTN_MOMO: 'MTN Mobile Money',
    };

    const html = `<!DOCTYPE html>
<html><body style="background:#060910;font-family:'Courier New',monospace;color:#E8EDF8;padding:32px">
<div style="max-width:520px;margin:0 auto;background:#0A0D14;border:1px solid #1E2840;border-radius:12px;padding:32px">
  <div style="font-size:22px;font-weight:700;color:#00FFD1;margin-bottom:8px">✅ Paiement confirmé</div>
  <div style="font-size:14px;color:#A8B4CC;margin-bottom:24px">Bienvenue dans SEO Growth Pro, ${data.name}</div>
  <table width="100%" style="border:1px solid #1E2840;border-radius:8px;overflow:hidden">
    <tr><td style="padding:12px;border-bottom:1px solid #1E2840;color:#6B7A99;font-size:12px">Plan</td><td style="padding:12px;border-bottom:1px solid #1E2840;color:#E8EDF8;font-weight:700">${data.plan}</td></tr>
    <tr><td style="padding:12px;border-bottom:1px solid #1E2840;color:#6B7A99;font-size:12px">Montant</td><td style="padding:12px;border-bottom:1px solid #1E2840;color:#00FFD1;font-weight:700">${amount} ${data.currency}</td></tr>
    <tr><td style="padding:12px;border-bottom:1px solid #1E2840;color:#6B7A99;font-size:12px">Moyen de paiement</td><td style="padding:12px;border-bottom:1px solid #1E2840;color:#E8EDF8">${providerLabel[data.provider] ?? data.provider}</td></tr>
    <tr><td style="padding:12px;color:#6B7A99;font-size:12px">Prochain renouvellement</td><td style="padding:12px;color:#E8EDF8">${data.periodEnd.toLocaleDateString('fr-FR')}</td></tr>
  </table>
  <div style="margin-top:24px;text-align:center">
    <a href="${process.env.APP_URL}/dashboard" style="background:#00FFD1;color:#060910;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block">ACCÉDER AU DASHBOARD →</a>
  </div>
  <div style="margin-top:20px;font-size:11px;color:#3D4E6B;text-align:center">Conforme RGPD · TVA incluse si applicable · Reçu disponible dans votre espace client</div>
</div>
</body></html>`;

    await this.transporter.sendMail({
      from: `"SEO Growth Pro" <${this.config.get('EMAIL_FROM')}>`,
      to,
      subject: `✅ Confirmation — Plan ${data.plan} activé · ${amount} ${data.currency}`,
      html,
    });
  }
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
