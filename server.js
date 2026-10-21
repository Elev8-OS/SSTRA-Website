import express from 'express';
import { config, assertProductionConfig } from './lib/config.js';
import { createGhl } from './lib/ghl.js';
import { createPayments } from './lib/payments.js';
import { createApp } from './app.js';
import { mountDemo } from './lib/demo.js';

assertProductionConfig();
const ghl = createGhl();
const app = createApp({ ghl, payments: createPayments() });

// Der Demo-Zugang hängt nur im lokalen Mock-Modus davor (nie mit echtem GHL oder in Produktion).
const root = express();
root.set('trust proxy', 1);
const demo = await mountDemo(root, { ghl });
root.use(app);

root.listen(config.port, () => {
  console.log(`Verband-Website läuft auf ${config.baseUrl} (Port ${config.port})`);
  if (demo) console.log('Demo-Zugang aktiv unter /demo (nur Testbetrieb, Beispieldaten im Speicher)');
});
