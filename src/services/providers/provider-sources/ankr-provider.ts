import { Chains } from '@chains';
import { ChainId } from '@types';
import { BaseHttpProvider } from './base/base-http-provider';

const SUPPORTED_CHAINS: Record<ChainId, string> = {
  [Chains.POLYGON.chainId]: 'https://rpc.ankr.com/polygon',
  [Chains.AVALANCHE.chainId]: 'https://rpc.ankr.com/avalanche',
  [Chains.ETHEREUM.chainId]: 'https://rpc.ankr.com/eth',
  [Chains.ETHEREUM_GOERLI.chainId]: 'https://rpc.ankr.com/eth_goerli',
  [Chains.ETHEREUM_SEPOLIA.chainId]: 'https://rpc.ankr.com/eth_sepolia',
  [Chains.BNB_CHAIN.chainId]: 'https://rpc.ankr.com/bsc',
  [Chains.FANTOM.chainId]: 'https://rpc.ankr.com/fantom',
  [Chains.ARBITRUM.chainId]: 'https://rpc.ankr.com/arbitrum',
  [Chains.OPTIMISM.chainId]: 'https://rpc.ankr.com/optimism',
  [Chains.CELO.chainId]: 'https://rpc.ankr.com/celo',
  [Chains.GNOSIS.chainId]: 'https://rpc.ankr.com/gnosis',
  [Chains.POLYGON_ZKEVM.chainId]: 'https://rpc.ankr.com/polygon_zkevm',
  [Chains.HARMONY_SHARD_0.chainId]: 'https://rpc.ankr.com/harmony',
  [Chains.MOONBEAM.chainId]: 'https://rpc.ankr.com/moonbeam',
  [Chains.BIT_TORRENT.chainId]: 'https://rpc.ankr.com/bttc',
  [Chains.BASE.chainId]: 'https://rpc.ankr.com/base',
  [Chains.KLAYTN.chainId]: 'https://rpc.ankr.com/klaytn',
  [Chains.SCROLL.chainId]: 'https://rpc.ankr.com/scroll',
};

export class AnkrProviderSource extends BaseHttpProvider {
  private readonly supported: ChainId[];

  constructor(private readonly key?: string, onChains?: ChainId[]) {
    super();
    this.supported = onChains ?? ankrSupportedChains();
  }

  supportedChains(): ChainId[] {
    return this.supported;
  }

  protected calculateUrl(chainId: ChainId): string {
    return buildAnkrRPCUrl({ chainId, apiKey: this.key });
  }
}

export function buildAnkrRPCUrl({ chainId, apiKey }: { chainId: ChainId; apiKey?: string }) {
  let url = SUPPORTED_CHAINS[chainId];
  if (apiKey) {
    url += `/${apiKey}`;
  }
  return url;
}

export function ankrSupportedChains(): ChainId[] {
  return Object.keys(SUPPORTED_CHAINS).map(Number);
}
