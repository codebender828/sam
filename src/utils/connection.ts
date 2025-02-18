import { createSolanaClient } from "gill";
import type { DevnetUrl, MainnetUrl, TestnetUrl } from "@solana/rpc-types";

export type SAMClusterUrl = string;

export type ClusterConnectionUrl =
  | MainnetUrl
  | DevnetUrl
  | TestnetUrl
  | SAMClusterUrl;

export function createConnection(moniker: ClusterConnectionUrl = "devnet") {
  return createSolanaClient({
    urlOrMoniker: moniker,
  });
}
