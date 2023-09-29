import { encodeFunctionData, Hex, Address as ViemAddress } from 'viem';
import { Address, BigIntish, ChainId, TokenAddress, BuiltTransaction } from '@types';
import companionAbi from '@shared/abis/companion';
import dcaHubAbi from '@shared/abis/dca-hub';
import { SinglePermitParams, PermitData, IPermit2Service } from '@services/permit2';
import { PERMIT2_ADDRESS } from '@services/permit2/utils/config';
import { isSameAddress } from '@shared/utils';
import { Addresses } from '@shared/constants';
import { IQuoteService, QuoteRequest } from '@services/quotes';
import {
  CreateDCAPositionParams,
  DCAActionSwapConfig,
  DCAPermissionPermit,
  IDCAPositionManagementService,
  IncreaseDCAPositionParams,
  MigrateDCAPositionParams,
  ReduceDCAPositionParams,
  ReduceToBuyDCAPositionParams,
  TerminateDCAPositionParams,
  WithdrawDCAPositionParams,
} from './types';
import { COMPANION_ADDRESS, COMPANION_SWAPPER_ADDRESS, DCA_HUB_ADDRESS, DCA_PERMISSION_MANAGER_ADDRESS } from './config';
import { IMulticallService } from '..';
import { ERC721_ABI } from '@shared/abis/erc721';

export class DCAPositionManagementService implements IDCAPositionManagementService {
  constructor(
    private readonly multicallService: IMulticallService,
    private readonly permit2Service: IPermit2Service,
    private readonly quoteService: IQuoteService
  ) {}

  getAllowanceTarget({
    chainId,
    from,
    depositWith,
    usePermit2,
  }: {
    chainId: ChainId;
    from: TokenAddress;
    depositWith: TokenAddress;
    usePermit2?: boolean;
  }): Address {
    if (usePermit2) {
      return PERMIT2_ADDRESS;
    } else if (isSameAddress(from, depositWith)) {
      return DCA_HUB_ADDRESS;
    } else {
      return COMPANION_ADDRESS;
    }
  }

  preparePermitData(args: SinglePermitParams): Promise<PermitData> {
    return this.permit2Service.preparePermitData({ ...args, spender: COMPANION_ADDRESS });
  }

