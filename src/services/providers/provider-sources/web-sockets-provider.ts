import { ChainId } from '@types';
import { BaseWebSocketProvider } from './base/base-web-socket-provider';

export class WebSocketProviderSource extends BaseWebSocketProvider {
  constructor(private readonly url: string, private readonly chains: ChainId[]) {
    super();
    if (chains.length === 0) throw new Error('Must support at least one chain');
  }

  supportedChains(): ChainId[] {
    return this.chains;
  }

  protected calculateUrl(chainId: number): string {
    return this.url;
  }
}
