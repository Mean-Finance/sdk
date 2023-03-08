import { TransactionRequest } from '@ethersproject/providers';
import { AmountOfToken, ChainId, DefaultRequirements, FieldsRequirements, TimeString } from '@types';
import { BigNumberish } from 'ethers';
import { chainsIntersection } from '@chains';
import { IProviderSource } from '@services/providers/types';
import { IGasService, IQuickGasCostCalculatorBuilder, IQuickGasCostCalculator, SupportedGasValues } from './types';
import { timeoutPromise } from '@shared/timeouts';

type ConstructorParameters<GasValues extends SupportedGasValues> = {
  providerSource: IProviderSource;
  gasCostCalculatorBuilder: IQuickGasCostCalculatorBuilder<GasValues>;
};

export class GasService<GasValues extends SupportedGasValues> implements IGasService<GasValues> {
  private readonly providerSource: IProviderSource;
  private readonly gasCostCalculatorBuilder: IQuickGasCostCalculatorBuilder<GasValues>;

  constructor({ providerSource, gasCostCalculatorBuilder }: ConstructorParameters<GasValues>) {
    this.providerSource = providerSource;
    this.gasCostCalculatorBuilder = gasCostCalculatorBuilder;
  }

  supportedChains(): ChainId[] {
    return chainsIntersection(this.providerSource.supportedChains(), Object.keys(this.gasCostCalculatorBuilder.supportedSpeeds()).map(Number));
  }

  supportedSpeeds() {
    const supportedChains = this.supportedChains();
    const entries = Object.entries(this.gasCostCalculatorBuilder.supportedSpeeds()).filter(([chainId]) =>
      supportedChains.includes(Number(chainId))
    );
    return Object.fromEntries(entries);
  }

  estimateGas({ chainId, tx, config }: { chainId: ChainId; tx: TransactionRequest; config?: { timeout?: TimeString } }): Promise<AmountOfToken> {
    const promise = this.providerSource
      .getProvider({ chainId })
      .estimateGas(tx)
      .then((estimate) => estimate.toString());
    return timeoutPromise(promise, config?.timeout);
  }

  getQuickGasCalculator<Requirements extends FieldsRequirements<GasValues> = DefaultRequirements<GasValues>>({
    chainId,
    config,
  }: {
    chainId: ChainId;
    config?: { timeout?: TimeString; fields?: Requirements };
  }): Promise<IQuickGasCostCalculator<GasValues, Requirements>> {
    // TODO: Make sure that fields make sense according to support in chain
    // TODO: Test new behavior
    return timeoutPromise(this.gasCostCalculatorBuilder.build({ chainId, config, context: config }), config?.timeout);
  }

  async getGasPrice<Requirements extends FieldsRequirements<GasValues> = DefaultRequirements<GasValues>>({
    chainId,
    config,
  }: {
    chainId: ChainId;
    config?: { timeout?: TimeString; fields?: Requirements };
  }) {
    const gasCalculator = await this.getQuickGasCalculator({ chainId, config });
    return gasCalculator.getGasPrice();
  }

  async calculateGasCost<Requirements extends FieldsRequirements<GasValues> = DefaultRequirements<GasValues>>({
    chainId,
    gasEstimation,
    tx,
    config,
  }: {
    chainId: ChainId;
    gasEstimation: BigNumberish;
    tx?: TransactionRequest;
    config?: { timeout?: TimeString; fields?: Requirements };
  }) {
    const gasCalculator = await this.getQuickGasCalculator({ chainId, config });
    return gasCalculator.calculateGasCost({ gasEstimation, tx });
  }
}
