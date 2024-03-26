import { Chains } from '@chains';
import { Addresses } from '@shared/constants';
import { calculateDeadline, isSameAddress } from '@shared/utils';
import { ChainId } from '@types';
import { AlwaysValidConfigAndContextSource } from './base/always-valid-source';
import { QuoteParams, QuoteSourceMetadata, SourceQuoteResponse } from './types';
import { addQuoteSlippage, calculateAllowanceTarget, failed } from './utils';

const SUPPORTED_CHAINS: Record<ChainId, string> = {
  [Chains.ARBITRUM.chainId]: 'arbitrum',
  [Chains.AURORA.chainId]: 'aurora',
  [Chains.AVALANCHE.chainId]: 'avalanche',
  [Chains.BNB_CHAIN.chainId]: 'bsc',
  [Chains.BIT_TORRENT.chainId]: 'bttc',
  [Chains.CRONOS.chainId]: 'cronos',
  [Chains.ETHEREUM.chainId]: 'ethereum',
  [Chains.FANTOM.chainId]: 'fantom',
  [Chains.OASIS_EMERALD.chainId]: 'oasis',
  [Chains.POLYGON.chainId]: 'polygon',
  [Chains.VELAS.chainId]: 'velas',
  [Chains.OPTIMISM.chainId]: 'optimism',
  [Chains.LINEA.chainId]: 'linea',
  [Chains.BASE.chainId]: 'base',
  [Chains.POLYGON_ZKEVM.chainId]: 'polygon-zkevm',
  [Chains.SCROLL.chainId]: 'scroll',
};

const KYBERSWAP_METADATA: QuoteSourceMetadata<KyberswapSupport> = {
  name: 'Kyberswap',
  supports: {
    chains: Object.keys(SUPPORTED_CHAINS).map(Number),
    swapAndTransfer: true,
    buyOrders: false,
  },
  logoURI: 'ipfs://QmNcTVyqeVtNoyrT546VgJTD4vsZEkWp6zhDJ4qhgKkhbK',
};
type KyberswapSupport = { buyOrders: false; swapAndTransfer: true };
export class KyberswapQuoteSource extends AlwaysValidConfigAndContextSource<KyberswapSupport> {
  getMetadata() {
    return KYBERSWAP_METADATA;
  }

  async quote({
    components: { fetchService },
    request: {
      chain,
      sellToken,
      buyToken,
      order,
      accounts: { takeFrom, recipient },
      config: { slippagePercentage, timeout, txValidFor },
    },
    config,
  }: QuoteParams<KyberswapSupport>): Promise<SourceQuoteResponse> {
    const chainKey = SUPPORTED_CHAINS[chain.chainId];

    const headers = config.referrer?.name ? { 'x-client-id': config.referrer?.name } : undefined;

    const url =
      `https://aggregator-api.kyberswap.com/${chainKey}/api/v1/routes` +
      `?tokenIn=${sellToken}` +
      `&tokenOut=${buyToken}` +
      `&amountIn=${order.sellAmount.toString()}` +
      `&saveGas=0` +
      `&gasInclude=true`;

    const routeResponse = await fetchService.fetch(url, { timeout, headers });
    if (!routeResponse.ok) {
      failed(KYBERSWAP_METADATA, chain, sellToken, buyToken, await routeResponse.text());
    }
    const {
      data: { routeSummary },
    } = await routeResponse.json();

    const buildResponse = await fetchService.fetch(`https://aggregator-api.kyberswap.com/${chainKey}/api/v1/route/build`, {
      timeout,
      headers,
      method: 'POST',
      body: JSON.stringify({
        routeSummary,
        slippageTolerance: slippagePercentage * 100,
        recipient: recipient ?? takeFrom,
        deadline: txValidFor ? calculateDeadline(txValidFor) : undefined,
        source: config.referrer?.name,
        sender: takeFrom,
        skipSimulateTransaction: config.disableValidation,
      }),
    });
    if (!buildResponse.ok) {
      failed(KYBERSWAP_METADATA, chain, sellToken, buyToken, await buildResponse.text());
    }
    const {
      data: { amountOut, gas, data, routerAddress },
    } = await buildResponse.json();

    if (!data) {
      failed(KYBERSWAP_METADATA, chain, sellToken, buyToken, 'Failed to calculate a quote');
    }

    const value = isSameAddress(sellToken, Addresses.NATIVE_TOKEN) ? order.sellAmount : 0n;
    const quote = {
      sellAmount: order.sellAmount,
      buyAmount: BigInt(amountOut),
      estimatedGas: BigInt(gas),
      allowanceTarget: calculateAllowanceTarget(sellToken, routerAddress),
      tx: {
        to: routerAddress,
        calldata: data,
        value,
      },
    };

    return addQuoteSlippage(quote, order.type, slippagePercentage);
  }
}
