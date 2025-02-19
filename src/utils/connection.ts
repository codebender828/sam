import {
  createDefaultRpcTransport,
  createSolanaClient,
  createSolanaRpcFromTransport,
  createSolanaRpcSubscriptions,
  type RpcTransport,
} from "gill";
import type { DevnetUrl, MainnetUrl, TestnetUrl } from "@solana/rpc-types";

export type SAMClusterUrl = string;

export type ClusterConnectionUrl =
  | MainnetUrl
  | DevnetUrl
  | TestnetUrl
  | SAMClusterUrl;

export function createConnection(
  moniker: ClusterConnectionUrl = "devnet",
  WSS_ENDPOINT: string
) {
  const MAX_ATTEMPTS = 4;

  // Create the default transport.
  const defaultTransport = createDefaultRpcTransport({
    url: moniker,
  });

  // Sleep function to wait for a given number of milliseconds.
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Calculate the delay for a given attempt.
  function calculateRetryDelay(attempt: number): number {
    // Exponential backoff with a maximum of 1.5 seconds.
    return Math.min(100 * Math.pow(2, attempt), 1500);
  }

  // A retrying transport that will retry up to MAX_ATTEMPTS times before failing.
  async function retryingTransport<TResponse>(
    ...args: Parameters<RpcTransport>
  ): Promise<TResponse> {
    let requestError;
    for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
      try {
        return await defaultTransport(...args);
      } catch (err) {
        requestError = err;
        // Only sleep if we have more attempts remaining.
        if (attempts < MAX_ATTEMPTS - 1) {
          const retryDelay = calculateRetryDelay(attempts);
          await sleep(retryDelay);
        }
      }
    }
    throw requestError;
  }

  const rpc = createSolanaRpcFromTransport(retryingTransport);
  const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_ENDPOINT);

  return {
    rpc,
    rpcSubscriptions,
  };
}
