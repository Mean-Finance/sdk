import chai, { expect } from 'chai';
import { ChainId } from '@types';
import { AggregatorGasPriceSource, GasPriceAggregationMethod } from '@services/gas/gas-price-sources/aggregator-gas-price-source';
import { given, then, when } from '@test-utils/bdd';
import { GasPriceResult, IGasPriceSource } from '@services/gas/types';
import chaiAsPromised from 'chai-as-promised';
import { Chains } from '@chains';
import { LogsService } from '@services/logs/logs-service';
chai.use(chaiAsPromised);

const LOGS_SERVICE = new LogsService('OFF');

describe('Aggregator Gas Price Source', () => {
  const CHAIN_ID = Chains.ETHEREUM.chainId;
  const LEGACY = (amount: number) => ({ gasPrice: amount.toString() });
  const EIP = (fee: number, priorityFee: number) => ({ maxFeePerGas: fee.toString(), maxPriorityFeePerGas: priorityFee.toString() });

  when('trying to create without sources', () => {
    then('an error is thrown', () => {
      expect(() => new AggregatorGasPriceSource(LOGS_SERVICE, [], 'median')).to.throw('No sources were specified');
    });
  });

  when('there are no sources for chain', () => {
    then('error is thrown', async () => {
      const price = { standard: LEGACY(100) };
      const source = new AggregatorGasPriceSource(LOGS_SERVICE, [buildSource(price, CHAIN_ID)], 'median');
      await expect(source.getGasPrice({ chainId: 2 })).to.eventually.be.rejectedWith(`Chain with id 2 cannot support the given requirements`);
    });
  });

  when('all sources fail', () => {
    then('error is thrown', async () => {
      const source = new AggregatorGasPriceSource(LOGS_SERVICE, [buildSourceThatFails(CHAIN_ID)], 'median');
      await expect(source.getGasPrice({ chainId: CHAIN_ID })).to.eventually.be.rejectedWith('Failed to calculate gas on all sources');
    });
  });

  when('one source works, but it doesnt meet the requirements', () => {
    then('error is thrown', async () => {
      const price = { standard: LEGACY(100) };
      const source = new AggregatorGasPriceSource(
        LOGS_SERVICE,
        [buildSource(price, CHAIN_ID, { standard: 'present', fast: 'optional' })],
        'median'
      );
      await expect(
        source.getGasPrice({ chainId: CHAIN_ID, config: { fields: { requirements: { fast: 'required' } } } })
      ).to.eventually.be.rejectedWith('Could not fetch gas prices that met the given requirements');
    });
  });

  when('there is only one source that works', () => {
    then('that result is returned', async () => {
      const price = { standard: LEGACY(100) };
      const source = new AggregatorGasPriceSource(LOGS_SERVICE, [buildSource(price), buildSourceThatFails(CHAIN_ID)], 'median');
      expect(await source.getGasPrice({ chainId: CHAIN_ID })).to.deep.equal(price);
    });
  });

  when('there is a 1559 gas price', () => {
    then('legacy gas prices are ignored', async () => {
      const legacyPrice = { standard: LEGACY(100) };
      const eip1559Price = { standard: EIP(10, 20) };
      const source = new AggregatorGasPriceSource(LOGS_SERVICE, [buildSource(legacyPrice), buildSource(eip1559Price)], 'median');
      expect(await source.getGasPrice({ chainId: CHAIN_ID })).to.deep.equal(eip1559Price);
    });
  });

  when('there is a 1559 gas price, but legacy version supports more speeds', () => {
    then('1559 gas prices are ignored', async () => {
      const legacyPrice = { standard: LEGACY(100), fast: LEGACY(200) };
      const eip1559Price = { standard: EIP(10, 20) };
      const source = new AggregatorGasPriceSource(LOGS_SERVICE, [buildSource(legacyPrice), buildSource(eip1559Price)], 'median');
      expect(await source.getGasPrice({ chainId: CHAIN_ID })).to.deep.equal(legacyPrice);
    });
  });

  describe('Aggregation', () => {
    describe('EIP 1559', () => {
      aggregationTest({
        method: 'max',
        prices: [
          { standard: EIP(100, 10), fast: EIP(1000, 200) },
          { standard: EIP(500, 100), fast: EIP(900, 300) },
        ],
        expected: { standard: EIP(500, 100), fast: EIP(1000, 200) },
      });

      aggregationTest({
        method: 'min',
        prices: [
          { standard: EIP(100, 10), fast: EIP(1000, 200) },
          { standard: EIP(500, 100), fast: EIP(900, 300) },
        ],
        expected: { standard: EIP(100, 10), fast: EIP(900, 300) },
      });

      aggregationTest({
        method: 'median',
        prices: [
          { standard: EIP(800, 100), fast: EIP(1100, 300), instant: EIP(1000, 200) },
          { standard: EIP(100, 10), fast: EIP(1000, 200), instant: EIP(1500, 200) },
          { standard: EIP(500, 100), fast: EIP(900, 300), instant: EIP(800, 200) },
        ],
        expected: { standard: EIP(500, 100), fast: EIP(1000, 200), instant: EIP(1000, 200) },
      });
    });

    describe('Legacy', () => {
      aggregationTest({
        method: 'max',
        prices: [
          { standard: LEGACY(100), fast: LEGACY(1000) },
          { standard: LEGACY(500), fast: LEGACY(900) },
        ],
        expected: { standard: LEGACY(500), fast: LEGACY(1000) },
      });

      aggregationTest({
        method: 'min',
        prices: [
          { standard: LEGACY(100), fast: LEGACY(1000) },
          { standard: LEGACY(500), fast: LEGACY(900) },
        ],
        expected: { standard: LEGACY(100), fast: LEGACY(900) },
      });

      aggregationTest({
        method: 'median',
        prices: [
          { standard: LEGACY(800), fast: LEGACY(1100) },
          { standard: LEGACY(100), fast: LEGACY(1000) },
          { standard: LEGACY(500), fast: LEGACY(900) },
        ],
        expected: { standard: LEGACY(500), fast: LEGACY(1000) },
      });
    });
  });

  function aggregationTest({
    prices,
    expected,
    method,
  }: {
    prices: GasPriceResult<any>[];
    expected: GasPriceResult<any>;
    method: GasPriceAggregationMethod;
  }) {
    when(`aggregating by ${method}`, () => {
      let result: GasPriceResult<any>;
      given(async () => {
        const sources = prices.map((price) => buildSource(price, 1));
        const aggSource = new AggregatorGasPriceSource(LOGS_SERVICE, sources, method);
        result = await aggSource.getGasPrice({ chainId: 1 });
      });

      then('result is as expected', () => {
        expect(result).to.deep.equal(expected);
      });
    });
  }

  function buildSource(
    price: GasPriceResult<any>,
    chainId: ChainId = CHAIN_ID,
    supported?: Record<string, 'present' | 'optional'>
  ): IGasPriceSource<any> {
    const support = supported ?? Object.fromEntries(Object.keys(price).map((speed) => [speed, 'present']));
    return {
      supportedSpeeds: () => ({ [chainId]: support }),
      getGasPrice: () => Promise.resolve(price) as any,
    };
  }

  function buildSourceThatFails(...onChain: ChainId[]): IGasPriceSource<any> {
    return {
      supportedSpeeds: () => Object.fromEntries(onChain.map((chainId) => [chainId, { average: 'present' }])),
      getGasPrice: () => Promise.reject(new Error('Something failed')),
    };
  }
});
