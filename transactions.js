/**
 * transactions.js — Gear5 Transaction Engine
 * Handles: balance, send ETH, gas estimation, tx history on Sepolia
 */

const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL   = "https://ethereum-sepolia-rpc.publicnode.com";
const TX_LOG    = "tx_history.json";

function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

/* ─── Balance ────────────────────────────────────────────────────────────── */

async function getBalance(address) {
  const provider = getProvider();
  const raw = await provider.getBalance(address);
  return ethers.formatEther(raw); // returns string in ETH
}

/* ─── Gas Estimation ─────────────────────────────────────────────────────── */

async function estimateGas(fromAddress, toAddress, amountEth) {
  const provider = getProvider();
  const feeData  = await provider.getFeeData();

  const gasLimit = await provider.estimateGas({
    from:  fromAddress,
    to:    toAddress,
    value: ethers.parseEther(String(amountEth)),
  });

  const gasPriceWei  = feeData.gasPrice || feeData.maxFeePerGas;
  const gasCostWei   = gasLimit * gasPriceWei;
  const gasCostEth   = ethers.formatEther(gasCostWei);
  const gasPriceGwei = ethers.formatUnits(gasPriceWei, "gwei");

  return {
    gasLimit:     gasLimit.toString(),
    gasPrice:     gasPriceGwei + " Gwei",
    gasCostEth,
    maxFeePerGas: feeData.maxFeePerGas
      ? ethers.formatUnits(feeData.maxFeePerGas, "gwei") + " Gwei"
      : null,
  };
}

/* ─── Send ETH ───────────────────────────────────────────────────────────── */

async function sendEth(wallet, toAddress, amountEth) {
  if (!ethers.isAddress(toAddress)) {
    throw new Error("Invalid recipient address.");
  }

  const amountWei = ethers.parseEther(String(amountEth));

  // Check balance before sending
  const balanceWei = await wallet.provider.getBalance(wallet.address);
  if (balanceWei < amountWei) {
    throw new Error("Insufficient balance.");
  }

  const tx = await wallet.sendTransaction({
    to:    toAddress,
    value: amountWei,
  });

  // Wait for 1 confirmation
  const receipt = await tx.wait(1);

  const newBalance = ethers.formatEther(
    await wallet.provider.getBalance(wallet.address)
  );

  const record = {
    txHash:    receipt.hash,
    from:      wallet.address,
    to:        toAddress,
    amount:    amountEth,
    gasUsed:   receipt.gasUsed.toString(),
    status:    receipt.status === 1 ? "success" : "failed",
    timestamp: new Date().toISOString(),
    balance:   newBalance,
    network:   "sepolia",
  };

  // Append to local tx history
  appendTxHistory(record);

  return record;
}

/* ─── TX History ─────────────────────────────────────────────────────────── */

function appendTxHistory(record) {
  let history = [];
  if (fs.existsSync(TX_LOG)) {
    try { history = JSON.parse(fs.readFileSync(TX_LOG, "utf8")); } catch {}
  }
  history.unshift(record); // newest first
  fs.writeFileSync(TX_LOG, JSON.stringify(history, null, 2));
}

function getTxHistory() {
  if (!fs.existsSync(TX_LOG)) return [];
  try { return JSON.parse(fs.readFileSync(TX_LOG, "utf8")); } catch { return []; }
}

/* ─── Network Info ───────────────────────────────────────────────────────── */

async function getNetworkInfo() {
  const provider = getProvider();
  const network  = await provider.getNetwork();
  const block    = await provider.getBlockNumber();
  const feeData  = await provider.getFeeData();

  return {
    name:       network.name,
    chainId:    network.chainId.toString(),
    block,
    gasPrice:   feeData.gasPrice
      ? ethers.formatUnits(feeData.gasPrice, "gwei") + " Gwei"
      : "N/A",
  };
}

module.exports = { getBalance, estimateGas, sendEth, getTxHistory, getNetworkInfo };