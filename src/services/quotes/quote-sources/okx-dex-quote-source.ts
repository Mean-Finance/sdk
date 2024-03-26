import qs from 'qs';
import CryptoJS from 'crypto-js';
import { Chains } from '@chains';
import { IQuoteSource, QuoteParams, QuoteSourceMetadata, SourceQuoteResponse } from './types';
import { failed } from './utils';
import { IFetchService } from '@services/fetch';
import { Address, Chain, TimeString } from '@types';
import { Addresses, Uint } from '@shared/constants';
import { isSameAddress } from '@shared/utils';

const SUPPORTED_CHAINS = [
  Chains.ETHEREUM,
  Chains.OPTIMISM,
  Chains.POLYGON,
  Chains.BNB_CHAIN,
  Chains.OKC,
  Chains.AVALANCHE,
  Chains.FANTOM,
  Chains.ARBITRUM,
  Chains.LINEA,
  Chains.BASE,
  Chains.SCROLL,
];

const OKX_DEX_METADATA: QuoteSourceMetadata<OKXDexSupport> = {
  name: 'OKX Dex',
  supports: {
    chains: SUPPORTED_CHAINS.map(({ chainId }) => chainId),
    swapAndTransfer: false,
    buyOrders: false,
  },
  logoURI: 'ipfs://QmarS9mPPLegvNaazZ8Kqg1gLvkbsvQE2tkdF6uZCvBrFn',
};
type OKXDexConfig = { apiKey: string; secretKey: string; passphrase: string };
type OKXDexSupport = { buyOrders: false; swapAndTransfer: false };
export class OKXDexQuoteSource implements IQuoteSource<OKXDexSupport, OKXDexConfig> {
  getMetadata() {
    return OKX_DEX_METADATA;
  }

  async quote({ components, request, config }: QuoteParams<OKXDexSupport, OKXDexConfig>): Promise<SourceQuoteResponse> {
    const [approvalTargetResponse, quoteResponse] = await Promise.all([
      calculateApprovalTarget({ components, request, config }),
      calculateQuote({ components, request, config }),
    ]);
    const {
      data: [
        {
          routerResult: { toTokenAmount },
          tx: { minReceiveAmount, to, value, data, gas },
        },
      ],
    } = quoteResponse;
    const {
      data: [{ dexContractAddress: approvalTarget }],
    } = approvalTargetResponse;

    return {
      sellAmount: request.order.sellAmount,
      maxSellAmount: request.order.sellAmount,
      buyAmount: BigInt(toTokenAmount),
      minBuyAmount: BigInt(minReceiveAmount),
      estimatedGas: BigInt(gas),
      allowanceTarget: approvalTarget,
      type: 'sell',
      tx: {
        calldata: data,
        to,
        value: BigInt(value ?? 0),
      },
    };
  }

  isConfigAndContextValid(config: Partial<OKXDexConfig> | undefined): config is OKXDexConfig {
    return !!config?.apiKey && !!config?.passphrase && !!config?.secretKey;
  }
}

async function calculateApprovalTarget({
  components: { fetchService },
  request: {
    chain,
    sellToken,
    buyToken,
    config: { timeout },
  },
  config,
}: QuoteParams<OKXDexSupport, OKXDexConfig>) {
  if (isSameAddress(sellToken, Addresses.NATIVE_TOKEN)) {
    return { data: [{ dexContractAddress: Addresses.ZERO_ADDRESS }] };
  }
  const queryParams = {
    chainId: chain.chainId,
    tokenContractAddress: sellToken,
    approveAmount: Uint.MAX_256,
  };
  const queryString = qs.stringify(queryParams, { skipNulls: true, arrayFormat: 'comma' });
  const path = `/api/v5/dex/aggregator/approve-transaction?${queryString}`;
  return fetch({
    sellToken,
    buyToken,
    chain,
    path,
    timeout,
    config,
    fetchService,
  });
}

async function calculateQuote({
  components: { fetchService },
  request: {
    chain,
    sellToken,
    buyToken,
    order,
    config: { slippagePercentage, timeout },
    accounts: { takeFrom },
  },
  config,
}: QuoteParams<OKXDexSupport, OKXDexConfig>) {
  const queryParams = {
    chainId: chain.chainId,
    amount: order.sellAmount.toString(),
    fromTokenAddress: sellToken,
    toTokenAddress: buyToken,
    slippage: slippagePercentage / 100,
    userWalletAddress: takeFrom,
    referrerAddress: config.referrer?.address,
    feePercent: config.referrer?.address ? 0 : undefined,
  };
  const queryString = qs.stringify(queryParams, { skipNulls: true, arrayFormat: 'comma' });
  const path = `/api/v5/dex/aggregator/swap?${queryString}`;
  return fetch({
    sellToken,
    buyToken,
    chain,
    path,
    timeout,
    config,
    fetchService,
  });
}

async function fetch({
  sellToken,
  buyToken,
  chain,
  path,
  fetchService,
  config,
  timeout,
}: {
  sellToken: Address;
  buyToken: Address;
  chain: Chain;
  path: string;
  timeout?: TimeString;
  config: OKXDexConfig;
  fetchService: IFetchService;
}) {
  const timestamp = new Date().toISOString();
  const toHash = timestamp + 'GET' + path;
  const signed = CryptoJS.HmacSHA256(toHash, config.secretKey);
  const base64 = signed.toString(CryptoJS.enc.Base64);

  const headers: HeadersInit = {
    ['OK-ACCESS-KEY']: config.apiKey,
    ['OK-ACCESS-PASSPHRASE']: config.passphrase,
    ['OK-ACCESS-TIMESTAMP']: timestamp,
    ['OK-ACCESS-SIGN']: base64,
  };

  const url = `https://www.okx.com${path}`;
  const response = await fetchService.fetch(url, { timeout, headers });
  if (!response.ok) {
    failed(OKX_DEX_METADATA, chain, sellToken, buyToken, await response.text());
  }
  return response.json();
}
