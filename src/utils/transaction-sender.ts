import {
  createSolanaRpcFromTransport,
  getSignatureFromTransaction,
  sendTransactionWithoutConfirmingFactory,
  type Commitment,
  type FullySignedTransaction,
  type GetSignatureStatusesApi,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
  type TransactionWithBlockhashLifetime,
} from "@solana/web3.js";

// A minute of retries, with 2 second intervals
const RETRY_INTERVAL_MS = 2000;
const MAX_RETRIES = 30;

type TxStatusUpdate =
  | { status: "created" }
  | { status: "signed" }
  | { status: "sent"; signature: string }
  | { status: "confirmed"; result: any };

type SignatureStatus = ReturnType<
  GetSignatureStatusesApi["getSignatureStatuses"]
>["value"];

export function createTransactionSenderFactory(
  rpc: ReturnType<typeof createSolanaRpcFromTransport>
) {
  const sendTransaction = sendTransactionWithoutConfirmingFactory({
    rpc,
  });

  return async function sendSignedTransaction(
    signedTransaction: FullySignedTransaction &
      TransactionWithBlockhashLifetime,
    onStatusUpdate?: (status: TxStatusUpdate) => void
  ) {
    onStatusUpdate?.({ status: "created" });

    let retries = 0;
    let signature: Signature | null = null;
    let status: SignatureStatus | null = null;

    while (retries < MAX_RETRIES) {
      await Promise.all([
        (async () => {
          try {
            const isFirstSend = signature === null;

            await sendTransaction(signedTransaction, {
              commitment: "confirmed",
              maxRetries: BigInt(0),
              skipPreflight: true,
            });

            signature = getSignatureFromTransaction(signedTransaction);

            if (isFirstSend) {
              onStatusUpdate?.({ status: "sent", signature });
            }
          } catch (e) {
            console.error(e);
          }
        })(),
        (async () => {
          if (signature) {
            try {
              const response = await rpc
                .getSignatureStatuses([signature])
                .send();
              if (response.value) {
                status = response.value;
              }
            } catch (e) {
              console.error(e);
            }
          }
        })(),
      ]);

      retries++;

      if (
        status &&
        (status as SignatureStatus).find((status) =>
          (["confirmed", "finalized"] as Commitment[]).includes(
            // @ts-expect-error status type is not perfect
            status?.confirmationStatus
          )
        )
      ) {
        onStatusUpdate?.({ status: "confirmed", result: status });
        return signature as unknown as Signature;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  };
}
