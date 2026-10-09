import { app } from './app.js';

export default { fetch: app.fetch } satisfies ExportedHandler<WorkerBindings>;
