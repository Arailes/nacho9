// Main

const ethers = require("ethers");
const UniQuoterABI = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json").abi;

function getFile (path) {

  const fs = require("fs");

  try {

    const data = fs.readFileSync(path, "utf-8");
    return data;

  } catch (err) {

    return [];

  }

}

async function calculateArbi (amountIn, amountOut, tradeDesc) {

  let profitLoss = amountOut - amountIn;
  let profitLossPercent = (profitLoss/amountIn) * 100

  console.log(amountIn, amountOut, profitLossPercent);

}

async function getPrice (pairCA, amountIn, tradeDirection) {

  const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/4a955e6b63944eb2a26701fddfd4f222");

  const ABI = [
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function fee() external view returns (uint24)",
  ];

  const address = pairCA;

  const poolContract = new ethers.Contract(address, ABI, provider);

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

  const quoterAddy = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

  const quoterContract = new ethers.Contract(quoterAddy, UniQuoterABI, provider);

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


async function getDepth (amountIn) {

  console.log("Reading surface rate information...");
  
  let depthInfo = getFile("../TriangularArbitrageSpotterDEX/uniswap_surface_rates.json");

  fileJasonArray = JSON.parse(depthInfo);

  let limit = fileJasonArray.length;

  console.log(limit)

  fileJasonArrayLimit = fileJasonArray.slice(0, limit);

  for (let i = 0; i < fileJasonArrayLimit.length; i++) {

    let pair1CA = fileJasonArray[i].poolContract1;
    let pair2CA = fileJasonArray[i].poolContract2;
    let pair3CA = fileJasonArray[i].poolContract3;
    let tradeDirection1 = fileJasonArray[i].poolDirectionTrade1;
    let tradeDirection2 = fileJasonArray[i].poolDirectionTrade2;
    let tradeDirection3 = fileJasonArray[i].poolDirectionTrade3;

    console.log("Checking Trade N°1", pair1CA);

    let acquiredCoinDetailT1 = await getPrice(pair1CA, amountIn, tradeDirection1);

    console.log("Checking Trade N°2", pair2CA);
    if (acquiredCoinDetailT1 == 0) {return}
    let acquiredCoinDetailT2 = await getPrice(pair2CA, acquiredCoinDetailT1, tradeDirection2);

    console.log("Checking Trade N°3", pair3CA);
    if (acquiredCoinDetailT2 == 0) {return}
    let acquiredCoinDetailT3 = await getPrice(pair3CA, acquiredCoinDetailT2, tradeDirection3);

    calculateArbi(amountIn, acquiredCoinDetailT3, fileJasonArrayLimit[i])

  }

  return;

}

getDepth(1);