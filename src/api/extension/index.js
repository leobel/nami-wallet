import {
  APIError,
  DataSignError,
  ERROR,
  EVENT,
  NETWORK_ID,
  NODE,
  SENDER,
  STORAGE,
  TARGET,
  TxSignError,
} from '../../config/config';
import { POPUP_WINDOW } from '../../config/config';
import { mnemonicToEntropy } from 'bip39';
import cryptoRandomString from 'crypto-random-string';
import Loader from '../loader';
import { createAvatar } from '@dicebear/avatars';
import * as style from '@dicebear/avatars-bottts-sprites';
import {
	addressToHex,
  getApiProvider,
  networkNameToId,
  valueToAssets,
} from '../util';

export const getStorage = (key) =>
  new Promise((res, rej) =>
    chrome.storage.local.get(key, (result) => {
      if (chrome.runtime.lastError) rej(undefined);
      res(key ? result[key] : result);
    })
  );
export const setStorage = (item) =>
  new Promise((res, rej) =>
    chrome.storage.local.set(item, () => {
      if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
      res(true);
    })
  );

export const encryptWithPassword = async (password, rootKeyBytes) => {
  await Loader.load();
  const rootKeyHex = Buffer.from(rootKeyBytes, 'hex').toString('hex');
  const passwordHex = Buffer.from(password).toString('hex');
  const salt = cryptoRandomString({ length: 2 * 32 });
  const nonce = cryptoRandomString({ length: 2 * 12 });
  return Loader.Cardano.encrypt_with_password(
    passwordHex,
    salt,
    nonce,
    rootKeyHex
  );
};

export const decryptWithPassword = async (password, encryptedKeyHex) => {
  await Loader.load();
  const passwordHex = Buffer.from(password).toString('hex');
  let decryptedHex;
  try {
    decryptedHex = Loader.Cardano.decrypt_with_password(
      passwordHex,
      encryptedKeyHex
    );
  } catch (err) {
    throw new Error(ERROR.wrongPassword);
  }
  return decryptedHex;
};

export const getWhitelisted = async () => {
  const result = await getStorage(STORAGE.whitelisted);
  return result ? result : [];
};

export const isWhitelisted = async (_origin) => {
  const whitelisted = await getWhitelisted();
  let access = false;
  if (whitelisted.includes(_origin)) access = true;
  return access;
};

export const setWhitelisted = async (origin) => {
  let whitelisted = await getWhitelisted();
  whitelisted ? whitelisted.push(origin) : (whitelisted = [origin]);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};

export const removeWhitelisted = async (origin) => {
  const whitelisted = await getWhitelisted();
  const index = whitelisted.indexOf(origin);
  whitelisted.splice(index, 1);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};

export const getCurrency = () => getStorage(STORAGE.currency);

export const setCurrency = (currency) =>
  setStorage({ [STORAGE.currency]: currency });

export const getDelegation = async () => {
	const provider = await getApiProvider();
  const currentAccount = await getCurrentAccount();
	return provider.getPoolDelegation(currentAccount.rewardAddr);
  
};

export const getBalance = async () => {
	const provider = await getApiProvider();
	const currentAccount = await getCurrentAccount();
	return provider.getAddressBalance(currentAccount.paymentAddr);
};

export const getFullBalance = async () => {
	const provider = await getApiProvider();
  const currentAccount = await getCurrentAccount();
  return provider.getStakeBalance(currentAccount.rewardAddr);
};

export const setBalanceWarning = async () => {
	const provider = await getApiProvider();
  const currentAccount = await getCurrentAccount();
  const network = await getNetwork();
  let warning = { active: false, fullBalance: '0' };
  const result = await provider.getAddresses(currentAccount.rewardAddr);
  if (result.length > 1) {
    const fullBalance = await getFullBalance();
    if (fullBalance !== currentAccount[network.id].lovelace) {
      warning.active = true;
      warning.fullBalance = fullBalance;
    }
  }

  return warning;
};

