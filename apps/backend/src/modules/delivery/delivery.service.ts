import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { HuntResult } from '../hunter/opportunity-hunter.service';
import { PLAN_CONFIG, PlanTier } from '../scheduler/hunt-scheduler.service';

export interface DeliveryPayload {
  to:          string;
  name:        string;
  domain:      string;
  plan:        PlanTier;
  cycleDate:   Date;
  huntResult:  HuntResult;
  zipBuffer:   Buffer;
  summary:     { pagesGenerated: number; estimatedTrafficGain: number; cycleDate: string };
  huntCycleId: string;
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   config.get('SMTP_HOST', 'smtp.resend.com'),
      port:   config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: config.get('SMTP_USER', 'resend'),
        pass: config.get('SMTP_PASS'),
      },
    });
  }

  async sendHuntDelivery(payload: DeliveryPayload): Promise<void> {
    const { to, name, domain, plan, cycleDate, huntResult, zipBuffer, summary } = payload;
    const planLabel = PLAN_CONFIG[plan].label;
    const critical  = huntResult.opportunities.filter(o => o.priority === 'critical');
    const dateStr   = cycleDate.toISOString().split('T')[0];
    const filename  = `veltro-seo-fix-${domain}-${dateStr}.zip`;

    const html = this.buildEmailHTML({
      name, domain, plan: planLabel, dateStr,
      totalOpportunities: huntResult.totalOpportunities,
      criticalCount:      huntResult.criticalCount,
      pagesGenerated:     summary.pagesGenerated,
      estimatedTraffic:   summary.estimatedTrafficGain,
      topOpportunities:   critical.slice(0, 3).map(o => ({
        keyword:   o.pillarKeyword,
        score:     o.clusterScore,
        kd:        o.avgKD,
        traffic:   o.estimatedMonthlyTraffic,
        winWeeks:  o.estimatedWinWeeks,
        gap:       o.competitorGap,
      })),
      huntCycleId: payload.huntCycleId,
    });

    await this.transporter.sendMail({
      from:        `"Veltro SEO Hunter" <${this.config.get('EMAIL_FROM', 'seo@veltro.io')}>`,
      to,
      subject:     `🎯 Veltro ${planLabel}: ${summary.pagesGenerated} SEO pages ready for ${domain} — ${dateStr}`,
      html,
      attachments: [{
        filename,
        content:     zipBuffer,
        contentType: 'application/zip',
      }],
    });

    this.logger.log(`Delivery sent to ${to} — ${filename} (${Math.round(zipBuffer.length / 1024)}KB)`);
  }

  // ─── EMAIL HTML ──────────────────────────────────────────────────────

  private buildEmailHTML(data: {
    name: string; domain: string; plan: string; dateStr: string;
    totalOpportunities: number; criticalCount: number;
    pagesGenerated: number; estimatedTraffic: number;
    topOpportunities: { keyword: string; score: number; kd: number; traffic: number; winWeeks: number; gap: boolean }[];
    huntCycleId: string;
  }): string {
    const topRows = data.topOpportunities.map(o => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;font-weight:600;color:#F4F1EB;">${o.keyword}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;text-align:center;color:#C8FF00;font-weight:700;">${o.score}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;text-align:center;color:${o.kd < 25 ? '#00C48C' : o.kd < 45 ? '#F5A623' : '#FF3B30'};">${o.kd}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;text-align:center;color:#F4F1EB;">+${o.traffic.toLocaleString()}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;text-align:center;color:#F5A623;">${o.winWeeks}w</td>
        <td style="padding:10px 12px;border-bottom:1px solid #2E2E34;text-align:center;">${o.gap ? '<span style="color:#00C48C;">✓ GAP</span>' : '<span style="color:#6B6B72;">—</span>'}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F1EB;font-family:'DM Mono',monospace,sans-serif;">

  <div style="max-width:640px;margin:0 auto;background:#F4F1EB;">

    <!-- HEADER -->
    <div style="background:#0A0A0B;padding:32px 40px;border-bottom:3px solid #C8FF00;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:28px;font-weight:900;color:#C8FF00;letter-spacing:3px;">VELTRO</div>
          <div style="font-size:11px;color:#6B6B72;margin-top:4px;">SEO HUNTER · ${data.plan.toUpperCase()}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:#6B6B72;">Cycle Date</div>
          <div style="font-size:13px;color:#F4F1EB;">${data.dateStr}</div>
        </div>
      </div>
    </div>

    <!-- GREETING -->
    <div style="background:#0A0A0B;padding:28px 40px 24px;">
      <div style="font-size:18px;color:#F4F1EB;margin-bottom:8px;">Hi ${data.name},</div>
      <div style="font-size:13px;color:#9B9BA0;line-height:1.7;">
        Your weekly SEO hunt for <strong style="color:#F5A623;">${data.domain}</strong> is complete.
        Veltro found <strong style="color:#C8FF00;">${data.totalOpportunities} opportunities</strong>
        including <strong style="color:#FF3B30;">${data.criticalCount} critical gaps</strong> with zero serious competition.
        <br><br>
        <strong style="color:#C8FF00;">${data.pagesGenerated} production-ready pages</strong> are attached as a ZIP.
        Drop them into your repo and deploy — no other tool does this.
      </div>
    </div>

    <!-- SCORE STRIP -->
    <div style="background:#1E1E22;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;border-top:1px solid #2E2E34;">
      ${[
        { label: 'Opportunities', val: data.totalOpportunities, color: '#C8FF00' },
        { label: 'Critical', val: data.criticalCount, color: '#FF3B30' },
        { label: 'Pages Ready', val: data.pagesGenerated, color: '#00C48C' },
        { label: 'Est. Traffic', val: '+' + data.estimatedTraffic.toLocaleString(), color: '#F5A623' },
      ].map(s => `
        <div style="padding:20px 16px;border-right:1px solid #2E2E34;text-align:center;">
          <div style="font-size:10px;color:#6B6B72;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">${s.label}</div>
          <div style="font-size:28px;font-weight:900;color:${s.color};">${s.val}</div>
        </div>`).join('')}
    </div>

    <!-- TOP OPPORTUNITIES TABLE -->
    <div style="background:#0A0A0B;padding:28px 40px;">
      <div style="font-size:11px;color:#6B6B72;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px;">Top Clusters This Cycle</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="color:#6B6B72;font-size:10px;text-transform:uppercase;letter-spacing:1px;">
            <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #2E2E34;">Keyword</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #2E2E34;">Score</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #2E2E34;">KD</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #2E2E34;">Traffic</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #2E2E34;">Win In</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #2E2E34;">Gap?</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="background:#1E1E22;padding:28px 40px;text-align:center;border-top:1px solid #2E2E34;">
      <div style="font-size:13px;color:#9B9BA0;margin-bottom:20px;">
        📎 <strong style="color:#F4F1EB;">ZIP attached</strong> — extract and copy into your repo. See INSTALL.md inside.
      </div>
      <a href="https://veltro.io/dashboard/cycles/${data.huntCycleId}"
         style="display:inline-block;background:#C8FF00;color:#0A0A0B;padding:12px 32px;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:1px;">
        VIEW FULL REPORT →
      </a>
    </div>

    <!-- FOOTER -->
    <div style="background:#0A0A0B;padding:20px 40px;border-top:1px solid #2E2E34;">
      <div style="font-size:10px;color:#6B6B72;display:flex;justify-content:space-between;">
        <span>Veltro SEO Hunter · Jiogue LLC</span>
        <a href="https://veltro.io/settings/notifications" style="color:#6B6B72;">Manage frequency</a>
      </div>
    </div>

  </div>
</body>
</html>`;
  }
}
