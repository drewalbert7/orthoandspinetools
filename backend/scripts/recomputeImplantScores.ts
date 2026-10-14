/**
 * One-shot: recompute proprietary OST Directory Scores for all public implants.
 * Usage: npx tsx scripts/recomputeImplantScores.ts
 */
import { recomputeAllImplantDirectoryScores } from '../src/lib/implantDirectoryScore';

async function main() {
  const n = await recomputeAllImplantDirectoryScores();
  console.log(`Recomputed Directory Scores for ${n} implants (ost-dir-v1)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
