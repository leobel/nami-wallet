import { apiRequest, addressToHex } from "../../util";
import Loader from '../../loader';

class TangoCrypto {
	async getAddressTransactions(address, limit, size, order = 'desc'){
		const result = await apiRequest(
			`/addresses/${address}/transactions?page=${size}&order=${order}&count=${limit}`
		);
		if (!result || result.error) return [];
		return result.map((tx) => ({
			txHash: tx.hash,
			txIndex: tx.block_index,
			blockHeight: tx.block_no,
		}));
	}

	// pending add SMASH to get pool information
	async getPoolDelegation(stakeAddress) {
		const stake = await apiRequest(
			`/wallets/${stakeAddress}`
		);
		if (!stake || stake.error || !stake.pool_id) return {};
		const delegation = await apiRequest(
			`/pools/${stake.pool_id}/metadata`
		);
		if (!delegation || delegation.error) return {};
		return {
			active: stake.active,
			rewards: stake.withdraw_available,
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
		const value = await this.assetsToValue(result.ada, result.assets);
		return value;
	}

	async getStakeBalance(stakeAddress) {
		const result = await apiRequest(
			`/wallets/${stakeAddress}`
		);
		if (result.error) return '0';
		return (
			BigInt(result.controlled_total_stake) - BigInt(result.withdraw_available)
		).toString();
	}

	async getAddresses(stakeAddress, limit = 2) {
		const result = await apiRequest(
			`/wallets/${stakeAddress}/addresses?count=${limit}`
		);
		return result;
	}

	async getAddressUtxos(address, page, limit = 100) {
		let result = await apiRequest(
			`/addresses/${address}/utxos?page=${page}&count=${limit}`
		);
		if (result.error) {
			if (result.status_code === 400) throw APIError.InvalidRequest;
			else {
				throw APIError.InternalError;
			}
		}
	
		const addressHex = await addressToHex(address);
		let converted = await Promise.all(
			result.map(async (utxo) => await this.utxoFromJson(utxo, addressHex))
		);
		return converted;
	}

	async getTransaction(txHash) {
		const result = await apiRequest(`/transactions/${txHash}`);
		if (!result || result.error) return null;
		let output_amount = result.assets;
		output_amount.unshift({
			unit: "lovelace",
			quantity: result.out_sum
		})
		return {
			hash: result.hash,
			block: result.block.hash,
			block_height: result.block.block_no,
			slot: result.block.slot_no,
			index: result.block_index,
			output_amount,
			fees: result.fees,
			deposit: result.deposit,
			size: result.size,
			invalid_before: result.invalid_before,
			invalid_hereafter: result.invalid_hereafter,
			utxo_count: result.utxo_count,
			withdrawal_count: result.withdrawal_count,
			mir_cert_count: result.mir_cert_count,
			delegation_count: result.delegation_count,
			stake_cert_count: result.stake_cert_count,
			pool_update_count: result.pool_update_count,
			pool_retire_count: result.pool_retire_count,
			asset_mint_or_burn_count: result.asset_mint_or_burn_count
		};
	}

	async getBlock(blockHashOrNumb) {
		const result = await apiRequest(`/blocks/${blockHashOrNumb}`);
		if (!result || result.error) return null;
		return {
			time: new Date(result.time).getTime(),
			height: result.block_no,
			hash: result.hash,
			slot: result.slot_no,
			epoch: result.epoch_no,
			epoch_slot: result.epoch_slot_no,
			slot_leader: result.slot_leader,
			size: result.size,
			tx_count: result.tx_count,
			output: result.out_sum,
			fees: result.fees,
			block_vrf: result.vrf_key,
			previous_block: result.previous_block,
			next_block: result.next_block,
			confirmations: result.confirmations
		};
	}

	async getTransactionUtxos(txHash) {
		const result = await apiRequest(`/transactions/${txHash}/utxos`);
		if (!result || result.error) return null;
		let inputs = result.inputs.map(input => {
			let item = { address: input.address, tx_hash: input.hash, output_index: input.index };
			item.amount = [{unit: 'lovelace', quantity: input.value}, ...input.assets.map(a => ({unit: `${a.policy_id}${Buffer.from(a.asset_name).toString('hex')}`, quantity: a.quantity}))]
			return item;
		});
		let outputs = result.outputs.map(output => {
			let item = { address: output.address };
			item.amount = [{unit: 'lovelace', quantity: output.value}, ...output.assets.map(a => ({unit: `${a.policy_id}${Buffer.from(a.asset_name).toString('hex')}`, quantity: a.quantity}))]
			return item;
		});
		return {
			hash: result.hash,
			inputs,
			outputs
		};
	}

	async getTransactionMetadata(txHash) {
		const result = await apiRequest(`/transactions/${txHash}/metadata`);
		if (!result || result.error) return null;
		return result.map(item => ({label: item.key, json_metadata: item.json}));
	}

	async submitTx(tx) {
		const result = await apiRequest(`/transactions/submit`,
			{ 'Content-Type': 'application/json' },
			JSON.stringify({tx: tx})
		);
		if (result.error) {
			if (result.status_code === 400) throw TxSendError.Failure;
			else if (result.status_code === 500) throw APIError.InternalError;
			else if (result.status_code === 429) throw TxSendError.Refused;
			else throw APIError.InvalidRequest;
		}
		return result.txId;
	}

	async getAsset(assetUnit) {
		let asset = await apiRequest(`/assets/${assetUnit}`);
		return {
			asset: `${asset.policy_id}${asset.asset_name}`,
			policy_id: asset.policy_id,
			asset_name: asset.asset_name,
			fingerprint: asset.fingerprint,
			quantity: asset.quantity,
			initial_mint_tx_hash: asset.initial_mint_tx_hash,
			mint_or_burn_count: asset.mint_or_burn_count,
			onchain_metadata: {
				...asset.metadata.json[asset.policy_id][Buffer.from(aasset.asset_name, 'hex')]
			},
		};
	}

	async getLatestBlock() {
		let block = await apiRequest('/blocks/latest');
		return {
			time: new Date(block.time).getTime(),
			height: block.block_no,
			hash: block.hash,
			slot: block.slot_no,
			epoch: block.epoch_no,
			epoch_slot: block.epoch_slot_no,
			slot_leader: block.slot_leader,
			size: block.size,
			tx_count: block.tx_count,
			output: block.out_sum,
			fees: block.fees,
			block_vrf: block.vrf_key,
			previous_block: block.previous_block,
			next_block: block.next_block,
			confirmations: block.confirmations
		}
	}

	async getEpochParameters(epoch) {
		let params = await apiRequest(`/epochs/${epoch}/parameters`);
		return {
			epoch: epoch,
			min_fee_a: params.min_fee_a,
			min_fee_b: params.min_fee_b,
			max_block_size: params.max_block_size,
			max_tx_size: params.max_tx_size,
			max_block_header_size: params.max_block_header_size,
			key_deposit: params.key_deposit,
			pool_deposit: params.pool_deposit,
			e_max: params.max_epoch,
			n_opt: params.optimal_pool_count,
			a0: params.influence_a0,
			rh0: params.monetary_expand_rate_rho,
			tau: params.treasury_growth_rate_tau,
			decentralisation_param: params.decentralisation,
			extra_entropy: params.entropy,
			protocol_major_ver: params.protocol_major,
			protocol_minor_ver: params.protocol_minor,
			min_utxo: params.min_utxo,
			min_pool_cost: params.min_pool_cost,
			nonce: params.nonce
		}
	}

	async utxoFromJson(output, address){
		await Loader.load();
		return Loader.Cardano.TransactionUnspentOutput.new(
			Loader.Cardano.TransactionInput.new(
				Loader.Cardano.TransactionHash.from_bytes(
					Buffer.from(output.hash, 'hex')
				),
				output.index
			),
			Loader.Cardano.TransactionOutput.new(
				Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex')),
				await this.assetsToValue(output.value, output.assets)
			)
		);
	}

	async assetsToValue(ada, assets) {
		await Loader.load();
		console.log('AssetsToValue ADA', ada);
		console.log('AssetsToValue Asses', JSON.stringify(assets));
		const value = Loader.Cardano.Value.new(
			Loader.Cardano.BigNum.from_str(ada.toString())
		);
		const multiAsset = Loader.Cardano.MultiAsset.new();
		const policies = [...new Set(assets.map(asset => asset.policy_id))];
		policies.forEach((policy) => {
			const policyAssets = assets.filter(asset => asset.policy_id === policy);
			const assetsValue = Loader.Cardano.Assets.new();
			policyAssets.forEach((asset) => {
				assetsValue.insert(
					Loader.Cardano.AssetName.new(Buffer.from(asset.asset_name, 'hex')),
					Loader.Cardano.BigNum.from_str(asset.quantity)
				);
			});
			multiAsset.insert(
				Loader.Cardano.ScriptHash.from_bytes(Buffer.from(policy, 'hex')),
				assetsValue
			);
		});

		if (assets.length > 0) value.set_multiasset(multiAsset);
		console.log('Finished !');
		return value;
	}

}

export default new TangoCrypto();