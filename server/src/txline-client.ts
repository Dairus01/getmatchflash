import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TXLINE_API_BASE = "https://txline-dev.txodds.com/api";
export type TxlineCredentials = { jwt: string; apiToken: string };
export async function loadTxlineCredentials(): Promise<TxlineCredentials> {
  return JSON.parse(await readFile(resolve(".data/txline-credentials.json"), "utf8")) as TxlineCredentials;
}
export function txlineRequest(url: string, credentials: TxlineCredentials, signal?: AbortSignal) {
  return fetch(url, { headers: { Accept: "text/event-stream", Authorization: `Bearer ${credentials.jwt}`, "X-Api-Token": credentials.apiToken }, signal });
}