export const getTransactions = async (paginate = 1, count = 10) => {
	const provider = await getApiProvider();
  const currentAccount = await getCurrentAccount();
	return provider.getAddressTransactions(currentAccount.paymentAddr, count, paginate);
};

export const getTxInfo = async (txHash) => {
	const provider = await getApiProvider();
	return provider.getTransaction(txHash);
};

export const getBlock = async (blockHashOrNumb) => {
	const provider = await getApiProvider();
  return provider.getBlock(blockHashOrNumb);
};

export const getTxUTxOs = async (txHash) => {
	const provider = await getApiProvider();
  return provider.getTransactionUtxos(txHash);
};

export const getTxMetadata = async (txHash) => {
	const provider = await getApiProvider();
  return provider.getTransactionMetadata(txHash);
};

export const updateTxInfo = async (txHash) => {
  const currentAccount = await getCurrentAccount();
  const network = await getNetwork();

  let detail = await currentAccount[network.id].history.details[txHash];

  if (typeof detail !== 'object' || Object.keys(detail).length < 4) {
    detail = {};
    const info = getTxInfo(txHash);
    const uTxOs = getTxUTxOs(txHash);
    const metadata = getTxMetadata(txHash);

    detail.info = await info;
    if (info) detail.block = await getBlock(detail.info.block_height);
    detail.utxos = await uTxOs;
    detail.metadata = await metadata;
  }

  return detail;
};

export const setTxDetail = async (txObject) => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  for (const txHash of Object.keys(txObject)) {
    const txDetail = txObject[txHash];
    accounts[currentIndex][network.id].history.details[txHash] = txDetail;
    await setStorage({
      [STORAGE.accounts]: {
        ...accounts,
      },
    });
    delete txObject[txHash];
  }
  return true;
};

/**
 *
 * @param {string} amount - cbor value
 * @param {Object} paginate
 * @param {number} paginate.page
 * @param {number} paginate.limit
 * @returns
 */
export const getUtxos = async (amount = undefined, paginate = undefined) => {
	const provider = await getApiProvider();
  const currentAccount = await getCurrentAccount();
  let result = [];
  let page = paginate && paginate.page ? paginate.page + 1 : 1;
  const limit = paginate && paginate.limit ? paginate.limit : 100;
	let converted = await provider.getAddressUtxos(currentAccount.paymentAddr, page, limit);
  // filter utxos
  if (amount) {
    await Loader.load();
    let filterValue;
    try {
      filterValue = Loader.Cardano.Value.from_bytes(Buffer.from(amount, 'hex'));
    } catch (e) {
      throw APIError.InvalidRequest;
    }

    converted = converted.filter(
      (unspent) =>
        !unspent.output().amount().compare(filterValue) ||
        unspent.output().amount().compare(filterValue) !== -1
    );
  }
  return converted;
};

export const getRewardAddress = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  const rewardAddr = Buffer.from(
    Loader.Cardano.Address.from_bech32(currentAccount.rewardAddr).to_bytes(),
    'hex'
  ).toString('hex');
  return rewardAddr;
};

export const getCurrentAccountIndex = () => getStorage(STORAGE.currentAccount);

export const getNetwork = () => getStorage(STORAGE.network);

export const getProvider = () => getStorage(STORAGE.provider); 

export const setProvider = (provider) => 
	setStorage({ [STORAGE.provider]: provider });

export const setNetwork = async (network) => {
  const currentNetwork = await getNetwork();
	const currentProvider = await getProvider();
  let id;
  let node;
  if (network.id === NETWORK_ID.mainnet) {
    id = NETWORK_ID.mainnet;
    node = NODE[currentProvider].mainnet;
  } else {
    id = NETWORK_ID.testnet;
    node = NODE[currentProvider].testnet;
  }
  if (network.node) node = network.node;
  if (currentNetwork && currentNetwork.id !== id)
    emitNetworkChange(networkNameToId(id));
  await setStorage({
    [STORAGE.network]: { id, node },
  });
  return true;
};

