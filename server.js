/**
 * server.js — Gear5 Express API Server
 * Serves index.html, dashboard.html, style.css and all wallet/transaction APIs.
 */

const express = require("express");
const path    = require("path");
const fs      = require("fs");
const { execSync } = require("child_process");
const { createWallet, importWallet, loadWallet, getWalletMeta } = require("./wallet");
const { getBalance, estimateGas, sendEth, getTxHistory, getNetworkInfo } = require("./transactions");

/* ─── Auto-extract favicon zip if present ───────────────────────────────── */
function tryExtractFavicon() {
  const zipPaths = [
    path.join(__dirname, "favicon_io.zip"),
    path.join(process.env.USERPROFILE || "C:\\Users\\KiTE", "Downloads", "favicon_io.zip")
  ];
  for (const zipPath of zipPaths) {
    if (fs.existsSync(zipPath)) {
      try {
        const psPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
        execSync(`"${psPath}" -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${__dirname}' -Force"`);
        console.log(`[Favicon] Auto-extracted ${zipPath} to ${__dirname}`);
        break;
      } catch (err) {
        console.error(`[Favicon] Extraction error:`, err.message);
      }
    }
  }
}
tryExtractFavicon();

const app  = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ─── Wallet state (in-memory for the session) ───────────────────────────── */
let _sessionWallet = null; // ethers.Wallet — set after unlock

function requireWallet(res) {
  if (!_sessionWallet) {
    res.json({ success: false, error: "Wallet locked. Please login first." });
    return false;
  }
  return true;
}

/* ─── Routes ─────────────────────────────────────────────────────────────── */

/** POST /create-wallet  { password } → { success, address, mnemonic, balance } */
app.post("/create-wallet", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.json({ success: false, error: "Password required." });

    const { address, mnemonic } = createWallet(password);

    // Auto-unlock session
    _sessionWallet = loadWallet(password);
    const balance  = await getBalance(address);

    res.json({ success: true, address, mnemonic, balance });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** POST /import-wallet  { mnemonic, password } → { success, address, balance } */
app.post("/import-wallet", async (req, res) => {
  try {
    const { mnemonic, password } = req.body;
    const { address } = importWallet(mnemonic, password);

    _sessionWallet = loadWallet(password);
    const balance  = await getBalance(address);

    res.json({ success: true, address, balance });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** POST /login  { password } → { success, address, balance } */
app.post("/login", async (req, res) => {
  try {
    const { password } = req.body;
    _sessionWallet = loadWallet(password);
    const meta    = getWalletMeta();
    const balance = await getBalance(meta.address);
    res.json({ success: true, address: meta.address, balance });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** GET /wallet-meta → { address, network } or null */
app.get("/wallet-meta", (req, res) => {
  res.json(getWalletMeta());
});

/** GET /balance → { success, balance } */
app.get("/balance", async (req, res) => {
  try {
    if (!requireWallet(res)) return;
    const balance = await getBalance(_sessionWallet.address);
    res.json({ success: true, balance, address: _sessionWallet.address });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** POST /estimate-gas  { to, amount } → { success, gasLimit, gasPrice, gasCostEth } */
app.post("/estimate-gas", async (req, res) => {
  try {
    if (!requireWallet(res)) return;
    const { to, amount } = req.body;
    const gas = await estimateGas(_sessionWallet.address, to, amount);
    res.json({ success: true, ...gas });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** POST /send  { to, amount } → { success, txHash, from, to, amount, gasUsed, balance } */
app.post("/send", async (req, res) => {
  try {
    if (!requireWallet(res)) return;
    const { to, amount } = req.body;
    if (!to || !amount) return res.json({ success: false, error: "to and amount required." });

    const record = await sendEth(_sessionWallet, to, parseFloat(amount));
    res.json({ success: true, ...record });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** GET /tx-history → [ ...tx records ] */
app.get("/tx-history", (req, res) => {
  res.json({ success: true, transactions: getTxHistory() });
});

/** GET /network → { name, chainId, block, gasPrice } */
app.get("/network", async (req, res) => {
  try {
    const info = await getNetworkInfo();
    res.json({ success: true, ...info });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/** POST /logout */
app.post("/logout", (req, res) => {
  _sessionWallet = null;
  res.json({ success: true });
});

/* ─── Start ──────────────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n  ⚙  Gear5 server running → http://localhost:${PORT}\n`);
});
