import { ChainId, TimeString, Timestamp, TokenAddress } from '@types';
import { IFetchService } from '@services/fetch/types';
import { PriceResult, IPriceSource, PricesQueriesSupport } from '../types';
import { DefiLlamaClient } from '@shared/defi-llama';

export class DefiLlamaPriceSource implements IPriceSource {
  private readonly defiLlama: DefiLlamaClient;

  constructor(fetch: IFetchService) {
    this.defiLlama = new DefiLlamaClient(fetch);
  }

  supportedQueries() {
    const support: PricesQueriesSupport = { getCurrentPrices: true, getHistoricalPrices: true, getBulkHistoricalPrices: true, getChart: true };
    const entries = this.defiLlama.supportedChains().map((chainId) => [chainId, support]);
    return Object.fromEntries(entries);
  }

  async getCurrentPrices(params: {
    addresses: Record<ChainId, TokenAddress[]>;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult>>> {
    const result: Record<ChainId, Record<TokenAddress, PriceResult>> = {};
    const data = await this.defiLlama.getCurrentTokenData(params);
    for (const [chainIdString, tokens] of Object.entries(data)) {
      const chainId = Number(chainIdString);
      result[chainId] = {};
      for (const [address, token] of Object.entries(tokens)) {
        result[chainId][address] = { price: token.price, closestTimestamp: token.timestamp };
      }
    }
    return result;
  }

  async getHistoricalPrices(params: {
    addresses: Record<ChainId, TokenAddress[]>;
    timestamp: Timestamp;
    searchWidth: TimeString | undefined;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult>>> {
    const result: Record<ChainId, Record<TokenAddress, PriceResult>> = {};
    const data = await this.defiLlama.getHistoricalTokenData(params);
    for (const [chainIdString, tokens] of Object.entries(data)) {
      const chainId = Number(chainIdString);
      result[chainId] = {};
      for (const [address, { price, timestamp }] of Object.entries(tokens)) {
        result[chainId][address] = { price, closestTimestamp: timestamp };
      }
    }
    return result;
  }

  async getBulkHistoricalPrices({
    addresses,
    searchWidth,
    config,
  }: {
    addresses: Record<ChainId, { token: TokenAddress; timestamp: Timestamp }[]>;
    searchWidth: TimeString | undefined;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, Record<Timestamp, PriceResult>>>> {
    return this.defiLlama.getBulkHistoricalTokenData({ addresses, searchWidth, config });
  }

  async getChart({
    tokens,
    span,
    period,
    bound,
    searchWidth,
    config,
  }: {
    tokens: Record<ChainId, TokenAddress[]>;
    span: number;
    period: TimeString;
    bound: { from: Timestamp } | { upTo: Timestamp | 'now' };
    searchWidth?: TimeString;
    config: { timeout?: TimeString } | undefined;
  }): Promise<Record<ChainId, Record<TokenAddress, PriceResult[]>>> {
    return this.defiLlama.getChart({ tokens, span, period, bound, searchWidth, config });
  }
}
