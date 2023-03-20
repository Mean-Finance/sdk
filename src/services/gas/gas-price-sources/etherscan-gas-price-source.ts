import { ChainId, FieldsRequirements, SupportRecord, TimeString } from '@types';
import { IGasPriceSource, GasPrice, GasPriceResult, GasValueForVersions } from '@services/gas/types';
import { IFetchService } from '@services/fetch/types';
import { Chains } from '@chains';
import { utils } from 'ethers';

const CHAINS = {
  [Chains.ETHEREUM.chainId]: 'etherscan.io',
  [Chains.POLYGON.chainId]: 'polygonscan.com',
  [Chains.BNB_CHAIN.chainId]: 'bscscan.com',
  [Chains.FANTOM.chainId]: 'ftmscan.com',
};

type GasValues = GasValueForVersions<'standard' | 'fast' | 'instant'>;
export class EtherscanGasPriceSource implements IGasPriceSource<GasValues> {
  constructor(private readonly fetchService: IFetchService, private readonly apiKeys?: Record<ChainId, string>) {}

  supportedSpeeds() {
    const support: SupportRecord<GasValues> = { standard: 'present', fast: 'present', instant: 'present' };
    return Object.fromEntries(Object.keys(CHAINS).map((chainId) => [Number(chainId), support]));
  }

  async getGasPrice<Requirements extends FieldsRequirements<GasValues>>({
    chainId,
    config,
  }: {
    chainId: ChainId;
    config?: { timeout?: TimeString };
  }) {
    let url = `https://api.${CHAINS[chainId]}/api?module=gastracker&action=gasoracle`;
    if (this.apiKeys?.[chainId]) {
      url += `&apikey=${this.apiKeys[chainId]} `;
    }

    const response = await this.fetchService.fetch(url, { timeout: config?.timeout });
    const {
      result: { SafeGasPrice, ProposeGasPrice, FastGasPrice, suggestBaseFee },
    }: { result: { SafeGasPrice: string; ProposeGasPrice: string; FastGasPrice: string; suggestBaseFee?: string } } = await response.json();
    return {
      standard: calculateGas(SafeGasPrice, suggestBaseFee),
      fast: calculateGas(ProposeGasPrice, suggestBaseFee),
      instant: calculateGas(FastGasPrice, suggestBaseFee),
    } as GasPriceResult<GasValues, Requirements>;
  }
}

function calculateGas(price: string, baseFee?: string): GasPrice {
  const gasPrice = utils.parseUnits(price, 'gwei');
  if (!baseFee) return { gasPrice: gasPrice.toString() };
  const base = utils.parseUnits(baseFee, 'gwei');
  return {
    maxFeePerGas: gasPrice.toString(),
    maxPriorityFeePerGas: gasPrice.sub(base).toString(),
  };
}
