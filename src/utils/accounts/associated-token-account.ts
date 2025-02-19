import { findAssociatedTokenPda } from "@solana-program/token";
import type { Address, KeyPairSigner } from "@solana/web3.js";
import { checkedAddress } from "gill";
import { checkedTokenProgramAddress } from "gill/programs/token";

/**
 * Derive the associated token account (ata) address for an owner and mint/tokenProgram
 *
 * @argument `mint` - the token mint itself
 * @argument `owner` - destination wallet address to own tokens from `mint`
 * @argument `tokenProgram` - token program that the token `mint` was created with
 *
 * - (default) {@link TOKEN_PROGRAM_ADDRESS} - the original SPL Token Program
 * - {@link TOKEN_2022_PROGRAM_ADDRESS} - the SPL Token Extensions Program (aka Token22)
 */
export async function getAssociatedTokenAccountAddress(
  mint: Address | KeyPairSigner,
  owner: Address | KeyPairSigner,
  tokenProgram?: Address
): Promise<Address> {
  return (
    await findAssociatedTokenPda({
      mint: checkedAddress(mint),
      owner: checkedAddress(owner),
      tokenProgram: checkedTokenProgramAddress(tokenProgram),
    })
  )[0];
}
