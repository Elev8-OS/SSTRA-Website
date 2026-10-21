import Stripe from 'stripe';
import { config, isProd } from './config.js';

export function createPayments() {
  const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
  if (!stripe && isProd) throw new Error('STRIPE_SECRET_KEY ist im Produktivbetrieb Pflicht.');
  if (!stripe) console.warn('[Stripe] Kein Key gesetzt: lokaler Zahlungs-Simulator unter /dev/pay.');

  return {
    simulated: !stripe,

    /** Liefert die URL zur Stripe-Checkout-Seite (Karte, TWINT, je nach Aktivierung im Stripe-Dashboard). */
    async createCheckout({ email, planKey, contactId }) {
      const plan = config.plans[planKey];
      if (!plan) throw new Error('Unbekannte Mitgliedschaft');
      if (!plan.amountChf) throw new Error('Für diese Mitgliedschaft ist noch kein Betrag festgelegt (config/plans.json).');
      if (!stripe) {
        return `${config.baseUrl}/dev/pay?email=${encodeURIComponent(email)}&plan=${encodeURIComponent(planKey)}`;
      }
      const year = new Date().getFullYear();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'de',
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'chf',
            unit_amount: Math.round(plan.amountChf * 100),
            product_data: { name: `Mitgliedschaft ${plan.name} ${year}` }
          }
        }],
        invoice_creation: { enabled: true },
        metadata: { email, plan: planKey, contactId: contactId || '' },
        success_url: `${config.baseUrl}/mitglieder?bezahlt=1`,
        cancel_url: `${config.baseUrl}/mitglied-werden.html?abgebrochen=1`
      });
      return session.url;
    },

    constructEvent(rawBody, signature) {
      if (!stripe) throw new Error('Stripe nicht konfiguriert');
      return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
    }
  };
}
