/**
 * core.js — Gear5 Client-Side Wallet Core
 * Handles cryptography, persistence (localStorage), and transactions in the browser.
 */

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const STORAGE_KEY = "g5_wallet_keystore";
const TX_KEY = "g5_tx_history";

let provider;
let currentWallet = null;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

/**
 * Creates a new random wallet, encrypts it with the password, and saves to localStorage.
 */
async function createWallet(password) {
  if (!password || password.length < 1) throw new Error("Password is required.");

  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic.phrase;

  // Encrypt the wallet into a Keystore JSON standard
  const encryptedKeystore = await wallet.encrypt(password);
  
  localStorage.setItem(STORAGE_KEY, encryptedKeystore);
  
  // Also store a plain text flag for quick check if a wallet exists on device
  localStorage.setItem("g5_has_wallet", "true");

  return {
    address: wallet.address,
    mnemonic: mnemonic,
  };
}

/**
 * Imports a wallet from a mnemonic phrase, encrypts it, and saves to localStorage.
 */
async function importWallet(mnemonic, password) {
  if (!mnemonic || mnemonic.trim().split(/\s+/).length < 12) {
    throw new Error("Provide a valid 12-word mnemonic phrase.");
  }
  if (!password) throw new Error("Password is required.");

  let wallet;
  try {
    wallet = ethers.Wallet.fromPhrase(mnemonic.trim());
  } catch {
    throw new Error("Invalid mnemonic phrase.");
  }

  const encryptedKeystore = await wallet.encrypt(password);
  localStorage.setItem(STORAGE_KEY, encryptedKeystore);
  localStorage.setItem("g5_has_wallet", "true");

  return { address: wallet.address };
}

/**
 * Loads the keystore from localStorage and decrypts it with the password.
 * Keeps the decrypted wallet in memory for the session.
 */
async function login(password) {
  const keystore = localStorage.getItem(STORAGE_KEY);
  if (!keystore) throw new Error("No wallet found. Please create or import one.");

  try {
    const wallet = await ethers.Wallet.fromEncryptedJson(keystore, password);
    currentWallet = wallet.connect(getProvider());
    return { address: currentWallet.address };
  } catch (err) {
    throw new Error("Invalid password.");
  }
}

/**
 * Helper to check if a wallet exists on device.
 */
function hasWallet() {
  return localStorage.getItem("g5_has_wallet") === "true";
}

/**
 * Fetch ETH balance for an address
 */
async function getBalance(address) {
  const prov = getProvider();
  const raw = await prov.getBalance(address);
  return ethers.formatEther(raw);
}

/**
 * Estimate Gas
 */
async function estimateGas(toAddress, amountEth) {
  if (!currentWallet) throw new Error("Wallet not connected.");
  const prov = getProvider();
  const feeData = await prov.getFeeData();

  const gasLimit = await prov.estimateGas({
    from: currentWallet.address,
    to: toAddress,
    value: ethers.parseEther(String(amountEth)),
  });

  const gasPriceWei = feeData.gasPrice || feeData.maxFeePerGas;
  const gasCostWei = gasLimit * gasPriceWei;
  const gasCostEth = ethers.formatEther(gasCostWei);
  const gasPriceGwei = ethers.formatUnits(gasPriceWei, "gwei");

  return {
    gasLimit: gasLimit.toString(),
    gasPrice: gasPriceGwei + " Gwei",
    gasCostEth,
    maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, "gwei") + " Gwei" : null,
  };
}

/**
 * Send ETH
 */
async function sendEth(toAddress, amountEth) {
  if (!currentWallet) throw new Error("Wallet not connected.");
  if (!ethers.isAddress(toAddress)) throw new Error("Invalid recipient address.");

  const amountWei = ethers.parseEther(String(amountEth));
  const balanceWei = await currentWallet.provider.getBalance(currentWallet.address);

  if (balanceWei < amountWei) {
    throw new Error("Insufficient balance.");
  }

  const tx = await currentWallet.sendTransaction({
    to: toAddress,
    value: amountWei,
  });

  const receipt = await tx.wait(1);
  const newBalance = ethers.formatEther(await currentWallet.provider.getBalance(currentWallet.address));

  const record = {
    txHash: receipt.hash,
    from: currentWallet.address,
    to: toAddress,
    amount: amountEth,
    gasUsed: receipt.gasUsed.toString(),
    status: receipt.status === 1 ? "success" : "failed",
    timestamp: new Date().toISOString(),
    balance: newBalance,
    network: "sepolia",
  };

  appendTxHistory(record);
  return record;
}

/**
 * Transaction History (localStorage)
 */
function appendTxHistory(record) {
  let history = getTxHistory();
  history.unshift(record);
  localStorage.setItem(TX_KEY, JSON.stringify(history));
}

function getTxHistory() {
  const data = localStorage.getItem(TX_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Network Info
 */
async function getNetworkInfo() {
  const prov = getProvider();
  const network = await prov.getNetwork();
  const block = await prov.getBlockNumber();
  const feeData = await prov.getFeeData();

  return {
    name: network.name,
    chainId: network.chainId.toString(),
    block,
    gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, "gwei") + " Gwei" : "N/A",
  };
}

/**
 * Logout - wipe session memory
 */
function logout() {
  currentWallet = null;
  sessionStorage.removeItem("g5_address");
  sessionStorage.removeItem("g5_balance");
}

window.Core = {
  createWallet,
  importWallet,
  login,
  hasWallet,
  getBalance,
  estimateGas,
  sendEth,
  getTxHistory,
  getNetworkInfo,
  logout
};
