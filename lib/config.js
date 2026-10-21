import fs from 'node:fs';

const env = process.env;
export const isProd = env.NODE_ENV === 'production';
const list = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET || (isProd ? '' : 'dev-secret-nur-lokal'),
  adminEmails: list(env.ADMIN_EMAILS),
  ghl: {
    token: env.GHL_TOKEN || '',
    locationId: env.GHL_LOCATION_ID || '',
    webhookUrl: env.GHL_WORKFLOW_WEBHOOK_URL || '',
    fieldValueKey: env.GHL_FIELD_VALUE_KEY || 'field_value'
  },
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || ''
  },
  plans: JSON.parse(fs.readFileSync(new URL('../config/plans.json', import.meta.url), 'utf8'))
};

/** Im Produktivbetrieb darf nichts Wichtiges fehlen (kein stiller Dev-Modus). */
export function assertProductionConfig() {
  if (!isProd) return;
  const missing = [];
  if (config.sessionSecret.length < 32) missing.push('SESSION_SECRET (mind. 32 Zeichen)');
  if (!config.ghl.token) missing.push('GHL_TOKEN');
  if (!config.ghl.locationId) missing.push('GHL_LOCATION_ID');
  if (!config.stripe.secretKey) missing.push('STRIPE_SECRET_KEY');
  if (!config.stripe.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
  if (!process.env.BASE_URL?.startsWith('https://')) missing.push('BASE_URL (https://…)');
  if (!config.adminEmails.length) missing.push('ADMIN_EMAILS');
  if (missing.length) {
    throw new Error('Fehlende Konfiguration: ' + missing.join(', '));
  }
}
