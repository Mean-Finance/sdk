import { Chains } from '@chains';

export const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';
export const PERMIT2_ADAPTER_ADDRESS = '0xED306e38BB930ec9646FF3D917B2e513a97530b1';
export const WORDS_FOR_NONCE_CALCULATION = 10;
export const PERMIT2_SUPPORTED_CHAINS = [
  Chains.ETHEREUM,
  Chains.POLYGON,
  Chains.BNB_CHAIN,
  Chains.AVALANCHE,
  Chains.FANTOM,
  Chains.ARBITRUM,
  Chains.OPTIMISM,
  Chains.BASE,
  Chains.MOONRIVER,
  Chains.MOONBEAM,
  Chains.FUSE,
  Chains.EVMOS,
  Chains.CELO,
  Chains.GNOSIS,
  Chains.KAVA,
  Chains.OKC,
  Chains.LINEA,
  Chains.ROOTSTOCK,
].map(({ chainId }) => chainId);
