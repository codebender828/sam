import { resolve } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "gill";

/**
 * Load a keypair from a file.
 * @param filePath
 * @returns
 */
export async function loadKeypairFromFile(
  filePath: string
): Promise<KeyPairSigner<string>> {
  // This is here so you can also load the default keypair from the file system.
  const resolvedPath = resolve(
    filePath.startsWith("~") ? filePath.replace("~", homedir()) : filePath
  );
  const loadedKeyBytes = Uint8Array.from(
    JSON.parse(readFileSync(resolvedPath, "utf8"))
  );
  // Here you can also set the second parameter to true in case you need to extract your private key.
  const keypairSigner = await createKeyPairSignerFromBytes(loadedKeyBytes);
  return keypairSigner;
}
