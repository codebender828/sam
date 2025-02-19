import { getSystemErrorMessage, isSystemError } from "@solana-program/system";
import {
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  isSolanaError,
} from "@solana/errors";
import {
  SolanaError,
  type FullySignedTransaction,
  type TransactionWithBlockhashLifetime,
} from "@solana/web3.js";
import consola from "consola";

export function handleError(
  e: unknown,
  transactionMessage?: FullySignedTransaction & TransactionWithBlockhashLifetime
) {
  if (
    isSolanaError(
      e,
      SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE
    )
  ) {
    const preflightErrorContext = e.context;
    const preflightErrorMessage = e.message;

    const errorDetailMessage = transactionMessage
      ? // @ts-ignore
        isSystemError(e.cause, transactionMessage)
        ? getSystemErrorMessage(e.cause.context.code)
        : e.cause
        ? e.cause.message
        : ""
      : e.message;

    consola.error(
      preflightErrorContext,
      "%s: %s",
      preflightErrorMessage,
      errorDetailMessage
    );
  } else {
    throw e;
  }
}
