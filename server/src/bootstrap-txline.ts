import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";

const API_ORIGIN = "https://txline-dev.txodds.com";
const API_BASE = `${API_ORIGIN}/api`;
const PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const SERVICE_LEVEL_ID = 1;
const DURATION_WEEKS = 4;
const SELECTED_LEAGUES: number[] = [];
const walletPath = resolve(".data/devnet-wallet.json");
const credentialsPath = resolve(".data/txline-credentials.json");
const execFileAsync = promisify(execFile);

type GuestSession = { token: string };

async function loadOrCreateWallet(): Promise<Keypair> {
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(walletPath, "utf8"))));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const wallet = Keypair.generate();
    await mkdir(dirname(walletPath), { recursive: true });
    await writeFile(walletPath, JSON.stringify([...wallet.secretKey]), { mode: 0o600 });
    return wallet;
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const headers = new Headers(init?.headers);
  const args = ["-sS", "--fail-with-body", "--max-time", "30", "-X", init?.method ?? "GET"];
  for (const [name, value] of headers) args.push("-H", `${name}: ${value}`);
  if (init?.body) args.push("--data-raw", String(init.body));
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim();
  } catch (error: unknown) {
    const details = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new Error(`curl request failed: ${details.stderr ?? details.stdout ?? details.message}`);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return JSON.parse(await fetchText(url, init)) as T;
}

function subscribeInstruction(wallet: Keypair, userTokenAccount: PublicKey): TransactionInstruction {
  const [pricingMatrix] = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")], PROGRAM_ID);
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], PROGRAM_ID);
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_MINT, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  // Anchor discriminator from the current official devnet IDL, followed by u16 LE service level and u8 weeks.
  const data = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53, SERVICE_LEVEL_ID, 0, DURATION_WEEKS]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: TXL_MINT, isSigner: false, isWritable: false },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryVault, isSigner: false, isWritable: true },
      { pubkey: tokenTreasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const wallet = await loadOrCreateWallet();
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  console.log("Wallet:", wallet.publicKey.toBase58());

  const balance = await connection.getBalance(wallet.publicKey, "confirmed");
  if (balance < 20_000_000) {
    const signature = await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);
    const latest = await connection.getLatestBlockhash("confirmed");
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    console.log("Airdrop:", signature);
  }

  const guest = await fetchJson<GuestSession>(`${API_ORIGIN}/auth/guest/start`, { method: "POST" });
  console.log("Guest JWT acquired");
  const userTokenAccount = getAssociatedTokenAddressSync(
    TXL_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const transaction = new Transaction();
  if (!(await connection.getAccountInfo(userTokenAccount, "confirmed"))) {
    transaction.add(createAssociatedTokenAccountInstruction(
      wallet.publicKey, userTokenAccount, wallet.publicKey, TXL_MINT,
      TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    ));
  }
  transaction.add(subscribeInstruction(wallet, userTokenAccount));
  const txSig = await sendAndConfirmTransaction(connection, transaction, [wallet], { commitment: "confirmed" });
  console.log("Subscription transaction:", txSig);

  const message = new TextEncoder().encode(`${txSig}:${SELECTED_LEAGUES.join(",")}:${guest.token}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, wallet.secretKey)).toString("base64");
  console.log("Calling activation endpoint once");
  const activation = await fetchText(`${API_BASE}/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.token}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
  });
  console.log("Activation endpoint returned a response");
  const apiToken = activation;
  if (!apiToken.startsWith("txoracle_ap")) throw new Error("Activation response did not include an API token");
  await writeFile(credentialsPath, JSON.stringify({ jwt: guest.token, apiToken, activatedAt: new Date().toISOString() }), { mode: 0o600 });
  console.log("Activation response: txoracle_ap… [token received and redacted]");
  const fixtures = await fetchJson<unknown[]>(`${API_BASE}/fixtures/snapshot`, {
    headers: { Authorization: `Bearer ${guest.token}`, "X-Api-Token": apiToken },
  });
  console.log("FIXTURES_JSON", JSON.stringify(fixtures.slice(0, 3), null, 2));
}

main().catch((error) => {
  console.error("TxLINE bootstrap failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
