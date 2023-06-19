// Const and var declarations

const ethers = require("ethers");
const prompt = require("prompt-sync")();

const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/4a955e6b63944eb2a26701fddfd4f222");

const poolABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function fee() external view returns (uint24)",
];

const quoterAddy = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const UniQuoterABI = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json").abi;
const quoterContract = new ethers.Contract(quoterAddy, UniQuoterABI, provider);

const depthInfo = getFile("../TriangularArbitrageSpotterDEX/uniswap_surface_rates.json");
const fileJasonArray = JSON.parse(depthInfo);

let pausedAT = 0;

start();

// Main menu

async function start () {

  let exit = 0;

  while (exit == 0) {

    console.log("\nMain Menu:\n");
    console.log("1. Get depth from item 1.");
    console.log("2. Resume depth gathering (Item",(pausedAT+1),"out of",fileJasonArray.length,")");
    console.log("3. Exit.");
  
    const input = prompt("\nOption: ");
  
    if (parseInt(input) == 1) {

      await getDepth(1,0);

    } else if (parseInt(input) == 2) {

      console.log("\n1. Start from item",(pausedAT+1));
      console.log("2. Start from desired item.");
      console.log("3. Cancel.");
      
      const input2 = prompt("\nOption: ");

      if (input2 == 1) {

        await getDepth(1,pausedAT);

      } else if (input2 == 2) {

        const input3 = prompt("\Start from item: ");

        await getDepth(1,input3);

      }

    } else if (parseInt(input) == 3) {

      console.log("\nTerminating script...");
      return;
    }  
  }

}

function getFile (path) {

  const fs = require("fs");

  try {

    const data = fs.readFileSync(path, "utf-8");
    return data;

  } catch (err) {

    return [];

  }

}

// This function will calculate the results of each trade taking in consideration the liquidity available on-chain

async function getDepth (amountIn,firstItem) {

  console.log("\nReading surface rate information...");
  
  let lastItem = fileJasonArray.length;

  fileJasonArraylist = fileJasonArray.slice(firstItem, lastItem);

  for (let i = firstItem; i < fileJasonArraylist.length; i++) {

    let pair1CA = fileJasonArray[i].poolContract1;
    let pair2CA = fileJasonArray[i].poolContract2;
    let pair3CA = fileJasonArray[i].poolContract3;
    let tradeDirection1 = fileJasonArray[i].poolDirectionTrade1;
    let tradeDirection2 = fileJasonArray[i].poolDirectionTrade2;
    let tradeDirection3 = fileJasonArray[i].poolDirectionTrade3;

    pausedAT = i;

    console.log("\nArbitrage",firstItem,"out of",(fileJasonArray.length+1));
    console.log("\n************");

    console.log("Checking Trade N°1. Pool Contract:", pair1CA);

    let acquiredCoinDetailT1 = await getPrice(pair1CA, amountIn, tradeDirection1);

    console.log("Checking Trade N°2. Pool Contract:", pair2CA);
    if (acquiredCoinDetailT1 == 0) {return}
    let acquiredCoinDetailT2 = await getPrice(pair2CA, acquiredCoinDetailT1, tradeDirection2);

    console.log("Checking Trade N°3. Pool Contract:", pair3CA);
    if (acquiredCoinDetailT2 == 0) {return}
    let acquiredCoinDetailT3 = await getPrice(pair3CA, acquiredCoinDetailT2, tradeDirection3);

    calculateArbi(amountIn, acquiredCoinDetailT3, fileJasonArraylist[i])

    console.log("************");

  }

  return;

}

async function getPrice (pairCA, amountIn, tradeDirection) {

  const address = pairCA;

  const poolContract = new ethers.Contract(address, poolABI, provider);

  let token0Addy = await poolContract.token0();
  let token1Addy = await poolContract.token1();
  let poolFee = await poolContract.fee();

  let addysArray = [token0Addy, token1Addy];
  let tokenInfoArray = [];

  for (let i = 0; i < addysArray.length; i++) {

    let tokenAddy = addysArray[i];
    let tokenABI = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint)",
    ];

    let contract = new ethers.Contract(tokenAddy, tokenABI, provider);

    let tokenSymbol = await contract.symbol();
    let tokenName = await contract.name();
    let tokenDecimals = await contract.decimals();
    
    let obj = {
      id: "Token" + i,
      tokenAddy: tokenAddy,
      tokenSymbol: tokenSymbol,
      tokenName: tokenName,
      tokenDecimals: tokenDecimals
    }

    tokenInfoArray.push(obj);

  }

  let inputTokenA = "";
  let inputDecimalsA = 0;
  let inputTokenB = "";
  let inputDecimalsB = 0;

  if (tradeDirection == 'baseToQuote') {

    inputTokenA = tokenInfoArray[0].tokenAddy;
    inputDecimalsA = tokenInfoArray[0].tokenDecimals;
    inputTokenB = tokenInfoArray[1].tokenAddy;
    inputDecimalsB = tokenInfoArray[1].tokenDecimals;

    console.log(tokenInfoArray[0].tokenAddy," to ",tokenInfoArray[1].tokenAddy);

  } else {

    inputTokenA = tokenInfoArray[1].tokenAddy;
    inputDecimalsA = tokenInfoArray[1].tokenDecimals;
    inputTokenB = tokenInfoArray[0].tokenAddy;
    inputDecimalsB = tokenInfoArray[0].tokenDecimals;

    console.log(tokenInfoArray[1].tokenAddy," to ",tokenInfoArray[0].tokenAddy);

  }

  if (!isNaN(amountIn)) { 
    amountIn = amountIn.toString();
  }

  let amtIn = ethers.utils.parseUnits(amountIn,inputDecimalsA).toString();

  let quotedAmountOut = 0;

  try {

    quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
      inputTokenA,
      inputTokenB,
      poolFee,
      amtIn,
      0)

  } catch (err) {
    return 0;
  }

  let outputAmount = ethers.utils.formatUnits(quotedAmountOut, inputDecimalsB).toString();

  return outputAmount;

}

async function calculateArbi (amountIn, amountOut) {

  let profitLoss = amountOut - amountIn;
  let profitLossPercent = (profitLoss/amountIn) * 100

  console.log("\nStarting with:",amountIn,", Ending with:",amountOut,", PnL:",profitLossPercent,"%");

}