  async buildCreatePositionTx({
    chainId,
    from,
    to,
    swapInterval,
    amountOfSwaps,
    owner,
    permissions,
    deposit,
  }: CreateDCAPositionParams): Promise<BuiltTransaction> {
    let depositInfo: { token: Address; amount: bigint; value: bigint };
    if ('token' in deposit) {
      const amount = BigInt(deposit.amount);
      depositInfo = { token: deposit.token, amount, value: isSameAddress(deposit.token, Addresses.NATIVE_TOKEN) ? amount : 0n };
    } else {
      depositInfo = { token: deposit.permitData.token, amount: BigInt(deposit.permitData.amount), value: 0n };
    }

    const needsSwap = !isSameAddress(depositInfo.token, from.variantId);
    if ('token' in deposit && !needsSwap) {
      // If don't need to use Permit2, then just call the hub
      return {
        to: DCA_HUB_ADDRESS,
        data: encodeFunctionData({
          abi: dcaHubAbi,
          functionName: 'deposit',
          args: [
            from.variantId as ViemAddress,
            to.variantId as ViemAddress,
            depositInfo.amount,
            amountOfSwaps,
            swapInterval,
            owner as ViemAddress,
            permissions.map(({ operator, permissions }) => ({ operator: operator as ViemAddress, permissions })),
          ],
        }),
      };
    }

    // If we get to this point, then we'll use the Companion for the deposit
    const calls: Call[] = [];

    // Handle take from caller (if necessary)
    const recipient = needsSwap ? COMPANION_SWAPPER_ADDRESS : COMPANION_ADDRESS;
    if ('permitData' in deposit) {
      calls.push(buildTakeFromCallerWithPermit(deposit.permitData, deposit.signature, recipient));
    } else if (!isSameAddress(depositInfo.token, Addresses.NATIVE_TOKEN)) {
      calls.push(buildTakeFromCaller(depositInfo.token, depositInfo.amount, recipient));
    }

    // Handle swap
    if (needsSwap) {
      const { swapData } = await this.getSwapData({
        request: {
          chainId,
          sellToken: depositInfo.token,
          buyToken: from.variantId,
          order: { type: 'sell', sellAmount: depositInfo.amount },
        },
        leftoverRecipient: owner,
        swapConfig: deposit?.swapConfig,
      });
      calls.push(swapData);
    }

    // Handle deposit
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'depositWithBalanceOnContract',
        args: [
          DCA_HUB_ADDRESS,
          from.variantId as ViemAddress,
          to.variantId as ViemAddress,
          amountOfSwaps,
          swapInterval,
          owner as ViemAddress,
          permissions.map(({ operator, permissions }) => ({ operator: operator as ViemAddress, permissions })),
          '0x',
        ],
      })
    );

    // Build multicall and return tx
    return buildCompanionMulticall({ calls, value: depositInfo.value });
  }

  async buildIncreasePositionTx({
    chainId,
    positionId,
    increase,
    amountOfSwaps,
    permissionPermit,
    dcaHub,
  }: IncreaseDCAPositionParams): Promise<BuiltTransaction> {
    const hubAddress = dcaHub ?? DCA_HUB_ADDRESS;
    let increaseInfo: { token: Address; amount: bigint; value: bigint };
    if (!increase) {
      increaseInfo = { token: Addresses.ZERO_ADDRESS, amount: 0n, value: 0n };
    } else if ('token' in increase) {
      const amount = BigInt(increase.amount);
      increaseInfo = { token: increase.token, amount, value: isSameAddress(increase.token, Addresses.NATIVE_TOKEN) ? amount : 0n };
    } else {
      increaseInfo = { token: increase.permitData.token, amount: BigInt(increase.permitData.amount), value: 0n };
    }

    const bigIntPositionId = BigInt(positionId);
    const [positionOwner, position] = await this.multicallService.readOnlyMulticall({
      chainId,
      calls: [
        { abi: { humanReadable: ERC721_ABI }, address: DCA_PERMISSION_MANAGER_ADDRESS, functionName: 'ownerOf', args: [bigIntPositionId] },
        { abi: { json: dcaHubAbi }, address: hubAddress, functionName: 'userPosition', args: [bigIntPositionId] },
      ],
    });

    const needsSwap = !isSameAddress(increaseInfo.token, position.from);
    const callHubDirectly = !increase || increaseInfo.amount === 0n || amountOfSwaps === 0 || ('token' in increase && !needsSwap);

    if (callHubDirectly) {
      // If don't need to use Permit2, then just call the hub
      return {
        to: hubAddress,
        data: encodeFunctionData({
          abi: dcaHubAbi,
          functionName: 'increasePosition',
          args: [BigInt(positionId), BigInt(increaseInfo.amount), amountOfSwaps],
        }),
      };
    }

    // If we get to this point, then we'll use the Companion for the increase
    const calls: Call[] = [];

    const recipient = needsSwap ? COMPANION_SWAPPER_ADDRESS : COMPANION_ADDRESS;
    if ('permitData' in increase!) {
      // Handle take from caller (if necessary)
      calls.push(buildTakeFromCallerWithPermit(increase.permitData, increase.signature, recipient));
    } else if (!isSameAddress(increaseInfo.token, Addresses.NATIVE_TOKEN)) {
      calls.push(buildTakeFromCaller(increaseInfo.token, increaseInfo.amount, recipient));
    }

    if (needsSwap) {
      const { swapData } = await this.getSwapData({
        request: {
          chainId,
          sellToken: increaseInfo.token,
          buyToken: position.from,
          order: { type: 'sell', sellAmount: increaseInfo.amount },
        },
        leftoverRecipient: positionOwner,
        swapConfig: increase?.swapConfig,
      });
      calls.push(swapData);
    }

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Handle increase
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'increasePositionWithBalanceOnContract',
        args: [hubAddress as ViemAddress, bigIntPositionId, amountOfSwaps],
      })
    );

    // Build multicall and return tx
    return buildCompanionMulticall({ calls, value: increaseInfo?.value });
  }

  async buildReducePositionTx({
    chainId,
    positionId,
    amountOfSwaps,
    reduce,
    recipient,
    permissionPermit,
    dcaHub,
  }: ReduceDCAPositionParams): Promise<BuiltTransaction> {
    const hubAddress = dcaHub ?? DCA_HUB_ADDRESS;
    const position = await this.getUserPosition(chainId, hubAddress, positionId);
    const shouldConvert = reduce.convertTo && !isSameAddress(position.from, reduce.convertTo);

    if (!shouldConvert) {
      // If don't need to convert anything, then just call the hub
      return {
        to: hubAddress,
        data: encodeFunctionData({
          abi: dcaHubAbi,
          functionName: 'reducePosition',
          args: [BigInt(positionId), BigInt(reduce.amount), amountOfSwaps, recipient as ViemAddress],
        }),
      };
    }

    // If we get to this point, then we'll use the Companion for swap & transfer
    const calls: Call[] = [];

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Handle reduce
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'reducePosition',
        args: [hubAddress as ViemAddress, BigInt(positionId), BigInt(reduce.amount), amountOfSwaps, COMPANION_SWAPPER_ADDRESS],
      })
    );

    // Handle swap
    const outToken = reduce.convertTo!;
    const { swapData } = await this.getSwapData({
      request: {
        chainId,
        sellToken: position.from,
        buyToken: outToken,
        order: { type: 'sell', sellAmount: reduce.amount },
      },
      leftoverRecipient: recipient,
      swapConfig: reduce?.swapConfig,
    });
    calls.push(swapData);

    // Handle transfer
    calls.push(buildSendAllBalance(outToken, recipient));

    // Build multicall and return tx
    return buildCompanionMulticall({ calls });
  }

  async buildReduceToBuyPositionTx({
    chainId,
    positionId,
    amountOfSwaps,
    reduce,
    recipient,
    permissionPermit,
    dcaHub,
  }: ReduceToBuyDCAPositionParams): Promise<BuiltTransaction> {
    const hubAddress = dcaHub ?? DCA_HUB_ADDRESS;
    const calls: Call[] = [];

    const position = await this.getUserPosition(chainId, hubAddress, positionId);
    const shouldConvert = reduce.convertTo && !isSameAddress(position.from, reduce.convertTo);
    if (amountOfSwaps === 0 || !shouldConvert) {
      // In these two scenarios, we can use the normal reduce
      const amount =
        amountOfSwaps === 0
          ? position.remaining // Withdraw everything
          : reduce.amountToBuy; // Withdraw the specified amount
      return this.buildReducePositionTx({
        chainId,
        positionId,
        amountOfSwaps,
        reduce: { amount, convertTo: reduce.convertTo, swapConfig: reduce.swapConfig },
        recipient,
        permissionPermit,
        dcaHub,
      });
    }

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Calculate swap (we know we need to swap if we got to this point)
    const outToken = reduce.convertTo!;
    const { bestQuote: buyQuote, swapData } = await this.getSwapData({
      request: {
        chainId,
        sellToken: position.from,
        buyToken: outToken,
        order: { type: 'buy', buyAmount: reduce.amountToBuy },
      },
      leftoverRecipient: recipient,
      swapConfig: reduce?.swapConfig,
    });

    // If we are asking for more than available, then fail
    if (BigInt(buyQuote.maxSellAmount.amount) > position.remaining) {
      throw new Error('Trying to withdraw more than available');
    }

    // Handle reduce
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'reducePosition',
        args: [hubAddress as ViemAddress, BigInt(positionId), BigInt(buyQuote.maxSellAmount.amount), amountOfSwaps, COMPANION_SWAPPER_ADDRESS],
      })
    );

    // Add swap to calls list (needs to go after reduce)
    calls.push(swapData);

    // Handle transfer
    calls.push(buildSendAllBalance(outToken, recipient));

    // Build multicall and return tx
    return buildCompanionMulticall({ calls });
  }

  async buildWithdrawPositionTx({
    chainId,
    positionId,
    withdraw,
    recipient,
    permissionPermit,
    dcaHub,
  }: WithdrawDCAPositionParams): Promise<BuiltTransaction> {
    const hubAddress = dcaHub ?? DCA_HUB_ADDRESS;
    const position = await this.getUserPosition(chainId, hubAddress, positionId);
    const shouldConvert = withdraw.convertTo && !isSameAddress(position.to, withdraw.convertTo);

    if (!shouldConvert) {
      // If don't need to convert anything, then just call the hub
      return {
        to: hubAddress,
        data: encodeFunctionData({
          abi: dcaHubAbi,
          functionName: 'withdrawSwapped',
          args: [BigInt(positionId), recipient as ViemAddress],
        }),
      };
    }

    // If we get to this point, then we'll use the Companion for swap & transfer
    const calls: Call[] = [];

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Handle withdraw
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'withdrawSwapped',
        args: [hubAddress as ViemAddress, BigInt(positionId), COMPANION_SWAPPER_ADDRESS],
      })
    );

    // Handle swap
    const outToken = withdraw.convertTo!;
    const { swapData } = await this.getSwapData({
      request: {
        chainId,
        sellToken: position.to,
        buyToken: outToken,
        order: { type: 'sell', sellAmount: position.swapped },
      },
      leftoverRecipient: recipient,
      swapConfig: withdraw?.swapConfig,
    });
    calls.push(swapData);

    // Handle transfer
    calls.push(buildSendAllBalance(outToken, recipient));

    // Build multicall and return tx
    return buildCompanionMulticall({ calls });
  }

  async buildTerminatePositionTx({
    chainId,
    positionId,
    withdraw,
    recipient,
    permissionPermit,
    dcaHub,
  }: TerminateDCAPositionParams): Promise<BuiltTransaction> {
    const hubAddress = dcaHub ?? DCA_HUB_ADDRESS;
    const position = await this.getUserPosition(chainId, hubAddress, positionId);
    const shouldConvertUnswapped =
      position.remaining > 0 && !!withdraw.unswappedConvertTo && !isSameAddress(position.from, withdraw.unswappedConvertTo);
    const shouldConvertSwapped = position.swapped > 0 && !!withdraw.swappedConvertTo && !isSameAddress(position.to, withdraw.swappedConvertTo);

    if (!shouldConvertUnswapped && !shouldConvertSwapped) {
      // If don't need to convert anything, then just call the hub
      return {
        to: hubAddress,
        data: encodeFunctionData({
          abi: dcaHubAbi,
          functionName: 'terminate',
          args: [BigInt(positionId), recipient as ViemAddress, recipient as ViemAddress],
        }),
      };
    }

    // If we get to this point, then we'll use the Companion for swap & transfer
    const calls: Call[] = [];

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Handle terminate
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'terminate',
        args: [
          hubAddress as ViemAddress,
          BigInt(positionId),
          shouldConvertUnswapped ? COMPANION_SWAPPER_ADDRESS : (recipient as ViemAddress),
          shouldConvertSwapped ? COMPANION_SWAPPER_ADDRESS : (recipient as ViemAddress),
        ],
      })
    );

    // Handle swaps
    let unswappedPromise: Promise<any>, swappedPromise: Promise<any>;
    if (shouldConvertUnswapped) {
      const convertTo = withdraw.unswappedConvertTo!;
      unswappedPromise = this.getSwapData({
        request: {
          chainId,
          sellToken: position.from,
          buyToken: convertTo,
          order: { type: 'sell', sellAmount: position.remaining },
        },
        leftoverRecipient: recipient,
        swapConfig: withdraw.swapConfig,
      }).then(({ swapData }) =>
        calls.push(
          swapData, // Swap
          buildSendAllBalance(convertTo, recipient) // Transfer
        )
      );
    } else {
      unswappedPromise = Promise.resolve();
    }
    if (shouldConvertSwapped) {
      const convertTo = withdraw.swappedConvertTo!;
      swappedPromise = this.getSwapData({
        request: {
          chainId,
          sellToken: position.to,
          buyToken: convertTo,
          order: { type: 'sell', sellAmount: position.swapped },
        },
        leftoverRecipient: recipient,
        swapConfig: withdraw.swapConfig,
      }).then(({ swapData }) =>
        calls.push(
          swapData, // Swap
          buildSendAllBalance(convertTo, recipient) // Transfer
        )
      );
    } else {
      swappedPromise = Promise.resolve();
    }
    await Promise.all([unswappedPromise, swappedPromise]);

    // Build multicall and return tx
    return buildCompanionMulticall({ calls });
  }

  async buildMigratePositionTx({
    chainId,
    sourceHub,
    targetHub,
    positionId,
    migration,
    permissionPermit,
  }: MigrateDCAPositionParams): Promise<BuiltTransaction> {
    const bigIntPositionId = BigInt(positionId);
    const [positionOwner, position] = await this.multicallService.readOnlyMulticall({
      chainId,
      calls: [
        { abi: { humanReadable: ERC721_ABI }, address: DCA_PERMISSION_MANAGER_ADDRESS, functionName: 'ownerOf', args: [bigIntPositionId] },
        { abi: { json: dcaHubAbi }, address: sourceHub, functionName: 'userPosition', args: [bigIntPositionId] },
      ],
    });

    const newFrom = migration.newFrom?.variantId ?? position.from;
    const shouldConvertUnswapped = migration.useFundsFrom !== 'swapped' && position.remaining > 0 && !isSameAddress(position.from, newFrom);
    const shouldConvertSwapped = migration.useFundsFrom !== 'unswapped' && position.swapped > 0 && !isSameAddress(position.to, newFrom);
    const calls: Call[] = [];

    // Handle permission permit
    if (permissionPermit) {
      calls.push(buildPermissionPermit(permissionPermit));
    }

    // Handle terminate
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'terminate',
        args: [
          sourceHub as ViemAddress,
          bigIntPositionId,
          shouldConvertUnswapped
            ? COMPANION_SWAPPER_ADDRESS
            : migration.useFundsFrom !== 'swapped'
            ? COMPANION_ADDRESS
            : (migration.sendUnusedFundsTo as ViemAddress),
          shouldConvertSwapped
            ? COMPANION_SWAPPER_ADDRESS
            : migration.useFundsFrom !== 'unswapped'
            ? COMPANION_ADDRESS
            : (migration.sendUnusedFundsTo as ViemAddress),
        ],
      })
    );

    // Handle swaps
    let unswappedPromise: Promise<any>, swappedPromise: Promise<any>;
    if (shouldConvertUnswapped) {
      unswappedPromise = this.getSwapData({
        request: {
          chainId,
          sellToken: position.from,
          buyToken: newFrom,
          order: { type: 'sell', sellAmount: position.remaining },
        },
        leftoverRecipient: positionOwner,
        swapConfig: migration?.swapConfig,
      }).then(({ swapData }) => calls.push(swapData));
    } else {
      unswappedPromise = Promise.resolve();
    }
    if (shouldConvertSwapped) {
      swappedPromise = this.getSwapData({
        request: {
          chainId,
          sellToken: position.to,
          buyToken: newFrom,
          order: { type: 'sell', sellAmount: position.swapped },
        },
        leftoverRecipient: positionOwner,
        swapConfig: migration?.swapConfig,
      }).then(({ swapData }) => calls.push(swapData));
    } else {
      swappedPromise = Promise.resolve();
    }

    await Promise.all([unswappedPromise, swappedPromise]);

    // Handle re-deposit
    calls.push(
      encodeFunctionData({
        abi: companionAbi,
        functionName: 'depositWithBalanceOnContract',
        args: [
          targetHub as ViemAddress,
          newFrom,
          (migration.newTo?.variantId ?? position.to) as ViemAddress,
          position.swapsLeft,
          position.swapInterval,
          positionOwner,
          [],
          '0x',
        ],
      })
    );

    // Build multicall and return tx
    return buildCompanionMulticall({ calls });
  }

  private async getSwapData({
    request,
    leftoverRecipient,
    swapConfig,
  }: {
    request: Pick<QuoteRequest, 'chainId' | 'sellToken' | 'buyToken' | 'order'>;
    leftoverRecipient: Address;
    swapConfig: DCAActionSwapConfig | undefined;
  }) {
    const txValidFor = swapConfig?.txValidFor ?? '1w';
    const bestQuote = await this.quoteService.getBestQuote({
      request: {
        ...request,
        slippagePercentage: swapConfig?.slippagePercentage ?? 0.3,
        takerAddress: COMPANION_SWAPPER_ADDRESS,
        recipient: COMPANION_SWAPPER_ADDRESS,
        txValidFor,
        filters: { includeSources: ['mean-finance'] }, // TODO: allow more sources and simulate to find the best one
        sourceConfig: { custom: { ['mean-finance']: { leftoverRecipient } } },
      },
      config: {
        timeout: '5s',
      },
    });

    const allowanceTargets = isSameAddress(bestQuote.source.allowanceTarget, Addresses.ZERO_ADDRESS)
      ? []
      : [{ token: bestQuote.sellToken.address, target: bestQuote.source.allowanceTarget }];

    // Swap adapter uses the cero address as the native token
    const tokenOutDistribution = isSameAddress(bestQuote.buyToken.address, Addresses.NATIVE_TOKEN)
      ? Addresses.ZERO_ADDRESS
      : bestQuote.buyToken.address;

    const arbitraryCall = this.permit2Service.arbitrary.buildArbitraryCallWithoutPermit({
      allowanceTargets,
      calls: [{ to: bestQuote.tx.to, data: bestQuote.tx.data, value: bestQuote.tx.value ?? 0 }],
      distribution: { [tokenOutDistribution]: [{ recipient: COMPANION_ADDRESS, shareBps: 0 }] },
      txValidFor,
    });

    const swapData = encodeFunctionData({
      abi: companionAbi,
      functionName: 'runSwap',
      args: [
        Addresses.ZERO_ADDRESS, // No need to set it because we are already transferring the funds to the swapper
        BigInt(bestQuote.tx.value ?? 0),
        arbitraryCall.data as Hex,
        bestQuote.buyToken.address as ViemAddress,
        BigInt(bestQuote.minBuyAmount.amount),
      ],
    });

    return { bestQuote, swapData };
  }

  private async getUserPosition(
    chainId: ChainId,
    hubAddress: Address,
    positionId: BigIntish
  ): Promise<{ from: TokenAddress; to: TokenAddress; remaining: bigint; swapped: bigint }> {
    const [position] = await this.multicallService.readOnlyMulticall({
      chainId,
      calls: [{ abi: { json: dcaHubAbi }, address: hubAddress, functionName: 'userPosition', args: [BigInt(positionId)] }],
    });
    return { ...position, remaining: BigInt(position.remaining), swapped: BigInt(position.swapped) };
  }
}

