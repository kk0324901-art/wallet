/**
 * wallet.js — Gear5 Wallet Core
 * Handles: create wallet (mnemonic + password), import wallet (mnemonic), persist to wallet.json
 */

const { ethers } = require("ethers");
const fs = require("fs");
const crypto = require("crypto");

const WALLET_FILE = "wallet.json";
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

/* ─── Encryption helpers ─────────────────────────────────────────────────── */

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encrypt(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const iv   = crypto.randomBytes(12);
  const key  = deriveKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return {
    salt: salt.toString("hex"),
    iv:   iv.toString("hex"),
    tag:  tag.toString("hex"),
    data: enc.toString("hex"),
  };
}

function decrypt(encrypted, password) {
  const { salt, iv, tag, data } = encrypted;
  const key    = deriveKey(password, Buffer.from(salt, "hex"));
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm", key, Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Create a brand-new wallet, encrypt private key + mnemonic with password,
 * persist to wallet.json, return { address, mnemonic }.
 */
function createWallet(password) {
  if (!password || password.length < 1) {
    throw new Error("Password is required.");
  }

  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic.phrase;

  const payload = {
    address:   wallet.address,
    publicKey: wallet.signingKey.publicKey,
    encrypted: encrypt(wallet.privateKey, password),
    // mnemonic stored separately (also encrypted)
    mnemEncrypted: encrypt(mnemonic, password),
    createdAt: new Date().toISOString(),
    network: "sepolia",
  };

  fs.writeFileSync(WALLET_FILE, JSON.stringify(payload, null, 2));

  return {
    address:  wallet.address,
    mnemonic, // shown once to user
  };
}

/**
 * Import an existing wallet from a 12-word mnemonic + password.
 * Encrypts and saves to wallet.json.
 */
function importWallet(mnemonic, password) {
  if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
    throw new Error("Provide a valid 12-word mnemonic phrase.");
  }
  if (!password) {
    throw new Error("Password is required.");
  }

  let wallet;
  try {
    wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  } catch {
    throw new Error("Invalid mnemonic phrase.");
  }

  const payload = {
    address:       wallet.address,
    publicKey:     wallet.signingKey.publicKey,
    encrypted:     encrypt(wallet.privateKey, password),
    mnemEncrypted: encrypt(mnemonic.trim(), password),
    importedAt:    new Date().toISOString(),
    network:       "sepolia",
  };

  fs.writeFileSync(WALLET_FILE, JSON.stringify(payload, null, 2));

  return { address: wallet.address };
}

/**
 * Load wallet from wallet.json and unlock with password.
 * Returns an ethers.Wallet connected to Sepolia.
 */
function loadWallet(password) {
  if (!fs.existsSync(WALLET_FILE)) {
    throw new Error("No wallet found. Please create or import a wallet.");
  }

  const data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  let privateKey;
  try {
    privateKey = decrypt(data.encrypted, password);
  } catch {
    throw new Error("Invalid password.");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Read wallet metadata (address, network) without decrypting.
 */
function getWalletMeta() {
  if (!fs.existsSync(WALLET_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"));
  return { address: data.address, network: data.network || "sepolia" };
}

module.exports = { createWallet, importWallet, loadWallet, getWalletMeta };