"use server";

import { logError } from "@/lib/logger";

export async function logClientError(message: string, digest?: string) {
  logError("client-error-boundary", new Error(message), { digest });
}
