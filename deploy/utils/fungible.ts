import { ApiPromise } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import Pino from "pino";
import { Fungible } from "./types";
import {
  processClearingTransaction,
  processSignedTransaction,
} from "./utils.js";

const logger = Pino();
async function create_fungible_tokens(
  api: ApiPromise,
  appAgentOwner: KeyringPair,
  appAgentId: string,
  tokensDecimals: number[]
) {
  return new Promise<string[]>(async (resolve, reject) => {
    try {
      logger.info(
        "Start to create " +
          tokensDecimals.length +
          " fungible tokens for the AppAgent ID " +
          appAgentId
      );

      logger.info("Build Clearing transaction to create Fungible tokens");
      let atomics: any[] = [];
      for (const tokenDecimals of tokensDecimals) {
        let min_balance = calculateMinBalance(tokenDecimals);
        logger.info(
          "Min balance for token with decimals " +
            tokenDecimals +
            " is " +
            min_balance
        );
        let create_fungible_token_call = api.tx.assets.create(min_balance);
        let create_fungible_token_action = [
          { AppAgentId: appAgentId },
          create_fungible_token_call,
        ];
        let create_fungible_token_atomic = [create_fungible_token_action];
        atomics.push(create_fungible_token_atomic);
      }
      let create_fungible_token_ct =
        api.tx.addressPools.submitClearingTransaction(appAgentId, atomics);

      logger.info(
        "Process clearing transaction and collect IDs of created Fungible tokens."
      );
      let tokenIds: string[] = [];
      let events = await processClearingTransaction(
        appAgentOwner,
        create_fungible_token_ct
      );
      for (const event of events) {
        if (
          event.receipt.event_module === "Assets" &&
          event.receipt.event_name === "Created"
        ) {
          tokenIds.push(event.attributes.asset_id.toString());
        }
      }

      logger.info("Generated token IDs: ", tokenIds);
      if (tokenIds.length != tokensDecimals.length) {
        throw new Error("Not all required fungibles were created");
      }

      logger.info("Resolving promise with tokenIds:", tokenIds);
      resolve(tokenIds);
    } catch (error) {
      logger.error("Error creating fungible tokens:", error);
      reject(error);
    }
  });
}

function calculateMinBalance(tokenDecimals: number) {
  if (tokenDecimals < 3) {
    return 1;
  } else if (tokenDecimals >= 3 && tokenDecimals < 7) {
    return 10 ** (tokenDecimals - 2);
  } else {
    return 10 ** (tokenDecimals - 3);
  }
}

async function set_metadata_and_mint_fungible_token(
  api: ApiPromise,
  appAgentOwner: KeyringPair,
  appAgentId: string,
  fungibleInfos: Fungible[],
  token_recipient: KeyringPair
) {
  return new Promise<void>(async (resolve, reject) => {
    try {
      logger.info(
        "Start to create fungible token for the AppAgent ID " + appAgentId
      );
      logger.info("Fungibles: ", fungibleInfos);

      logger.info("Create atomics to mint and set metadata for each token");
      let atomics: any[] = [];
      for (const fungibleInfo of fungibleInfos) {
        logger.info(`Creating atomic for token ${fungibleInfo.tokenId}`);
        let mintAmount = 1000 * Math.pow(10, fungibleInfo.decimals);
        logger.info("Calculated mint amount:", mintAmount);
        let mint_token_call = api.tx.assets.mint(
          fungibleInfo.tokenId,
          token_recipient.address,
          mintAmount
        );
        let mint_token_action = [{ AppAgentId: appAgentId }, mint_token_call];
        let set_metadata_call = api.tx.assets.setMetadata(
          fungibleInfo.tokenId,
          fungibleInfo.metadataUrl
        );
        let set_metadata_action = [
          { AppAgentId: appAgentId },
          set_metadata_call,
        ];
        const token_atomic = [mint_token_action, set_metadata_action];
        atomics.push(token_atomic);
      }
      logger.info(`Total atomics created: ${atomics.length}`);

      let configure_fungible_ct = api.tx.addressPools.submitClearingTransaction(
        appAgentId,
        atomics
      );
      await processClearingTransaction(appAgentOwner, configure_fungible_ct);
      logger.info("Fungible tokens configured successfully");

      resolve();
    } catch (error) {
      logger.error(
        "Error setting metadata and minting fungible tokens:",
        error
      );
      reject(error);
    }
  });
}

function calculateTransferAmount(decimals: number, targetAmount: number) {
  let transferAmountBase = targetAmount * Math.pow(10, decimals);
  let transferAmountCoefficient = 0.75 + Math.random() / 2; // between 0.75 and 1.25
  let transferAmount = transferAmountBase * transferAmountCoefficient;
  let minBalance = calculateMinBalance(decimals);
  if (minBalance == 1) {
    transferAmount = Math.round(transferAmount);
  } else {
    transferAmount = Math.round(transferAmount / minBalance) * minBalance;
  }
  return transferAmount;
}

async function create_token_transfer(
  api: ApiPromise,
  fungibleInfo: Fungible,
  token_sender: KeyringPair,
  token_recipients: KeyringPair[],
  amount: number
) {
  logger.info("Generate free transfers between the two users");
  logger.info("Token ID: ", fungibleInfo.tokenId);
  logger.info("Token sender: ", token_sender.address);

  for (let i = 0; i < token_recipients.length; i++) {
    const transferAmount = calculateTransferAmount(
      fungibleInfo.decimals,
      amount
    );
    logger.info("Calculated transfer amount:", transferAmount);
    let tx = api.tx.playerTransfers.submitTransferAssets(
      fungibleInfo.tokenId,
      token_recipients[i].address,
      transferAmount
    );

    await processSignedTransaction(token_sender, tx);

    logger.info(`Free transfer ${i + 1} created and in block`);
  }

  logger.info("All transfers completed successfully");
}

export {
  create_fungible_tokens,
  create_token_transfer,
  set_metadata_and_mint_fungible_token,
};
