import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// AES-256-GCM — authenticated encryption, tamper-proof
// Used for: CMS API keys, CRM tokens, connector credentials stored in DB

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;
  private readonly ALG = 'aes-256-gcm';

  constructor(private config: ConfigService) {
    const raw = this.config.get<string>('ENCRYPTION_KEY', '');
    if (!raw || raw.length < 32) throw new Error('ENCRYPTION_KEY must be at least 32 chars');
    // Derive consistent 32-byte key via SHA-256
    this.key = crypto.createHash('sha256').update(raw).digest();
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv         = crypto.randomBytes(16);
    const cipher     = crypto.createCipheriv(this.ALG, this.key, iv);
    const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag    = cipher.getAuthTag();
    // Format: iv(32hex) + authTag(32hex) + ciphertext(hex)
    return iv.toString('hex') + authTag.toString('hex') + encrypted.toString('hex');
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext) return '';
    try {
      const iv         = Buffer.from(ciphertext.slice(0, 32), 'hex');
      const authTag    = Buffer.from(ciphertext.slice(32, 64), 'hex');
      const encrypted  = Buffer.from(ciphertext.slice(64), 'hex');
      const decipher   = crypto.createDecipheriv(this.ALG, this.key, iv);
      decipher.setAuthTag(authTag);
      return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
    } catch {
      throw new Error('Decryption failed — key mismatch or tampered data');
    }
  }

  // Safe: returns empty string instead of throwing
  decryptSafe(ciphertext: string): string {
    try { return this.decrypt(ciphertext); } catch { return ''; }
  }

  // Hash for lookups (one-way) — used for idempotency keys
  hash(value: string): string {
    return crypto.createHmac('sha256', this.key).update(value).digest('hex');
  }
}
