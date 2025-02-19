import type { Rpc, SolanaRpcApi } from "gill";

// 10k CUs is 0.03 cents, assuming 150k CUs and $250 SOL
const MIN_CU_PRICE = 10_000;
// 10M CUs is $0.38, assuming 150k CUs and $250 SOL
const MAX_CU_PRICE = 10_000_000;

/** Gets a given transaction's priority fee estimate */
export async function getTransactionPriorityFeeEstimate(
  connection: Rpc<SolanaRpcApi>
) {
  const medianPriorityFees = await connection
    .getRecentPrioritizationFees()
    .send();

  // Initialize maximum element
  let medianPriorityFee = medianPriorityFees[0].prioritizationFee;

  // Traverse slots
  // from second and compare
  // every slot with current prioritizationFee
  for (let i = 1; i < medianPriorityFees.length; i++) {
    if (medianPriorityFees[i].prioritizationFee > medianPriorityFee)
      medianPriorityFee = medianPriorityFees[i].prioritizationFee;
  }

  const priorityFee = Math.min(
    Math.max(Number(medianPriorityFee), MIN_CU_PRICE),
    MAX_CU_PRICE
  );

  return priorityFee;
}
