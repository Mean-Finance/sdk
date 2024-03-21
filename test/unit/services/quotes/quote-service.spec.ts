import { expect } from 'chai';
import { then, when } from '@test-utils/bdd';
import { GasSpeed, IGasService, IQuickGasCostCalculator, DefaultGasValues } from '@services/gas/types';
import { BigIntish, ChainId, TokenAddress, InputTransaction } from '@types';
import { QuoteService } from '@services/quotes/quote-service';
import { IQuoteSourceList, QuoteRequest } from '@services/quotes';
import { IPriceService } from '@services/prices';
import { IMetadataService } from '@services/metadata';
import { BaseTokenMetadata } from '@services/metadata/types';
import { CHANGELLY_METADATA } from '@services/quotes/quote-sources/changelly-quote-source';
import { SourceListResponse } from '@services/quotes/source-lists/types';

describe('Quote Service', () => {
  when('request fails', () => {
    then('it is returned as a failed quote', async () => {
      const sourceList = new QuoteService({
        sourceList: FAILING_SOURCE_LIST,
        metadataService: METADATA_SERVICE,
        priceService: PRICE_SERVICE,
        gasService: GAS_SERVICE,
        defaultConfig: undefined,
      });
      const quotes = sourceList.getQuotes(REQUEST);
      expect(quotes).to.have.lengthOf(1);
      expect(await quotes[0]).to.eql({
        error: 'Something failed at list level',
        failed: true,
        source: { id: 'source', logoURI: CHANGELLY_METADATA.logoURI, name: CHANGELLY_METADATA.name },
      });
    });
  });
  when('request works but gas request fails', () => {
    then('it is returned as a failed quote', async () => {
      const sourceList = new QuoteService({
        sourceList: SOURCE_LIST,
        gasService: FAILING_GAS_SERVICE,
        metadataService: METADATA_SERVICE,
        priceService: PRICE_SERVICE,
        defaultConfig: undefined,
      });
      const quotes = sourceList.getQuotes(REQUEST);
      expect(quotes).to.have.lengthOf(1);
      expect(await quotes[0]).to.eql({
        error: 'Failed to fetch gas data',
        failed: true,
        source: { id: 'source', logoURI: CHANGELLY_METADATA.logoURI, name: CHANGELLY_METADATA.name },
      });
    });
  });
  when('request works but metadata request fails', () => {
    then('it is returned as a failed quote', async () => {
      const sourceList = new QuoteService({
        sourceList: SOURCE_LIST,
        gasService: GAS_SERVICE,
        metadataService: FAILING_METADATA_SERVICE,
        priceService: PRICE_SERVICE,
        defaultConfig: undefined,
      });
      const quotes = sourceList.getQuotes(REQUEST);
      expect(quotes).to.have.lengthOf(1);
      expect(await quotes[0]).to.eql({
        error: `Failed to fetch the quote's tokens`,
        failed: true,
        source: { id: 'source', logoURI: CHANGELLY_METADATA.logoURI, name: CHANGELLY_METADATA.name },
      });
    });
  });
  when('request works but price request fails', () => {
    then('response is returned correctly', async () => {
      const sourceList = new QuoteService({
        sourceList: SOURCE_LIST,
        gasService: GAS_SERVICE,
        metadataService: METADATA_SERVICE,
        priceService: FAILING_PRICE_SERVICE,
        defaultConfig: undefined,
      });
      const quotes = sourceList.getQuotes(REQUEST);
      expect(quotes).to.have.lengthOf(1);
      expect(await quotes[0]).to.not.have.any.keys('error');
    });
  });
});

const SOURCE = 'source';

const RESPONSE: SourceListResponse = {
  sellAmount: '1000',
  buyAmount: '1234',
  maxSellAmount: '1000',
  minBuyAmount: '1000',
  estimatedGas: '12345',
  type: 'sell',
  recipient: '0x0000000000000000000000000000000000000004',
  source: { id: SOURCE, allowanceTarget: '0x0000000000000000000000000000000000000005', name: 'Name', logoURI: 'logo' },
  tx: {
    from: '0x0000000000000000000000000000000000000005',
    to: '0x0000000000000000000000000000000000000006',
    data: '',
  },
};

