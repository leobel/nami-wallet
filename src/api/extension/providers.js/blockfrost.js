import {
  APIError,
  TxSendError,
} from '../../../config/config';
import { addressToHex, assetsToValue, apiRequest, utxoFromJson } from "../../util";
import Loader from '../../loader';

class Blockfrost {
	async getAddressTransactions(address, limit, size, order = 'desc') {
		const result = await apiRequest(
			`/addresses/${address}/transactions?page=${size}&order=${order}&count=${limit}`
		);
		if (!result || result.error) return [];
		return result.map((tx) => ({
			txHash: tx.tx_hash,
			txIndex: tx.tx_index,
			blockHeight: tx.block_height,
		}));
	}

	async getPoolDelegation(stakeAddress) {
		const stake = await apiRequest(
			`/accounts/${stakeAddress}`
		);
		if (!stake || stake.error || !stake.pool_id) return {};
		const delegation = await apiRequest(
			`/pools/${stake.pool_id}/metadata`
		);
		if (!delegation || delegation.error) return {};
		return {
			active: stake.active,
			rewards: stake.withdrawable_amount,
			homepage: delegation.homepage,
			poolId: stake.pool_id,
			ticker: delegation.ticker,
			description: delegation.description,
			name: delegation.name,
		};
	}

	async getAddressBalance(address) {
		await Loader.load();
		const result = await apiRequest(
			`/addresses/${address}`
		);
		if (result.error) {
			if (result.status_code === 400) throw APIError.InvalidRequest;
			else if (result.status_code === 500) throw APIError.InternalError;
			else return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
		}
		const value = await assetsToValue(result.amount);
		return value;
	}

	async getStakeBalance(stakeAddress) {
		const result = await apiRequest(
			`/accounts/${stakeAddress}`
		);
		if (result.error) return '0';
		return (
			BigInt(result.controlled_amount) - BigInt(result.withdrawable_amount)
		).toString();
	}

	async getAddresses(stakeAddress, limit = 2) {
		const result = await apiRequest(
			`/accounts/${stakeAddress}/addresses?count=${limit}`
		);

		return result;
	}

	async getAddressUtxos(address, page, limit = 100) {
		let result = [];
		while (true) {
			let pageResult = await apiRequest(
				`/addresses/${address}/utxos?page=${page}&count=${limit}`
			);
			if (pageResult.error) {
				if (pageResult.status_code === 400) throw APIError.InvalidRequest;
				else if (pageResult.status_code === 500) throw APIError.InternalError;
				else {
					pageResult = [];
				}
			}
			result = result.concat(pageResult);
			if (pageResult.length <= 0) break;
			page++;
		}
	
		const addressHex = await addressToHex(address);
		let converted = await Promise.all(
			result.map(async (utxo) => await utxoFromJson(utxo, addressHex))
		);

		return converted;
	}

	async getTransaction(txHash) {
		const result = await apiRequest(`/txs/${txHash}`);
		if (!result || result.error) return null;
		return result;
	}

	async getBlock(blockHashOrNumb) {
		const result = await apiRequest(`/blocks/${blockHashOrNumb}`);
		if (!result || result.error) return null;
		return result;
	}

	async getTransactionUtxos(txHash) {
		const result = await apiRequest(`/txs/${txHash}/utxos`);
		if (!result || result.error) return null;
		return result;
	}

	async getTransactionMetadata(txHash) {
		const result = await apiRequest(`/txs/${txHash}/metadata`);
		if (!result || result.error) return null;
		return result;
	}

	async submitTx(tx) {
		const result = await apiRequest(
			`/tx/submit`,
			{ 'Content-Type': 'application/cbor' },
			Buffer.from(tx, 'hex')
		);
		if (result.error) {
			if (result.status_code === 400) throw TxSendError.Failure;
			else if (result.status_code === 500) throw APIError.InternalError;
			else if (result.status_code === 429) throw TxSendError.Refused;
			else throw APIError.InvalidRequest;
		}
		return result;
	}

	async getAsset(assetUnit) {
		return apiRequest(`/assets/${assetUnit}`);
	}

	async getLatestBlock() {
		return apiRequest('/blocks/latest');
	}

	async getEpochParameters(epoch) {
		return apiRequest(`/epochs/${epoch}/parameters`);
	}
}

export default new Blockfrost();