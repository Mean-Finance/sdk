import { ChainId } from '@types';
import { IProviderSource } from '../types';
import { buildEthersProviderForHttpSource, buildViemTransportForHttpSource } from './base/base-http-provider';
import { buildEthersProviderForWebSocketSource, buildViemTransportForWebSocketSource } from './base/base-web-socket-provider';
import { alchemySupportedChains, buildAlchemyRPCUrl } from '@shared/alchemy-rpc';

export { buildAlchemyRPCUrl, alchemySupportedChains };

export class AlchemyProviderSource implements IProviderSource {
  private readonly supported: ChainId[];

  constructor(private readonly key: string, private readonly protocol: 'https' | 'wss', onChains?: ChainId[]) {
    this.supported = onChains ?? alchemySupportedChains();
  }

  supportedClients() {
    const support = { ethers: true, viem: true };
    return Object.fromEntries(this.supported.map((chainId) => [chainId, support]));
  }

  getEthersProvider({ chainId }: { chainId: ChainId }) {
    const url = buildAlchemyRPCUrl({ apiKey: this.key, protocol: this.protocol, chainId });
    return this.protocol === 'https' ? buildEthersProviderForHttpSource(url, chainId) : buildEthersProviderForWebSocketSource(url, chainId);
  }

  getViemTransport({ chainId }: { chainId: ChainId }) {
    const url = buildAlchemyRPCUrl({ apiKey: this.key, protocol: this.protocol, chainId });
    return this.protocol === 'https' ? buildViemTransportForHttpSource(url, chainId) : buildViemTransportForWebSocketSource(url, chainId);
  }
}