const accountToNetworkSpecific = async (account, network) => {
  await Loader.load();
  const paymentKeyHash = Loader.Cardano.Ed25519KeyHash.from_bytes(
    Buffer.from(account.paymentKeyHash, 'hex')
  );
  const stakeKeyHash = Loader.Cardano.Ed25519KeyHash.from_bytes(
    Buffer.from(account.stakeKeyHash, 'hex')
  );
  const paymentAddr = Loader.Cardano.BaseAddress.new(
    network.id === NETWORK_ID.mainnet
      ? Loader.Cardano.NetworkInfo.mainnet().network_id()
      : Loader.Cardano.NetworkInfo.testnet().network_id(),
    Loader.Cardano.StakeCredential.from_keyhash(paymentKeyHash),
    Loader.Cardano.StakeCredential.from_keyhash(stakeKeyHash)
  )
    .to_address()
    .to_bech32();

  const rewardAddr = Loader.Cardano.RewardAddress.new(
    network.id === NETWORK_ID.mainnet
      ? Loader.Cardano.NetworkInfo.mainnet().network_id()
      : Loader.Cardano.NetworkInfo.testnet().network_id(),
    Loader.Cardano.StakeCredential.from_keyhash(stakeKeyHash)
  )
    .to_address()
    .to_bech32();

  const assets = account[network.id].assets;
  const lovelace = account[network.id].lovelace;
  const history = account[network.id].history;
  const recentSendToAddresses = account[network.id].recentSendToAddresses;

  return {
    ...account,
    paymentAddr,
    rewardAddr,
    assets,
    lovelace,
    history,
    recentSendToAddresses,
  };
};

/** Returns account with network specific settings (e.g. address, reward address, etc.) */
export const getCurrentAccount = async () => {
  const currentAccountIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  return await accountToNetworkSpecific(accounts[currentAccountIndex], network);
};

/** Returns accounts with network specific settings (e.g. address, reward address, etc.) */
export const getAccounts = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  for (const index in accounts) {
    accounts[index] = await accountToNetworkSpecific(accounts[index], network);
  }
  return accounts;
};

export const createPopup = (popup) =>
  new Promise((res, rej) =>
    chrome.tabs.create(
      {
        url: chrome.runtime.getURL(popup + '.html'),
        active: false,
      },
      function (tab) {
        chrome.windows.create(
          {
            tabId: tab.id,
            type: 'popup',
            focused: true,
            ...POPUP_WINDOW,
          },
          function () {
            res(tab);
          }
        );
      }
    )
  );

export const getCurrentWebpage = () =>
  new Promise((res, rej) => {
    chrome.tabs.query(
      {
        active: true,
        lastFocusedWindow: true,
        status: 'complete',
        windowType: 'normal',
      },
      function (tabs) {
        res({
          url: new URL(tabs[0].url).origin,
          favicon: tabs[0].favIconUrl,
          tabId: tabs[0].id,
        });
      }
    );
  });

const harden = (num) => {
  return 0x80000000 + num;
};

export const isValidAddress = async (address) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const addr = Loader.Cardano.Address.from_bech32(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 && network.id === NETWORK_ID.testnet)
    )
      return addr.to_bytes();
    return false;
  } catch (e) {}
  try {
    const addr = Loader.Cardano.ByronAddress.from_base58(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 && network.id === NETWORK_ID.testnet)
    )
      return addr.to_address().to_bytes();
    return false;
  } catch (e) {}
  return false;
};

const isValidAddressBytes = async (address) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const addr = Loader.Cardano.Address.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 && network.id === NETWORK_ID.testnet)
    )
      return true;
    return false;
  } catch (e) {}
  try {
    const addr = Loader.Cardano.ByronAddress.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 && network.id === NETWORK_ID.testnet)
    )
      return true;
    return false;
  } catch (e) {}
  return false;
};

