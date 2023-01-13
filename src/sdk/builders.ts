import { providers } from 'ethers';
import crossFetch from 'cross-fetch';
import { Networks } from '@networks';
import { FetchService } from '@services/fetch/fetch-service';
import { Fetch } from '@services/fetch/types';
import { GasCalculatorBuilderCombiner } from '@services/gas/gas-calculator-builders/gas-calculator-builder-combiner';
import { GenericGasCalculatorBuilder } from '@services/gas/gas-calculator-builders/generic-gas-calculator-builder';
import { OptimismGasCalculatorBuilder } from '@services/gas/gas-calculator-builders/optimism';
import { FallbackWhenNetworkNotSupportedGasPriceSource } from '@services/gas/gas-price-sources/fallback-when-network-not-supported-gas-source';
import { OpenOceanGasPriceSource } from '@services/gas/gas-price-sources/open-ocean';
import { ProviderGasPriceSource } from '@services/gas/gas-price-sources/provider';
import { GasService } from '@services/gas/gas-service';
import { IGasPriceSource } from '@services/gas/types';
import { MulticallService } from '@services/multicall/multicall-service';
import { IMulticallService } from '@services/multicall/types';
import { FallbackWhenNetworkNotSupportedProviderSource } from '@services/providers/provider-sources/fallback-when-network-not-supported-provider';
import { PublicProvidersSource } from '@services/providers/provider-sources/public-providers';
import { SingleProviderSource } from '@services/providers/provider-sources/single-provider';
import { QuoteService } from '@services/quotes/quote-service';
import { TokenService } from '@services/tokens/token-service';
import { DefiLlamaToken, DefiLlamaTokenSource } from '@services/tokens/token-sources/defi-llama';
import { GlobalQuoteSourceConfig } from '@services/quotes/types';
import { AllSourcesConfig, SourcesBasedOnConfig } from '@services/quotes/sources-list';
import { ISDK } from './types';

export function buildSDKWithProvider<CustomConfig extends Partial<AllSourcesConfig> = {}>({
  fetch,
  provider,
  config,
}: {
  provider: providers.BaseProvider;
  fetch?: Fetch;
  config?: GlobalQuoteSourceConfig & CustomConfig;
}): ISDK<SourcesBasedOnConfig<CustomConfig>, DefiLlamaToken> {
  const fetchService = new FetchService(fetch ?? crossFetch);

  // Use fallback to support more networks
  const providerSource = new FallbackWhenNetworkNotSupportedProviderSource([new SingleProviderSource(provider), new PublicProvidersSource()]);

  // Use fallback to support more networks
  const gasPriceSource = new FallbackWhenNetworkNotSupportedGasPriceSource([
    new OpenOceanGasPriceSource(fetchService),
    new ProviderGasPriceSource(providerSource),
  ]);

  const multicallService = new MulticallService(providerSource);

  const gasService = new GasService({
    providerSource,
    gasCostCalculatorBuilder: buildGasCalculatorBuilder({ gasPriceSource, multicallService }),
  });

  // TODO: When fallback token source is improved, use it here
  const tokenService = new TokenService(new DefiLlamaTokenSource(fetchService));

  const quoteService = new QuoteService<CustomConfig>({
    gasService,
    tokenService,
    fetchService,
    config,
  });

  return {
    fetchService,
    gasService,
    multicallService,
    quoteService,
    tokenService,
  };
}

function buildGasCalculatorBuilder({
  gasPriceSource,
  multicallService,
}: {
  gasPriceSource: IGasPriceSource;
  multicallService: IMulticallService;
}) {
  const defaultCalculatorBuilder = new GenericGasCalculatorBuilder(gasPriceSource);
  const calculatorBuilderOverrides = {
    [Networks.OPTIMISM.chainId]: new OptimismGasCalculatorBuilder(multicallService),
  };
  return new GasCalculatorBuilderCombiner({ defaultCalculatorBuilder, calculatorBuilderOverrides });
}