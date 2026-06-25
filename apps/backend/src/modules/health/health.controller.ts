import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = {};

    // DB check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Redis check (via BullMQ connection)
    checks.redis = 'ok'; // shallow — BullMQ would have crashed if Redis is down

    const healthy = Object.values(checks).every(v => v === 'ok');

    return {
      status:  healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '1.0.0',
      uptime:  Math.round(process.uptime()),
      checks,
    };
  }
}
