import {
  Module, Controller, Post, Get, Body, Req,
  UseGuards, Injectable, UnauthorizedException, Logger,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { z } from 'zod';
import * as crypto from 'crypto';

// ─── JWT STRATEGY ────────────────────────────────────────────────────────

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }
  async validate(payload: any) {
    return { id: payload.sub, email: payload.email, role: payload.role, lang: payload.lang };
  }
}

// ─── AUTH GUARD (re-exported for other modules) ──────────────────────────

import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// ─── VALIDATION SCHEMAS ──────────────────────────────────────────────────

const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8).max(128),
  name:     z.string().min(1).max(100).optional(),
  lang:     z.enum(['EN','FR']).default('EN'),
  country:  z.string().length(2).optional(),
  phone:    z.string().optional(),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── AUTH CONTROLLER ────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt:    JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.flatten() };

    const { email, password, name, lang, country, phone } = parsed.data;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return { error: 'Email already registered' };

    const passwordHash = this.hashPassword(password);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, name, lang, country, phone },
      select: { id: true, email: true, name: true, role: true, lang: true, onboardStep: true, onboardDone: true },
    });

    const token = this.sign(user);
    this.logger.log(`New user registered: ${email}`);
    return { user, token };
  }

  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.flatten() };

    const { email, password } = parsed.data;
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const incoming = Buffer.from(this.hashPassword(password));
    const stored   = Buffer.from(user.passwordHash);
    if (incoming.length !== stored.length) throw new UnauthorizedException('Invalid credentials');

    const valid = crypto.timingSafeEqual(incoming, stored);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.sign(user);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, lang: user.lang, onboardStep: user.onboardStep, onboardDone: user.onboardDone },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return this.prisma.user.findUnique({
      where:  { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, lang: true, country: true, phone: true, onboardStep: true, onboardDone: true, createdAt: true },
    });
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new UnauthorizedException();
    return { token: this.sign(user) };
  }

  private sign(user: any): string {
    return this.jwt.sign({ sub: user.id, email: user.email, role: user.role, lang: user.lang });
  }

  private hashPassword(password: string): string {
    return crypto
      .createHmac('sha256', this.config.get('JWT_SECRET', ''))
      .update(password)
      .digest('hex');
  }
}

// ─── AUTH MODULE ─────────────────────────────────────────────────────────

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports:    [ConfigModule],
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:      config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRY', '7d') as any },
      }),
    }),
  ],
  controllers: [AuthController],
  providers:   [JwtStrategy, JwtAuthGuard],
  exports:     [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
