import { config, assertProductionConfig } from './lib/config.js';
import { createGhl } from './lib/ghl.js';
import { createPayments } from './lib/payments.js';
import { createApp } from './app.js';

assertProductionConfig();
const app = createApp({ ghl: createGhl(), payments: createPayments() });
app.listen(config.port, () => console.log(`Verband-Website läuft auf ${config.baseUrl} (Port ${config.port})`));
