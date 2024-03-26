import { Chains } from '@chains';
import { IQuoteSource, QuoteParams, QuoteSourceMetadata, SourceQuoteResponse } from './types';
import qs from 'qs';
import { addQuoteSlippage, failed } from './utils';
import { parseUnits } from 'viem';
import { Addresses } from '@shared/constants';

const DODO_DEX_METADATA: QuoteSourceMetadata<DodoDexSupport> = {
  name: 'DODO',
  supports: {
    chains: [
      Chains.ETHEREUM.chainId,
      Chains.BNB_CHAIN.chainId,
      Chains.ARBITRUM.chainId,
      Chains.POLYGON.chainId,
      Chains.AURORA.chainId,
      Chains.AVALANCHE.chainId,
      Chains.BASE.chainId,
      Chains.BOBA.chainId,
      Chains.BASE_GOERLI.chainId,
      Chains.HECO.chainId,
      Chains.LINEA.chainId,
      Chains.MOONRIVER.chainId,
      Chains.OKC.chainId,
      Chains.OPTIMISM.chainId,
      Chains.SCROLL.chainId,
    ],
    swapAndTransfer: false,
    buyOrders: false,
  },
  logoURI: 'ipfs://QmYpbxSqVmeHrzfjdd5JWdPitvZZhiMaeAiBGe7VT8qQTA',
};
type DodoDexConfig = { apiKey: string };
type DodoDexSupport = { buyOrders: false; swapAndTransfer: false };
export class DodoDexQuoteSource implements IQuoteSource<DodoDexSupport, DodoDexConfig> {
  getMetadata() {
    return DODO_DEX_METADATA;
  }
  async quote({
    components: { fetchService },
    request: {
      chain,
      sellToken,
      buyToken,
      order,
      accounts: { takeFrom },
      config: { slippagePercentage, timeout },
    },
    config,
  }: QuoteParams<DodoDexSupport, DodoDexConfig>): Promise<SourceQuoteResponse> {
    const queryParams = {
      chainId: chain.chainId,
      fromAmount: order.sellAmount,
      fromTokenAddress: sellToken,
      toTokenAddress: buyToken,
      rpc: chain.publicRPCs[0],
      slippage: slippagePercentage,
      userAddr: takeFrom,
      apikey: config.apiKey,
    };

    const queryString = qs.stringify(queryParams, { skipNulls: true, arrayFormat: 'comma' });
    const quoteResponse = await fetchService.fetch(`https://api.dodoex.io/route-service/developer/swap?${queryString}`, {
      headers: { 'Content-Type': 'application/json' },
      timeout,
    });

    if (!quoteResponse.ok) {
      failed(DODO_DEX_METADATA, chain, sellToken, buyToken, await quoteResponse.text());
    }
    const quoteResult = await quoteResponse.json();
    if (quoteResult.status < 0) {
      failed(DODO_DEX_METADATA, chain, sellToken, buyToken, quoteResult.data);
    }
    const buyAmount = parseUnits(quoteResult.data.resAmount.toString(), quoteResult.data.targetDecimals);
    const { targetApproveAddr, data, to, value } = quoteResult.data;
    const quote = {
      sellAmount: order.sellAmount,
      buyAmount,
      estimatedGas: undefined,
      allowanceTarget: targetApproveAddr ?? Addresses.ZERO_ADDRESS,
      tx: {
        calldata: data,
        to,
        value: BigInt(value ?? 0),
      },
    };

    return addQuoteSlippage(quote, order.type, slippagePercentage);
  }
  isConfigAndContextValid(config: Partial<DodoDexConfig> | undefined): config is DodoDexConfig {
    return !!config?.apiKey;
  }
}
