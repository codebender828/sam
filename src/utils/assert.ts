import { existsSync } from "fs";

/** Asserts the presence of a given key in an object */
export function assertKeyInObject<T extends Record<string, any>>(
  obj: T,
  key: keyof T,
  errorMessage?: string
): asserts obj is T {
  if (!(key in obj)) {
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    throw new Error(`Key "${String(key)}" not found! Aborting...`);
  }
}

/** Asserts the presence of a given file at that path */
export function assertFileExists(path: string, errorMessage?: string) {
  if (!existsSync(path)) {
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    throw new Error(`File at path "${path}" does not exist! Aborting...`);
  }
}