export const extractKeyHash = async (address) => {
  await Loader.load();
  //TODO: implement for various address types
  if (!(await isValidAddressBytes(Buffer.from(address, 'hex'))))
    throw DataSignError.InvalidFormat;
  try {
    const baseAddr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return baseAddr.payment_cred().to_keyhash().to_bech32('hbas_');
  } catch (e) {}
  try {
    const rewardAddr = Loader.Cardano.RewardAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return rewardAddr.payment_cred().to_keyhash().to_bech32('hrew_');
  } catch (e) {}
  throw DataSignError.AddressNotPK;
};

export const verifySigStructure = async (sigStructure) => {
  await Loader.load();
  try {
    Loader.Message.SigStructure.from_bytes(Buffer.from(sigStructure, 'hex'));
  } catch (e) {
    throw DataSignError.InvalidFormat;
  }
};

export const verifyPayload = (payload) => {
  if (Buffer.from(payload, 'hex').length <= 0)
    throw DataSignError.InvalidFormat;
};

export const verifyTx = async (tx) => {
  await Loader.load();
  try {
    Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
  } catch (e) {
    throw APIError.InvalidRequest;
  }
};

/**
 * @param {string} address - cbor
 * @param {string} payload - hex encoded utf8 string
 * @param {string} password
 * @param {number} accountIndex
 * @returns
 */

export const signData = async (address, payload, password, accountIndex) => {
  await Loader.load();
  const keyHash = await extractKeyHash(address);
  const prefix = keyHash.slice(0, 5);
  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );
  const accountKey = prefix === 'hbas_' ? paymentKey : stakeKey;

  const publicKey = accountKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;

  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  protectedHeaders.set_key_id(publicKey.as_bytes());
  protectedHeaders.set_header(
    Loader.Message.Label.new_text('address'),
    Loader.Message.CBORValue.new_bytes(Buffer.from(address, 'hex'))
  );
  const protectedSerialized =
    Loader.Message.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = Loader.Message.HeaderMap.new();
  const headers = Loader.Message.Headers.new(
    protectedSerialized,
    unprotectedHeaders
  );
  const builder = Loader.Message.COSESign1Builder.new(
    headers,
    Buffer.from(payload, 'hex'),
    false
  );
  const toSign = builder.make_data_to_sign().to_bytes();

  const signedSigStruc = accountKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  return Buffer.from(coseSign1.to_bytes(), 'hex').toString('hex');
};

/**
 *
 * @param {string} tx - cbor hex string
 * @param {Array<string>} keyHashes
 * @param {string} password
 * @returns {string} witness set as hex string
 */
export const signTx = async (
  tx,
  keyHashes,
  password,
  accountIndex,
  partialSign = false
) => {
  await Loader.load();
  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );
  const paymentKeyHash = Buffer.from(
    paymentKey.to_public().hash().to_bytes(),
    'hex'
  ).toString('hex');
  const stakeKeyHash = Buffer.from(
    stakeKey.to_public().hash().to_bytes(),
    'hex'
  ).toString('hex');

  const rawTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));

  const txWitnessSet = rawTx.witness_set();
  const vkeyWitnesses = Loader.Cardano.Vkeywitnesses.new();
  const txHash = Loader.Cardano.hash_transaction(rawTx.body());
  keyHashes.forEach((keyHash) => {
    let signingKey;
    if (keyHash === paymentKeyHash) signingKey = paymentKey;
    else if (keyHash === stakeKeyHash) signingKey = stakeKey;
    else if (!partialSign) throw TxSignError.ProofGeneration;
    else return;
    const vkey = Loader.Cardano.make_vkey_witness(txHash, signingKey);
    vkeyWitnesses.add(vkey);
  });

  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  txWitnessSet.set_vkeys(vkeyWitnesses);
  return txWitnessSet;
};

/**
 *
 * @param {string} tx - cbor hex string
 * @returns
 */

export const submitTx = async (tx) => {
	const provider = await getApiProvider();
  return provider.submitTx(tx);
};

