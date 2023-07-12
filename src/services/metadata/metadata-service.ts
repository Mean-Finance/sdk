import { doesResponseMeetRequirements, validateRequirements } from '@shared/requirements-and-support';
import { timeoutPromise } from '@shared/timeouts';
import { ChainId, DefaultRequirements, FieldsRequirements, TimeString, TokenAddress } from '@types';
import { IMetadataService, IMetadataSource } from './types';

export class MetadataService<TokenMetadata extends object> implements IMetadataService<TokenMetadata> {
  constructor(private readonly metadataSource: IMetadataSource<TokenMetadata>) {}

  supportedChains(): ChainId[] {
    return Object.keys(this.supportedProperties()).map(Number);
  }

  supportedProperties() {
    return this.metadataSource.supportedProperties();
  }

  async getMetadataForChain<Requirements extends FieldsRequirements<TokenMetadata> = DefaultRequirements<TokenMetadata>>({
    chainId,
    addresses,
    config,
  }: {
    chainId: ChainId;
    addresses: TokenAddress[];
    config?: { fields?: Requirements; timeout?: TimeString };
  }) {
    const byChainId = { [chainId]: addresses };
    const result = await this.getMetadata({ addresses: byChainId, config });
    return result[chainId] ?? {};
  }

  async getMetadata<Requirements extends FieldsRequirements<TokenMetadata> = DefaultRequirements<TokenMetadata>>({
    addresses,
    config,
  }: {
    addresses: Record<ChainId, TokenAddress[]>;
    config?: { fields?: Requirements; timeout?: TimeString };
  }) {
    const chains = Object.keys(addresses).map(Number);
    validateRequirements(this.supportedProperties(), chains, config?.fields);
    const response = await timeoutPromise(this.metadataSource.getMetadata({ addresses, config }), config?.timeout);
    if (!doesResponseMeetRequirements(response, config?.fields)) {
      throw new Error('Failed to fetch metadata that meets the given requirements');
    }
    return response;
  }
}
