import { Alchemy, Network } from 'alchemy-sdk';
import { Chains } from '@chains';
import { ChainId } from '@types';

const ALCHEMY_NETWORKS: Record<ChainId, Network> = {
  [Chains.ETHEREUM.chainId]: Network.ETH_MAINNET,
  [Chains.ETHEREUM_GOERLI.chainId]: Network.ETH_GOERLI,
  [Chains.ETHEREUM_SEPOLIA.chainId]: Network.ETH_SEPOLIA,
  [Chains.POLYGON.chainId]: Network.MATIC_MAINNET,
  [Chains.OPTIMISM.chainId]: Network.OPT_MAINNET,
  [Chains.ARBITRUM.chainId]: Network.ARB_MAINNET,
  [Chains.ASTAR.chainId]: Network.ASTAR_MAINNET,
  [Chains.POLYGON_ZKEVM.chainId]: Network.POLYGONZKEVM_MAINNET,
};

export function alchemySupportedChains(): ChainId[] {
  return Object.keys(ALCHEMY_NETWORKS).map(Number);
}

export function buildAlchemyClient(alchemyKey: string, chainId: ChainId) {
  return new Alchemy({
    apiKey: alchemyKey,
    network: ALCHEMY_NETWORKS[chainId],
  });
}

export function buildAlchemyUrl(alchemyKey: string, protocol: 'https' | 'wss', chainId: ChainId) {
  const alchemyNetwork: Network = ALCHEMY_NETWORKS[chainId];
  return `${protocol}://${alchemyNetwork}.g.alchemy.com/v2/${alchemyKey}`;
}
