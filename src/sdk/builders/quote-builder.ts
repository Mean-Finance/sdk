import { IFetchService } from '@services/fetch/types';
import { IGasService } from '@services/gas/types';
import { GlobalQuoteSourceConfig, SourceId } from '@services/quotes/types';
import { ITokenService, BaseToken } from '@services/tokens/types';
import { DefaultSourceList } from '@services/quotes/source-lists/default-source-list';
import { QuoteService } from '@services/quotes/quote-service';
import { AllSourcesConfig } from '@services/quotes/source-registry';
import { IQuoteSourceList } from '@services/quotes/source-lists/types';
import { OverridableSourceList } from '@services/quotes/source-lists/overridable-source-list';

type QuoteSourceList =
  | { type: 'custom'; instance: IQuoteSourceList }
  | { type: 'default'; withConfig?: GlobalQuoteSourceConfig & Partial<AllSourcesConfig> }
  | { type: 'overridable-source-list'; lists: { default: QuoteSourceList; overrides: Record<SourceId, QuoteSourceList> } };

export type BuildQuoteParams = { sourceList?: QuoteSourceList };

export function buildQuoteService(
  params: BuildQuoteParams | undefined,
  fetchService: IFetchService,
  gasService: IGasService,
  tokenService: ITokenService<BaseToken>
) {
  const sourceList = buildList(params?.sourceList, { fetchService, gasService, tokenService });
  return new QuoteService(sourceList);
}

function buildList(
  list: QuoteSourceList | undefined,
  {
    fetchService,
    gasService,
    tokenService,
  }: {
    fetchService: IFetchService;
    gasService: IGasService;
    tokenService: ITokenService<BaseToken>;
  }
): IQuoteSourceList {
  switch (list?.type) {
    case 'custom':
      return list.instance;
    case 'default':
    case undefined:
      return new DefaultSourceList({ fetchService, gasService, tokenService, config: addReferrerIfNotSet(list?.withConfig) });
    case 'overridable-source-list':
      const defaultList = buildList(list.lists.default, { fetchService, gasService, tokenService });
      const entries = Object.entries(list.lists.overrides).map(([sourceId, sourceList]) => [
        sourceId,
        buildList(sourceList, { fetchService, gasService, tokenService }),
      ]);
      const overrides = Object.fromEntries(entries);
      return new OverridableSourceList({ default: defaultList, overrides });
  }
}

// If no referrer address was set, then we will use Mean's address
function addReferrerIfNotSet(config?: GlobalQuoteSourceConfig & Partial<AllSourcesConfig>) {
  return { referrerAddress: '0x1a00e1E311009E56e3b0B9Ed6F86f5Ce128a1C01', ...config };
}
