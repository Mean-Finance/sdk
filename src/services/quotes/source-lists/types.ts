import { GasPrice } from '@services/gas/types';
import { BaseTokenMetadata } from '@services/metadata/types';
import { ITriggerablePromise } from '@shared/triggerable-promise';
import { Address, AmountOfToken, TimeString } from '@types';
import { QuoteRequest, SourceMetadata, SourceId, GlobalQuoteSourceConfig, QuoteTransaction } from '../types';

export type IQuoteSourceList = {
  supportedSources(): Record<SourceId, SourceMetadata>;
  getQuotes(request: SourceListRequest): Record<SourceId, Promise<SourceListResponse>>;
};

export type SourceListRequest = Omit<QuoteRequest, 'filters' | 'gasSpeed'> & {
  sources: SourceId[];
  external: {
    tokenData: ITriggerablePromise<{
      sellToken: BaseTokenMetadata;
      buyToken: BaseTokenMetadata;
    }>;
    gasPrice: ITriggerablePromise<GasPrice>;
  };
  sourceConfig?: GlobalQuoteSourceConfig;
  quoteTimeout?: TimeString;
};

export type SourceListResponse = {
  sellAmount: AmountOfToken;
  buyAmount: AmountOfToken;
  maxSellAmount: AmountOfToken;
  minBuyAmount: AmountOfToken;
  estimatedGas?: AmountOfToken;
  type: 'sell' | 'buy';
  recipient: Address;
  source: { id: SourceId; allowanceTarget: Address; name: string; logoURI: string; customData?: Record<string, any> };
  tx: QuoteTransaction;
};
