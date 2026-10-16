/**
 * Recompute all public implant Directory Scores (ost-dir-v2).
 * Usage (in backend container or with DATABASE_URL):
 *   npx tsx scripts/recompute-implant-scores.ts
 */
import { recomputeAllImplantDirectoryScores } from '../src/lib/implantDirectoryScore';

async function main() {
  const n = await recomputeAllImplantDirectoryScores();
  console.log(`Recomputed ${n} implant scores (ost-dir-v2)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
