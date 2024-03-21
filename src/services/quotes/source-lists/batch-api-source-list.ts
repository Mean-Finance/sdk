import { reduceTimeout } from '@shared/timeouts';
import { SourceId, SourceMetadata } from '../types';
import { IQuoteSourceList, SourceListRequest, SourceListResponse } from './types';
import { IFetchService } from '@services/fetch/types';
import { PartialOnly } from '@utility-types';

export type BatchAPISourceListRequest = PartialOnly<SourceListRequest, 'external'>;
export type URIGenerator = (request: BatchAPISourceListRequest) => string;
type ConstructorParameters = {
  fetchService: IFetchService;
  baseUri: URIGenerator;
  sources: Record<SourceId, SourceMetadata>;
};
export class BatchAPISourceList implements IQuoteSourceList {
  private readonly fetchService: IFetchService;
  private readonly baseUri: URIGenerator;
  private readonly sources: Record<SourceId, SourceMetadata>;

  constructor({ fetchService, baseUri, sources }: ConstructorParameters) {
    this.fetchService = fetchService;
    this.baseUri = baseUri;
    this.sources = sources;
  }

  supportedSources() {
    return this.sources;
  }

  getQuotes(request: SourceListRequest): Record<SourceId, Promise<SourceListResponse>> {
    // We reduce the request a little bit so that the server tries to be faster that the timeout
    const reducedTimeout = reduceTimeout(request.quoteTimeout, '100');
    const uri = this.baseUri(request);
    const response = this.fetchService.fetch(uri, {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        quoteTimeout: reducedTimeout,
      }),
      timeout: request.quoteTimeout,
    });
    const result: Promise<SourceListResponse[]> = response.then((result) => result.json());
    return Object.fromEntries(request.sources.map((sourceId, index) => [sourceId, result.then((responses) => responses[index])]));
  }
}
