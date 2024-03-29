import { DefaultRequirements, FieldsRequirements } from '@types';
import { isBigIntish } from '@shared/utils';
import { EIP1159GasPrice, GasPriceResult, SupportedGasValues } from './types';

export function isEIP1159Compatible<
  GasValues extends SupportedGasValues,
  Requirements extends FieldsRequirements<GasValues> = DefaultRequirements<GasValues>
>(gasPriceForSpeed: GasPriceResult<object, Requirements>): gasPriceForSpeed is GasPriceResult<OnlyEIP1559<GasValues>, Requirements> {
  const keys = Object.keys(gasPriceForSpeed);
  if (keys.length === 0) {
    throw new Error(`Found a gas price result with nothing on it. This shouldn't happen`);
  }
  const gasPrice = (gasPriceForSpeed as any)[keys[0]];
  if ('maxFeePerGas' in gasPrice && isBigIntish(gasPrice.maxFeePerGas)) {
    return true;
  }
  return false;
}

type OnlyEIP1559<GasValues extends SupportedGasValues> = {
  [K in keyof GasValues]: GasValues[K] extends EIP1159GasPrice ? GasValues[K] : never;
};

export function isValidGasPriceValue(value: any) {
  return ('maxFeePerGas' in value && isBigIntish(value.maxFeePerGas)) || ('gasPrice' in value && isBigIntish(value.gasPrice));
}

export function filterOutInvalidSpeeds(result: GasPriceResult<object>) {
  return Object.fromEntries(Object.entries(result).filter(([, value]) => isValidGasPriceValue(value)));
}
