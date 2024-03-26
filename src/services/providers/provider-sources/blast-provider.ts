import { Chains } from '@chains';
import { ChainId } from '@types';
import { BaseHttpProvider } from './base/base-http-provider';

const PLACEHOLDER = '{{ PLACEHOLDER }}';

const SUPPORTED_CHAINS: Record<ChainId, string> = {
  [Chains.ETHEREUM.chainId]: `https://eth-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.ETHEREUM_SEPOLIA.chainId]: `https://eth-sepolia.blastapi.io${PLACEHOLDER}`,
  [Chains.BNB_CHAIN.chainId]: `https://bsc-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.POLYGON.chainId]: `https://polygon-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.POLYGON_MUMBAI.chainId]: `https://polygon-testnet.blastapi.io${PLACEHOLDER}`,
  [Chains.ARBITRUM.chainId]: `https://arbitrum-one.blastapi.io${PLACEHOLDER}`,
  [Chains.ASTAR.chainId]: `https://astar.blastapi.io${PLACEHOLDER}`,
  [Chains.OPTIMISM.chainId]: `https://optimism-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.LINEA.chainId]: `https://linea-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.BASE.chainId]: `https://base-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.FANTOM.chainId]: `https://fantom-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.AVALANCHE.chainId]: `https://ava-mainnet.blastapi.io${PLACEHOLDER}/ext/bc/C/rpc`,
  [Chains.GNOSIS.chainId]: `https://gnosis-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.POLYGON_ZKEVM.chainId]: `https://polygon-zkevm-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.MOONBEAM.chainId]: `https://moonbeam.blastapi.io${PLACEHOLDER}`,
  [Chains.MOONRIVER.chainId]: `https://moonriver.blastapi.io${PLACEHOLDER}`,
  [Chains.OKC.chainId]: `https://oktc-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.MODE.chainId]: `https://mode-mainnet.blastapi.io${PLACEHOLDER}`,
  [Chains.SCROLL.chainId]: `https://scroll-mainnet.public.blastapi.io${PLACEHOLDER}`,
};

export class BlastProviderSource extends BaseHttpProvider {
  private readonly supported: ChainId[];

  constructor(private readonly key?: string, onChains?: ChainId[]) {
    super();
    this.supported = onChains ?? blastSupportedChains();
  }

  supportedChains(): ChainId[] {
    return this.supported;
  }

  protected calculateUrl(chainId: ChainId): string {
    return buildBlastRPCUrl({ chainId, apiKey: this.key });
  }
}

export function buildBlastRPCUrl({ chainId, apiKey }: { chainId: ChainId; apiKey?: string }) {
  const url = SUPPORTED_CHAINS[chainId];
  const toReplace = apiKey ? `/${apiKey}` : '';
  return url.replace(PLACEHOLDER, toReplace);
}

export function blastSupportedChains(): ChainId[] {
  return Object.keys(SUPPORTED_CHAINS).map(Number);
}
