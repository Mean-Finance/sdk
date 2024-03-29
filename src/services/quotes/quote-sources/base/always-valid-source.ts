import { IQuoteSource, QuoteParams, QuoteSourceMetadata, QuoteSourceSupport, SourceQuoteResponse } from '../types';

export abstract class AlwaysValidConfigAndContextSource<Support extends QuoteSourceSupport, CustomQuoteSourceConfig extends object = {}>
  implements IQuoteSource<Support, CustomQuoteSourceConfig>
{
  abstract getMetadata(): QuoteSourceMetadata<Support>;
  abstract quote(_: QuoteParams<Support, CustomQuoteSourceConfig>): Promise<SourceQuoteResponse>;

  isConfigAndContextValid(config: Partial<CustomQuoteSourceConfig> | undefined): config is CustomQuoteSourceConfig {
    return true;
  }
}
