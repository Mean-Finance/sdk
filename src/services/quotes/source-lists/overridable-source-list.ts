import { SourceId } from '../types';
import { IQuoteSourceList, SourceListRequest, SourceListResponse } from './types';

type ConstructorParameters = {
  default: IQuoteSourceList;
  overrides: { list: IQuoteSourceList; sourceIds: SourceId[] }[];
};
export class OverridableSourceList implements IQuoteSourceList {
  private readonly overrides: Record<SourceId, IQuoteSourceList>;
  private readonly defaultSourceList: IQuoteSourceList;

  constructor({ default: defaultSourceList, overrides }: ConstructorParameters) {
    this.defaultSourceList = defaultSourceList;
    this.overrides = {};
    for (const { list, sourceIds } of overrides) {
      for (const sourceId of sourceIds) {
        if (sourceId in this.overrides) {
          throw new Error(`Source with id ${sourceId} was assigned twice`);
        }
        this.overrides[sourceId] = list;
      }
    }
  }

  supportedSources() {
    const sources = this.defaultSourceList.supportedSources();
    for (const [sourceId, sourceList] of Object.entries(this.overrides)) {
      sources[sourceId] = sourceList.supportedSources()[sourceId];
    }
    return sources;
  }

  getQuotes(request: SourceListRequest): Record<SourceId, Promise<SourceListResponse>> {
    const result: Record<SourceId, Promise<SourceListResponse>> = {};
    const sourceListSourcesId: Map<IQuoteSourceList, SourceId[]> = new Map();

    request.sources.forEach((sourceId) => {
      const sourceList = this.getSourceListForId(sourceId);
      if (!sourceListSourcesId.has(sourceList)) {
        sourceListSourcesId.set(sourceList, []);
      }
      sourceListSourcesId.get(sourceList)!.push(sourceId);
    });

    sourceListSourcesId.forEach((sourceIds, sourceList) => {
      const responses = sourceList.getQuotes({ ...request, sources: sourceIds });
      Object.entries(responses).forEach(([sourceId, response]) => (result[sourceId] = response));
    });

    return result;
  }

  private getSourceListForId(sourceId: SourceId) {
    return this.overrides[sourceId] ?? this.defaultSourceList;
  }
}
