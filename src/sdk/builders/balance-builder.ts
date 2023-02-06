import { IMulticallService } from '@services/multicall/types';
import { IBalanceService, IBalanceSource } from '@services/balances/types';
import { RPCBalanceSource } from '@services/balances/balance-sources/rpc-balance-source';
import { IProviderSource } from '@services/providers';
import { BalanceService } from '@services/balances/balance-service';
import { IFetchService } from '@services/fetch';
import { AlchemyBalanceSource } from '@services/balances/balance-sources/alchemy-balance-source';

export type BalanceSourceInput = { type: 'rpc' } | { type: 'custom'; instance: IBalanceSource } | { type: 'alchemy'; key: string };

export type BuildBalancesParams = { source: BalanceSourceInput };

export function buildBalanceService(
  params: BuildBalancesParams | undefined,
  fetchService: IFetchService,
  providerSource: IProviderSource,
  multicallService: IMulticallService
): IBalanceService {
  const source = buildSource(params?.source, { fetchService, providerSource, multicallService });
  return new BalanceService(source);
}

function buildSource(
  source: BalanceSourceInput | undefined,
  {
    fetchService,
    providerSource,
    multicallService,
  }: { fetchService: IFetchService; providerSource: IProviderSource; multicallService: IMulticallService }
): IBalanceSource {
  switch (source?.type) {
    case undefined:
    case 'rpc':
      return new RPCBalanceSource(providerSource, multicallService);
    case 'custom':
      return source.instance;
    case 'alchemy':
      return new AlchemyBalanceSource(fetchService, source.key);
  }
}
