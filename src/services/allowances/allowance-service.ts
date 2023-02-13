import { AmountOfToken, ChainId, TimeString, TokenAddress } from '@types';
import { IAllowanceService, IAllowanceSource, OwnerAddress, SpenderAddress } from './types';
import { timeoutPromise } from '@shared/timeouts';

export class AllowanceService implements IAllowanceService {
  constructor(private readonly source: IAllowanceSource) {}

  supportedChains(): ChainId[] {
    return this.source.supportedChains();
  }

  async getAllowance({
    chainId,
    token,
    owner,
    spender,
    config,
  }: {
    chainId: ChainId;
    token: TokenAddress;
    owner: OwnerAddress;
    spender: SpenderAddress;
    config?: { timeout?: TimeString };
  }): Promise<AmountOfToken> {
    const { [spender]: result } = await this.getAllowances({ chainId, token, owner, spenders: [spender], config });
    return result;
  }

  async getAllowances({
    chainId,
    token,
    owner,
    spenders,
    config,
  }: {
    chainId: ChainId;
    token: TokenAddress;
    owner: OwnerAddress;
    spenders: SpenderAddress[];
    config?: { timeout?: TimeString };
  }): Promise<Record<SpenderAddress, AmountOfToken>> {
    const allowancesInChain = spenders.map((spender) => ({ token, owner, spender }));
    const allowances = { [chainId]: allowancesInChain };
    const result = await timeoutPromise(this.source.getAllowances({ allowances, context: config }), config?.timeout);
    return result[chainId][token][owner];
  }
}