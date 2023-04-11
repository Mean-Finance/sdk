import { BuildFetchParams, buildFetchService } from './builders/fetch-builder';
import { BuildProviderParams, buildProviderService } from './builders/provider-builder';
import { buildGasService, BuildGasParams, CalculateGasValuesFromSourceParams } from './builders/gas-builder';
import { buildMulticallService } from './builders/multicall-builder';
import { BuildBalancesParams } from './builders';
import { BuildMetadataParams, buildMetadataService, CalculateMetadataFromSourceParams } from './builders/metadata-builder';
import { BuildQuoteParams, buildQuoteService } from './builders/quote-builder';
import { buildBalanceService } from './builders/balance-builder';
import { buildAllowanceService, BuildAllowanceParams } from './builders/allowance-builder';
import { ISDK } from './types';
import { BuildPriceParams, buildPriceService } from './builders/price-builder';

export function buildSDK<Params extends BuildParams = {}>(
  params?: Params
): ISDK<CalculateMetadataFromSourceParams<Params['metadata']>, CalculateGasValuesFromSourceParams<Params['gas']>> {
  const fetchService = buildFetchService(params?.fetch);
  const providerService = buildProviderService(params?.provider);
  const multicallService = buildMulticallService(providerService);
  const balanceService = buildBalanceService(params?.balances, fetchService, providerService, multicallService);
  const allowanceService = buildAllowanceService(params?.allowances, fetchService, multicallService);
  const gasService = buildGasService<Params['gas']>(params?.gas, fetchService, providerService, multicallService);
  const metadataService = buildMetadataService<Params['metadata']>(params?.metadata, fetchService, multicallService);
  const priceService = buildPriceService(params?.price, fetchService);
  const quoteService = buildQuoteService(params?.quotes, providerService, fetchService, gasService as any, metadataService as any, priceService);

  return {
    providerService,
    fetchService,
    multicallService,
    allowanceService,
    balanceService,
    gasService,
    metadataService,
    priceService,
    quoteService,
  };
}

export type BuildParams = {
  fetch?: BuildFetchParams;
  provider?: BuildProviderParams;
  balances?: BuildBalancesParams;
  allowances?: BuildAllowanceParams;
  gas?: BuildGasParams;
  metadata?: BuildMetadataParams;
  price?: BuildPriceParams;
  quotes?: BuildQuoteParams;
};
