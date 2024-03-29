import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { http } from 'viem';
import { Chains } from '@chains';
import { then, when } from '@test-utils/bdd';
import { PrioritizedProviderSourceCombinator } from '@services/providers/provider-sources/prioritized-provider-source-combinator';
import { IProviderSource } from '@services/providers/types';

const PROVIDER_1 = new JsonRpcProvider();
const PROVIDER_2 = new JsonRpcProvider();
const FULL_SUPPORT = { ethers: true, viem: true };

describe('Prioritized Provider Source Combinator', () => {
  const source1: IProviderSource = {
    supportedClients: () => ({ [Chains.POLYGON.chainId]: FULL_SUPPORT }),
    getEthersProvider: () => PROVIDER_1,
    getViemTransport: () => http(),
  };
  const source2: IProviderSource = {
    supportedClients: () => ({ [Chains.POLYGON.chainId]: FULL_SUPPORT, [Chains.ETHEREUM.chainId]: FULL_SUPPORT }),
    getEthersProvider: () => PROVIDER_2,
    getViemTransport: () => http(),
  };
  const fallbackSource = new PrioritizedProviderSourceCombinator([source1, source2]);

  when('asking for supported clients', () => {
    then('the union of the given sources is returned', () => {
      const supportedClients = fallbackSource.supportedClients();
      expect(Object.keys(supportedClients)).to.have.lengthOf(2);
      expect(supportedClients[Chains.POLYGON.chainId]).to.eql(FULL_SUPPORT);
      expect(supportedClients[Chains.ETHEREUM.chainId]).to.eql(FULL_SUPPORT);
    });
  });

  when('asking for a chain supported by source1', () => {
    then('provider1 is returned', () => {
      expect(fallbackSource.getEthersProvider({ chainId: Chains.POLYGON.chainId })).to.equal(PROVIDER_1);
    });
  });

  when('asking for a chain not supported by source1', () => {
    then('provider2 is returned', () => {
      expect(fallbackSource.getEthersProvider({ chainId: Chains.ETHEREUM.chainId })).to.equal(PROVIDER_2);
    });
  });

  when('asking for a chain not supported by any source', () => {
    then('an error is thrown', () => {
      expect(() => fallbackSource.getEthersProvider({ chainId: Chains.OPTIMISM.chainId })).to.throw(
        `Chain with id ${Chains.OPTIMISM.chainId} not supported`
      );
    });
  });
});
