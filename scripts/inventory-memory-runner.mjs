import { startInventoryMemoryController } from '../tests/helpers/inventory-memory-runner.mjs';

if (process.argv[2] !== '--serve') {
  console.error('usage: npm run inventory:runner -- --serve');
  process.exitCode = 2;
} else {
  const controller = await startInventoryMemoryController();
  console.log(JSON.stringify({
    website: controller.safeURLs.website,
    storeOrigin: controller.expectedStoreOrigin,
    mailbox: `${controller.safeURLs.website}/__proof/browser`,
    jwks: controller.jwksURL,
  }));
  const stop = async () => {
    await controller.stop();
    await controller.cleanup();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
