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
  getMintSize,
  getInitializeMintInstruction,
} from "@solana-program/token";

import { createTransactionSenderFactory } from "../../utils/transaction-sender";
import { handleError } from "../../utils/errors";
import { loadKeypairFromFile } from "../../utils/loaders/keypair";

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
    name: {
      type: "string",
    },
    symbol: {
      type: "string",
    },
    decimals: {
      type: "string",
      default: "9",
    },
    metadataUri: {
      type: "string",
      required: true,
    },
  },
  strict: true,
  allowPositionals: true,
});

const logger = createLogger("create_spl_token");
let spinner: Ora;

export async function createSPLToken() {
  spinner = ora("Creating SPL Token\n").start();

  assertKeyInObject(values, "metadataUri", "Metadata URI is required.");
  assertKeyInObject(values, "keypair", "Path to keypair is required.");
  assertKeyInObject(values, "name", "Token name is required.");
  assertKeyInObject(values, "symbol", "Token symbol is required.");
  assertKeyInObject(values, "url", "RPC url is required.");

  const { url, wsUrl, metadataUri } = values;
  const websocketsUrl = values.wsUrl || url!.replace("http", "ws");

  logger.info("Using connection URL", url);
  logger.info("Using websockets URL", websocketsUrl, wsUrl ? "" : "(computed)");

  const { rpc } = createConnection(url, websocketsUrl!);

  const pathToKeypair = resolve(values.keypair!);
  assertFileExists(
    pathToKeypair,
    `Unable to locate keypair file at path ${pathToKeypair}. Aborting.`
  );

  const pathToMintKeypair = resolve(values.mint!);
  assertFileExists(
    pathToMintKeypair,
    `Unable to locate mint address keypair file at path ${pathToMintKeypair}. Aborting.`
  );

  // if (!isAddress(values.mint!))
  //   throw new Error("Invalid mint address provided. Aborting...");

  logger.info(
    `Creating SPL token mint ${values.mint} with metadata URI: ${metadataUri}`
  );

  // Signer keypair
  const signer = await loadKeypairFromFile(pathToKeypair);

  // get the latest blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const decimals = parseInt(values.decimals!);

  const name = values.name!;
  const symbol = values.symbol!;

  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());

  let metadataAddress = mint.address;
  // If we use token metadata program v3, we need to create a metadata account
  metadataAddress = await getTokenMetadataAddress(mint);

  const createSPLTokenTransactionPayload = pipe(
    createTransactionMessage({ version: 0 }),
    // assign transaction feepayer
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    // set transaction blockhash
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    // append transfer instruction and memo with instruction
    (m) =>
      appendTransactionMessageInstructions(
        [
          getCreateAccountInstruction({
            payer: signer,
            newAccount: mint,
            lamports: getMinimumBalanceForRentExemption(space),
            space,
            programAddress: TOKEN_PROGRAM_ADDRESS,
          }),
          getInitializeMintInstruction({
            mint: mint.address,
            decimals: Number(decimals),
            mintAuthority: signer.address,
            freezeAuthority: null,
          }),
          getCreateMetadataAccountV3Instruction({
            metadata: metadataAddress,
            mint: mint.address,
            mintAuthority: signer,
            payer: signer,
            updateAuthority: signer,
            data: {
              name: name,
              symbol: symbol,
              uri: metadataUri!,
              sellerFeeBasisPoints: 0,
              creators: null,
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          }),
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
    createSPLTokenTransactionPayload
  );

  computeUnitsEstimate =
    computeUnitsEstimate < 1000 ? 1000 : Math.ceil(computeUnitsEstimate * 1.2);

  const priorityFee = await getTransactionPriorityFeeEstimate(rpc);
  const finalTransactionMessage = appendTransactionMessageInstructions(
    [
      getSetComputeUnitPriceInstruction({ microLamports: priorityFee }),
      getSetComputeUnitLimitInstruction({ units: 60_000 }),
    ],
    createSPLTokenTransactionPayload
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

    spinner.succeed(`Successfully minted token mint ${mint.address}\n`);
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

createSPLToken()
  .catch((error) => {
    spinner.fail("Failed to create SPL Token.");
    logger.error(error);
  })
  .then(() => {
    logger.success(" Done.");
  });
