import { runSeed } from '../lib/seed';

async function main() {
  console.log("Seeding database...");
  const result = await runSeed();
  console.log("✅ Seeding complete!");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
