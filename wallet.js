const { ethers } = require("ethers");
const fs = require("fs");

const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const FILE = "wallet.json";

const TransactionID = "0xc97B3E67d00D0D2A7ca9644729ee270A483788BF";
const AMOUNT = "0"; // ETH

async function main() {
  // Load wallet
  if (!fs.existsSync(FILE)) {
    console.log("wallet.json not found. Run wallet creation first.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(FILE));
  const wallet = new ethers.Wallet(
    data.privateKey,
    new ethers.JsonRpcProvider(RPC_URL)
  );

  // Check balance
  const balance = await wallet.provider.getBalance(wallet.address);

  console.log("From   :", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  // Create transaction
  const tx = await wallet.sendTransaction({
    to: TransactionID,
    value: ethers.parseEther(AMOUNT)
  });

  console.log("Transaction sent!");
  console.log("TX Hash:", tx.hash);

  // Wait for confirmation
  await tx.wait();

  console.log("Transaction confirmed!");
  console.log("Current balance:", ethers.formatEther(await wallet.provider.getBalance(wallet.address)), "ETH");
}

main().catch(console.error);
