import { Address, AmountOfToken, ChainId, TimeString, TokenAddress } from '@types';
import { Addresses } from '@shared/constants';
import { filterRejectedResults, isSameAddress } from '@shared/utils';
import { timeoutPromise } from '@shared/timeouts';
import { BalanceQueriesSupport, IBalanceSource } from '../../types';

export abstract class SingleChainBaseBalanceSource implements IBalanceSource {
  async getBalancesForTokens({
    tokens,
    config,
  }: {
    tokens: Record<ChainId, Record<Address, TokenAddress[]>>;
    config?: { timeout?: TimeString };
  }): Promise<Record<ChainId, Record<Address, Record<TokenAddress, AmountOfToken>>>> {
    const promises = Object.entries(tokens).map(async ([chainId, tokens]) => [
      parseInt(chainId),
      await timeoutPromise(this.fetchBalancesInChain(Number(chainId), tokens), config?.timeout, { reduceBy: '100' }),
    ]);
    return Object.fromEntries(await filterRejectedResults(promises));
  }

  async getTokensHeldByAccounts({
    accounts,
    config,
  }: {
    accounts: Record<ChainId, Address[]>;
    config?: { timeout?: TimeString };
  }): Promise<Record<ChainId, Record<Address, Record<TokenAddress, AmountOfToken>>>> {
    const support = this.supportedQueries();
    for (const chainId in accounts) {
      if (!support[chainId]?.getTokensHeldByAccount) {
        return Promise.reject(new Error('Operation not supported'));
      }
    }
    const promises = Object.entries(accounts).map(async ([chainId, accounts]) => [
      chainId,
      await timeoutPromise(this.fetchTokensHeldByAccountsInChain(Number(chainId), accounts, config), config?.timeout, { reduceBy: '100' }),
    ]);
    return Object.fromEntries(await filterRejectedResults(promises));
  }

  private async fetchBalancesInChain(
    chainId: ChainId,
    tokens: Record<Address, TokenAddress[]>,
    config?: { timeout?: TimeString }
  ): Promise<Record<Address, Record<TokenAddress, AmountOfToken>>> {
    const accountsToFetchNativeToken: Address[] = [];
    const tokensWithoutNativeToken: Record<Address, TokenAddress[]> = {};

    for (const [account, addresses] of Object.entries(tokens)) {
      const addressesWithoutNativeToken = addresses.filter((address) => !isSameAddress(address, Addresses.NATIVE_TOKEN));
      if (addressesWithoutNativeToken.length > 0) tokensWithoutNativeToken[account] = addressesWithoutNativeToken;
      if (addresses.length > addressesWithoutNativeToken.length) accountsToFetchNativeToken.push(account);
    }

    const erc20Promise =
      Object.keys(tokensWithoutNativeToken).length > 0
        ? this.fetchERC20BalancesForAccountsInChain(chainId, tokensWithoutNativeToken, config)
        : Promise.resolve<Record<Address, Record<TokenAddress, AmountOfToken>>>({});

    const nativePromise =
      accountsToFetchNativeToken.length > 0
        ? this.fetchNativeBalancesInChain(chainId, accountsToFetchNativeToken)
        : Promise.resolve<Record<Address, AmountOfToken>>({});

    const [erc20Result, nativeResult] = await Promise.all([erc20Promise, nativePromise]);

    const result: Record<Address, Record<TokenAddress, AmountOfToken>> = {};

    for (const account in tokens) {
      const lowercasedEntries = Object.entries(erc20Result[account] ?? {})
        .filter(([, balance]) => isValidBalance(balance))
        .map(([address, balance]) => [address.toLowerCase(), balance]);
      const lowercased: Record<TokenAddress, AmountOfToken> = Object.fromEntries(lowercasedEntries);

      for (const token of tokensWithoutNativeToken[account] ?? []) {
        const balance = lowercased[token.toLowerCase()];
        if (balance) {
          if (!(account in result)) result[account] = {};
          result[account][token] = balance;
        }
      }

      if (isValidBalance(nativeResult[account])) {
        const nativeAddressUsed = tokens[account].find((address) => isSameAddress(Addresses.NATIVE_TOKEN, address))!;
        if (!(account in result)) result[account] = {};
        result[account][nativeAddressUsed] = nativeResult[account];
      }
    }

    return result;
  }

  private async fetchTokensHeldByAccountsInChain(
    chainId: ChainId,
    accounts: Address[],
    config?: { timeout?: TimeString }
  ): Promise<Record<Address, Record<TokenAddress, AmountOfToken>>> {
    const erc20Promise = this.fetchERC20TokensHeldByAccountsInChain(chainId, accounts, config);
    const nativePromise = this.fetchNativeBalancesInChain(chainId, accounts);
    const [erc20Result, nativeResult] = await Promise.all([erc20Promise, nativePromise]);

    const result: Record<Address, Record<TokenAddress, AmountOfToken>> = {};
    for (const account of accounts) {
      const entries = Object.entries(erc20Result[account]).filter(([, balance]) => isValidBalanceAndNonZero(balance));
      result[account] = Object.fromEntries(entries);
      if (isValidBalanceAndNonZero(nativeResult[account])) {
        result[account][Addresses.NATIVE_TOKEN] = nativeResult[account];
      }
    }

    return result;
  }

  abstract supportedQueries(): Record<ChainId, BalanceQueriesSupport>;
  protected abstract fetchERC20TokensHeldByAccountsInChain(
    chainId: ChainId,
    accounts: Address[],
    config?: { timeout?: TimeString }
  ): Promise<Record<Address, Record<TokenAddress, AmountOfToken>>>;
  protected abstract fetchERC20BalancesForAccountsInChain(
    chainId: ChainId,
    accounts: Record<Address, TokenAddress[]>,
    config?: { timeout?: TimeString }
  ): Promise<Record<Address, Record<TokenAddress, AmountOfToken>>>;
  protected abstract fetchNativeBalancesInChain(
    chainId: ChainId,
    accounts: Address[],
    config?: { timeout?: TimeString }
  ): Promise<Record<Address, AmountOfToken>>;
}

function isValidBalance(text: AmountOfToken | undefined) {
  return typeof toBigInt(text) === 'bigint';
}

function isValidBalanceAndNonZero(text: AmountOfToken | undefined) {
  const bn = toBigInt(text);
  return typeof bn === 'bigint' && bn > 0n;
}

function toBigInt(text: AmountOfToken | undefined): bigint | undefined {
  try {
    if (text) {
      return BigInt(text);
    }
  } catch {}
  return undefined;
}