const emitNetworkChange = async (networkId) => {
  //to webpage
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) =>
      chrome.tabs.sendMessage(tab.id, {
        data: networkId,
        target: TARGET,
        sender: SENDER.extension,
        event: EVENT.networkChange,
      })
    );
  });
};

const emitAccountChange = async (addresses) => {
  //to extenstion itself
  if (typeof window !== 'undefined') {
    window.postMessage({
      data: addresses,
      target: TARGET,
      sender: SENDER.extension,
      event: EVENT.accountChange,
    });
  }
  //to webpage
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) =>
      chrome.tabs.sendMessage(tab.id, {
        data: addresses,
        target: TARGET,
        sender: SENDER.extension,
        event: EVENT.accountChange,
      })
    );
  });
};

export const onAccountChange = (callback) => {
  function responseHandler(e) {
    const response = e.data;
    if (
      typeof response !== 'object' ||
      response === null ||
      !response.target ||
      response.target !== TARGET ||
      !response.event ||
      response.event !== EVENT.accountChange ||
      !response.sender ||
      response.sender !== SENDER.extension
    )
      return;
    callback(response.data);
  }
  window.addEventListener('message', responseHandler);
  return {
    remove: () => {
      window.removeEventListener('message', responseHandler);
    },
  };
};

export const switchAccount = async (accountIndex) => {
  await setStorage({ [STORAGE.currentAccount]: accountIndex });
  const currentAccount = await getCurrentAccount();
  const address = await addressToHex(currentAccount.paymentAddr);
  emitAccountChange([address]);
  return true;
};

export const requestAccountKey = async (password, accountIndex) => {
  await Loader.load();
  const encryptedRootKey = await getStorage(STORAGE.encryptedKey);
  let accountKey;
  try {
    accountKey = Loader.Cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(await decryptWithPassword(password, encryptedRootKey), 'hex')
    )
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type;
      .derive(harden(parseInt(accountIndex)));
  } catch (e) {
    throw ERROR.wrongPassword;
  }

  return {
    paymentKey: accountKey.derive(0).derive(0).to_raw_key(),
    stakeKey: accountKey.derive(2).derive(0).to_raw_key(),
  };
};

export const resetStorage = async (password) => {
  await requestAccountKey(password, 0);
  await new Promise((res, rej) => chrome.storage.local.clear(() => res()));
  return true;
};

export const createAccount = async (name, password) => {
  await Loader.load();

  const existingAccounts = await getStorage(STORAGE.accounts);

  const accountIndex = existingAccounts
    ? Object.keys(existingAccounts).length
    : 0;

  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );

  const paymentKeyPub = paymentKey.to_public();
  const stakeKeyPub = stakeKey.to_public();

  paymentKey.free();
  stakeKey.free();
  paymentKey = null;
  stakeKey = null;

  const paymentKeyHash = Buffer.from(
    paymentKeyPub.hash().to_bytes(),
    'hex'
  ).toString('hex');
  const stakeKeyHash = Buffer.from(
    stakeKeyPub.hash().to_bytes(),
    'hex'
  ).toString('hex');

  const networkDefault = {
    lovelace: 0,
    assets: [],
    history: { confirmed: [], details: {} },
  };

  const newAccount = {
    [accountIndex]: {
      index: accountIndex,
      paymentKeyHash,
      stakeKeyHash,
      name,
      [NETWORK_ID.mainnet]: networkDefault,
      [NETWORK_ID.testnet]: networkDefault,
      avatar: Math.random().toString(),
    },
  };

  await setStorage({
    [STORAGE.accounts]: { ...existingAccounts, ...newAccount },
  });
  await switchAccount(accountIndex);
  return true;
};

export const deleteAccount = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  if (Object.keys(accounts).length <= 1) throw new Error(ERROR.onlyOneAccount);
  delete accounts[Object.keys(accounts).length - 1];
  return await setStorage({ [STORAGE.accounts]: accounts });
};

