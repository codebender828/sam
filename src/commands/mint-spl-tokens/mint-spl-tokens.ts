import { parseArgs } from "util";
import ora, { type Ora } from "ora";
import { createConnection } from "../../utils/connection";
import { createLogger } from "../../utils/logger";
import { assertFileExists, assertKeyInObject } from "../../utils/assert";
import { resolve } from "path";
import { readFileSync } from "fs";
import {
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  generateKeyPairSigner,
  getComputeUnitEstimateForTransactionMessageFactory,
  getSignatureFromTransaction,
  isAddress,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/web3.js";
import { getMinimumBalanceForRentExemption } from "../../utils/accounts/rent";
import { getTransactionPriorityFeeEstimate } from "../../utils/priority-fees";
import {
  getCreateMetadataAccountV3Instruction,
  getTokenMetadataAddress,
} from "gill/programs";
import {
  getSetComputeUnitPriceInstruction,
  getSetComputeUnitLimitInstruction,
} from "@solana-program/compute-budget";
import { getCreateAccountInstruction } from "@solana-program/system";

import {
  TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
} from "@solana-program/token";

import { createTransactionSenderFactory } from "../../utils/transaction-sender";
import { handleError } from "../../utils/errors";
import { loadKeypairFromFile } from "../../utils/loaders/keypair";
import { getAssociatedTokenAccountAddress } from "../../utils/accounts/associated-token-account";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    url: {
      type: "string",
    },
    wsUrl: {
      type: "string",
    },
    keypair: {
      type: "string",
    },
    mint: {
      type: "string",
    },
    amount: {
      type: "string",
    },
    recipient: {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

const logger = createLogger("mint_spl_token");
let spinner: Ora;

export async function mintSPLToken() {
  spinner = ora("Minting SPL Tokens\n").start();

  assertKeyInObject(values, "url", "RPC url is required.");
  assertKeyInObject(values, "keypair", "Keypair is required.");
  assertKeyInObject(values, "mint", "Token Mint address is required.");
  assertKeyInObject(values, "amount", "SPL Token amount is required.");

  const { url, wsUrl } = values;
  const websocketsUrl = values.wsUrl || url!.replace("http", "ws");

  logger.info("Using connection URL", url);
  logger.info("Using websockets URL", websocketsUrl, wsUrl ? "" : "(computed)");

  const { rpc } = createConnection(url, websocketsUrl!);

  const pathToKeypair = resolve(values.keypair!);
  assertFileExists(
    pathToKeypair,
    `Unable to locate keypair file at path ${pathToKeypair}. Aborting.`
  );

  if (values.recipient && !isAddress(values.recipient!))
    throw new Error(
      "Invalid recipient address provided. Please check the address and try again Aborting..."
    );

  // Signer keypair
  const signer = await loadKeypairFromFile(pathToKeypair);

  const recipientAddress = values.recipient
    ? address(values.recipient)
    : signer.address;
  const amountAsInput = values.amount!;

  logger.info(
    `Minting ${amountAsInput} of SPL Token with mint ${values.mint} to ${values.recipient}.`
  );

  // get the latest blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const mint = address(values.mint!);

  // Get the receipients associated token account
  const ata = await getAssociatedTokenAccountAddress(
    mint,
    recipientAddress,
    TOKEN_PROGRAM_ADDRESS
  );

  const mintAccount = await fetchMint(rpc, mint);
  const DECIMALS = mintAccount.data.decimals;
  const AMOUNT = parseInt(values.amount || "0") * 10 ** DECIMALS;
  const amount = BigInt(AMOUNT);

  const mintSPLTokenTransactionPayload = pipe(
    createTransactionMessage({ version: 0 }),
    // assign transaction feepayer
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    // set transaction blockhash
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    // append transfer instruction and memo with instruction
    (m) =>
      appendTransactionMessageInstructions(
        [
          // create idempotent will gracefully fail if the ata already exists. this is the gold standard!
          getCreateAssociatedTokenIdempotentInstruction({
            owner: recipientAddress,
            mint,
            ata,
            payer: signer,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
          }),
          getMintToInstruction(
            {
              mint,
              mintAuthority: signer.address,
              token: ata,
              amount,
            },
            {
              programAddress: TOKEN_PROGRAM_ADDRESS,
            }
          ),
        ],
        m
      )
  );

  // Request an estimate of the actual compute units this message will consume.
  const getComputeUnitEstimateForTransactionMessage =
    getComputeUnitEstimateForTransactionMessageFactory({
      rpc,
    });
  // Request an estimate of the actual compute units this message will consume.
  let computeUnitsEstimate = await getComputeUnitEstimateForTransactionMessage(
    mintSPLTokenTransactionPayload
  );

  computeUnitsEstimate =
    computeUnitsEstimate < 1000 ? 1000 : Math.ceil(computeUnitsEstimate * 1.2);

  const priorityFee = await getTransactionPriorityFeeEstimate(rpc);
  const finalTransactionMessage = appendTransactionMessageInstructions(
    [
      getSetComputeUnitPriceInstruction({ microLamports: priorityFee }),
      getSetComputeUnitLimitInstruction({ units: 60_000 }),
    ],
    mintSPLTokenTransactionPayload
  );

  const finalSignedTransaction = await signTransactionMessageWithSigners(
    finalTransactionMessage
  );

  const sendSignedTransaction = createTransactionSenderFactory(rpc);

  try {
    spinner.text = `Sending and confirming transaction\n`;
    await sendSignedTransaction(finalSignedTransaction, (update) => {
      const signature = getSignatureFromTransaction(finalSignedTransaction);
      // logger.info(update.status, signature);
      spinner.text = `${update.status}:: ${signature}`;
    }).catch((e) => {
      spinner.fail(e.cause);
      logger.error(e.cause);
      logger.error("Error in sending transaction:", e);
    });

    spinner.succeed(
      `Successfully minted ${amountAsInput} SPL Token mint ${mint.toString()} to ${recipientAddress.toString()}.\n`
    );
    logger.success(
      "Signature",
      getSignatureFromTransaction(finalSignedTransaction)
    );
  } catch (e) {
    handleError(e, finalSignedTransaction);
    throw e;
  } finally {
    spinner.stop();
  }
}

mintSPLToken()
  .catch((error) => {
    spinner.fail("Failed to mint SPL Token.");
    logger.error(error);
  })
  .then(() => {
    logger.success(" Done.");
  });
