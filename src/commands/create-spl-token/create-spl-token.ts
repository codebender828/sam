import { parseArgs } from "util";
import spinners from "cli-spinners";
import { createConnection } from "../../utils/connection";
import { createLogger } from "../../utils/logger";
import { assertFileExists, assertKeyInObject } from "../../utils/assert";
import { resolve } from "path";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    url: {
      type: "string",
    },
    keypair: {
      type: "string",
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

export function createSPLToken() {
  const { url, metadataUri } = values;
  if (url) logger.info("Using connection URL", url);

  const connection = createConnection(url);

  assertKeyInObject(values, "metadataUri", "Metadata URI is required.");
  assertKeyInObject(values, "keypair", "Path to keypair is required.");
  const pathToKeypair = resolve(values.keypair!);
  assertFileExists(
    pathToKeypair,
    `Unable to locate keypair file at path ${pathToKeypair}. Aborting.`
  );

  logger.info("Creating SPL token with metadata URI", metadataUri);
}