export const createWallet = async (name, seedPhrase, password) => {
  await Loader.load();

  let entropy = mnemonicToEntropy(seedPhrase);
  let rootKey = Loader.Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  entropy = null;
  seedPhrase = null;

  const encryptedRootKey = await encryptWithPassword(
    password,
    rootKey.as_bytes()
  );
  rootKey.free();
  rootKey = null;

  const checkStore = await getStorage(STORAGE.encryptedKey);
  if (checkStore) throw new Error(ERROR.storeNotEmpty);
  await setStorage({ [STORAGE.encryptedKey]: encryptedRootKey });
  await setStorage({ [STORAGE.provider]: 'blockfrost' });
  await setStorage({
    [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.blockfrost.mainnet },
  });

  await setStorage({
    [STORAGE.currency]: 'usd',
  });

  await createAccount(name, password);
  password = null;

  return true;
};

export const mnemonicToObject = (mnemonic) => {
  const mnemonicMap = {};
  mnemonic.split(' ').forEach((word, index) => (mnemonicMap[index + 1] = word));
  return mnemonicMap;
};

export const mnemonicFromObject = (mnemonicMap) => {
  return Object.keys(mnemonicMap).reduce(
    (acc, key) => (acc ? acc + ' ' + mnemonicMap[key] : acc + mnemonicMap[key]),
    ''
  );
};

export const avatarToImage = (avatar) => {
  const blob = new Blob(
    [
      createAvatar(style, {
        seed: avatar,
      }),
    ],
    { type: 'image/svg+xml' }
  );
  return URL.createObjectURL(blob);
};

const updateBalance = async (currentAccount, network) => {
  let amount = await getBalance();
  amount = await valueToAssets(amount);

  if (amount.length > 0) {
    currentAccount[network.id].lovelace = amount.find(
      (am) => am.unit === 'lovelace'
    ).quantity;
    currentAccount[network.id].assets = amount.filter(
      (am) => am.unit !== 'lovelace'
    );
  } else {
    currentAccount[network.id].lovelace = 0;
    currentAccount[network.id].assets = [];
  }
  return true;
};

const updateTransactions = async (currentAccount, network) => {
  const transactions = await getTransactions();
  if (
    transactions.length <= 0 ||
    currentAccount[network.id].history.confirmed.includes(
      transactions[0].txHash
    )
  )
    return false;
  let txHashes = transactions.map((tx) => tx.txHash);
  txHashes = txHashes.concat(currentAccount[network.id].history.confirmed);
  const txSet = new Set(txHashes);
  currentAccount[network.id].history.confirmed = Array.from(txSet);
  return true;
};

export const setTransactions = async (txs) => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  accounts[currentIndex][network.id].history.confirmed = txs;
  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const updateAccount = async () => {
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const currentAccount = accounts[currentIndex];
  const network = await getNetwork();
  const needUpdate = await updateTransactions(currentAccount, network);
  if (!needUpdate) {
    return;
  }

  // fetching the balance in a loop in case blockfrost throws an internal server error
  await new Promise(async (res, rej) => {
    if (await updateBalance(currentAccount, network)) {
      res(true);
      return;
    }
    const interval = setInterval(async () => {
      if (await updateBalance(currentAccount, network)) {
        clearInterval(interval);
        res(true);
        return;
      }
    }, 100);
  });

  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const updateRecentSentToAddress = async (address) => {
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  accounts[currentIndex][network.id].recentSendToAddresses = [address]; // Update in the future to add mulitple addresses
  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const displayUnit = (quantity, decimals = 6) => {
  return parseInt(quantity) / 10 ** decimals;
};

export const toUnit = (amount, decimals = 6) => {
  const result = parseFloat(amount.replace(/[,\s]/g, ''))
    .toLocaleString('en-EN', { minimumFractionDigits: decimals })
    .replace(/[.,\s]/g, '');
  if (!result) return '0';
  else if (result == 'NaN') return '0';
  return result;
};