const REQUEST: { request: QuoteRequest } = {
  request: {
    chainId: 1,
    sellToken: '0x0000000000000000000000000000000000000001',
    buyToken: '0x0000000000000000000000000000000000000002',
    order: { type: 'sell', sellAmount: 100 },
    slippagePercentage: 0.03,
    takerAddress: '0x0000000000000000000000000000000000000003',
  },
};

const SOURCE_LIST: IQuoteSourceList = {
  supportedSources: () => ({ [SOURCE]: CHANGELLY_METADATA }),
  getQuotes: () => ({ [SOURCE]: Promise.resolve(RESPONSE) }),
};
const FAILING_SOURCE_LIST: IQuoteSourceList = {
  ...SOURCE_LIST,
  getQuotes: () => ({ [SOURCE]: Promise.reject(new Error('Something failed at list level')) }),
};

const METADATA_SERVICE: IMetadataService<BaseTokenMetadata> = {
  supportedChains: () => [1],
  supportedProperties: () => ({ [1]: { symbol: 'present', decimals: 'present' } }),
  getMetadata: () => Promise.reject(new Error('Should not be called')),
  getMetadataForChain: ({ chainId, addresses }: { chainId: ChainId; addresses: TokenAddress[] }) =>
    Promise.resolve(Object.fromEntries(addresses.map((address) => [address, { symbol: 'SYM', decimals: 18 }]))) as any,
};
const FAILING_METADATA_SERVICE: IMetadataService<BaseTokenMetadata> = {
  ...METADATA_SERVICE,
  getMetadataForChain: ({ chainId, addresses }: { chainId: ChainId; addresses: TokenAddress[] }) => Promise.reject(new Error('Failed')),
};

const PRICE_SERVICE: IPriceService = {
  supportedChains: () => [1],
  supportedQueries: () => ({ [1]: { getCurrentPrices: true, getHistoricalPrices: true, getBulkHistoricalPrices: false, getChart: false } }),
  getCurrentPrices: () => Promise.reject(new Error('Should not be called')),
  getCurrentPricesForChain: ({ addresses }) =>
    Promise.resolve(Object.fromEntries(addresses.map((address, i) => [address, { price: i * 10, closestTimestamp: 0 }]))),
  getHistoricalPrices: () => Promise.reject(new Error('Should not be called')),
  getHistoricalPricesForChain: () => Promise.reject(new Error('Should not be called')),
  getBulkHistoricalPrices: () => Promise.reject(new Error('Should not be called')),
  getChart: () => Promise.reject(new Error('Should not be called')),
};
const FAILING_PRICE_SERVICE: IPriceService = {
  ...PRICE_SERVICE,
  getCurrentPricesForChain: () => Promise.reject(new Error('Failed')),
};

const GAS_CALCULATOR: IQuickGasCostCalculator<DefaultGasValues> = {
  supportedSpeeds: () => ({ standard: 'present', fast: 'optional', instant: 'optional' } as any),
  calculateGasCost: (_: { gasEstimation: BigIntish; tx?: InputTransaction }) =>
    ({ standard: { maxFeePerGas: '10', maxPriorityFeePerGas: '10', gasCostNativeToken: '10' } } as any),
  getGasPrice: () => ({ standard: { maxFeePerGas: '10', maxPriorityFeePerGas: '10' } } as any),
};
const GAS_SERVICE: IGasService<DefaultGasValues> = {
  supportedSpeeds: () => ({}),
  supportedChains: () => [1],
  estimateGas: (_: { chainId: ChainId; tx: InputTransaction }) => Promise.reject(new Error('Should not be called')),
  getGasPrice: (_: { chainId: ChainId; options?: { speed?: GasSpeed } }) => Promise.reject(new Error('Should not be called')),
  calculateGasCost: (_: { chainId: ChainId; gasEstimation: BigIntish; tx?: InputTransaction; options?: { speed?: GasSpeed } }) =>
    Promise.reject(new Error('Should not be called')),
  getQuickGasCalculator: (_: { chainId: ChainId }) => Promise.resolve(GAS_CALCULATOR) as any,
};
const FAILING_GAS_SERVICE: IGasService<DefaultGasValues> = {
  ...GAS_SERVICE,
  getQuickGasCalculator: (_: { chainId: ChainId }) => Promise.reject(new Error('Failed')),
};