function buildTakeFromCallerWithPermit(
  { token, amount, nonce, deadline }: PermitData['permitData'],
  signature: string,
  recipient: Address
): Hex {
  return encodeFunctionData({
    abi: companionAbi,
    functionName: 'permitTakeFromCaller',
    args: [token as ViemAddress, BigInt(amount), BigInt(nonce), BigInt(deadline), signature as Hex, recipient as ViemAddress],
  });
}

function buildTakeFromCaller(token: TokenAddress, amount: BigIntish, recipient: Address): Hex {
  return encodeFunctionData({
    abi: companionAbi,
    functionName: 'takeFromCaller',
    args: [token as ViemAddress, BigInt(amount), recipient as ViemAddress],
  });
}

function buildPermissionPermit(permit: DCAPermissionPermit): Hex {
  return encodeFunctionData({
    abi: companionAbi,
    functionName: 'permissionPermit',
    args: [
      DCA_PERMISSION_MANAGER_ADDRESS,
      permit.permissions.map(({ operator, permissions }) => ({ operator: operator as ViemAddress, permissions })),
      BigInt(permit.tokenId),
      BigInt(permit.deadline),
      parseInt(permit.v.toString()),
      permit.r as Hex,
      permit.s as Hex,
    ],
  });
}

function buildSendAllBalance(token: TokenAddress, recipient: Address): Hex {
  return encodeFunctionData({
    abi: companionAbi,
    functionName: 'sendBalanceOnContractToRecipient',
    args: [token as ViemAddress, recipient as ViemAddress],
  });
}

async function buildCompanionMulticall({ calls, value }: { calls: Call[]; value?: bigint }) {
  const data = encodeFunctionData({
    abi: companionAbi,
    functionName: 'multicall',
    args: [calls],
  });
  return { to: COMPANION_ADDRESS, data, value: value?.toString() };
}

type Call = Hex;
