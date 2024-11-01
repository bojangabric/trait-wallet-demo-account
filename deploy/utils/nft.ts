import { ApiPromise } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import Pino from "pino";
import { Collection } from "./types";
import {
  processClearingTransaction,
  processSignedTransaction,
} from "./utils.js";

const logger = Pino();

async function create_nft_collections(
  api: ApiPromise,
  appAgentOwner: KeyringPair,
  appAgentId: string | number,
  collection_count: number
) {
  return new Promise<string[]>(async (resolve, reject) => {
    try {
      logger.info(
        "Start to create NFT Collections for the AppAgent ID " + appAgentId
      );

      logger.info("Build Clearing transaction to create NFT Collections");
      const atomics: any[] = [];

      const create_nft_call = api.tx.nfts.create();

      for (let i = 0; i < collection_count; i++) {
        const create_nft_action = [{ AppAgentId: appAgentId }, create_nft_call];
        const create_nft_atomic = [create_nft_action];
        atomics.push(create_nft_atomic);
      }

      const create_nft_ct = api.tx.addressPools.submitClearingTransaction(
        appAgentId,
        atomics
      );

      logger.info(
        "Process clearing transaction successfully and collect IDs of created NFT collections."
      );
      const collection_ids: string[] = [];
      const events = await processClearingTransaction(
        appAgentOwner,
        create_nft_ct
      );
      for (const event of events) {
        if (
          event.receipt.event_module === "Nfts" &&
          event.receipt.event_name === "Created"
        ) {
          const collection_id = event.attributes.collection.toString();
          logger.info("NFT Collection created with ID: " + collection_id);
          collection_ids.push(collection_id);
        }
      }

      logger.info("Generated collection IDs: ", collection_ids);
      if (collection_ids.length != collection_count) {
        throw new Error("Not all NFT collections were created");
      }

      logger.info("Resolving promise with collection_ids:", collection_ids);
      resolve(collection_ids);
    } catch (error) {
      const message = error instanceof Error ? error.message : error;
      logger.error("Error creating NFT Collections:", message);
      reject(error);
    }
  });
}

async function set_metadata_and_mint_nft(
  api: ApiPromise,
  appAgentOwner: KeyringPair,
  appAgentId: string | number,
  collectionInfo: Collection,
  token_recipient: string
) {
  return new Promise<number[]>(async (resolve, reject) => {
    try {
      logger.info(
        "Start to configure NFT Collection `" +
          collectionInfo.collectionId +
          "` for the AppAgent ID " +
          appAgentId
      );

      let nftTokenIds: number[] = [];

      logger.info("Build Clearing transaction to setup NFT collection");
      // As we have a small number of NFT tokens in each collection - only 10 -
      // we can join all operations into a single CT.
      let atomics: any[] = [];

      logger.info("Create atomic to set collection metadata");
      let set_collection_metadata_call = api.tx.nfts.setCollectionMetadata(
        collectionInfo.collectionId,
        collectionInfo.metadataUrl
      );
      let set_collection_metadata_action = [
        { AppAgentId: appAgentId },
        set_collection_metadata_call,
      ];
      let set_collection_metadata_atomic = [set_collection_metadata_action];
      atomics.push(set_collection_metadata_atomic);

      logger.info("Create atomics to mint and configure NFT tokens.");
      let tokenId = 0;
      for (const nftToken of collectionInfo.tokens) {
        let metadataUrl = nftToken.metadataUrl;

        logger.info(
          "Create atomic for NFT token: CollectionId - " +
            collectionInfo.collectionId +
            "; TokenId - " +
            tokenId +
            "; metadata URL: " +
            metadataUrl
        );

        let mint_nft_call = api.tx.nfts.mint(
          collectionInfo.collectionId,
          tokenId,
          token_recipient
        );
        let mint_nft_action = [{ AppAgentId: appAgentId }, mint_nft_call];
        let set_metadata_call = api.tx.nfts.setMetadata(
          collectionInfo.collectionId,
          tokenId,
          metadataUrl
        );
        let set_metadata_action = [
          { AppAgentId: appAgentId },
          set_metadata_call,
        ];
        let nft_atomic = [mint_nft_action, set_metadata_action];
        atomics.push(nft_atomic);

        nftTokenIds.push(tokenId);
        tokenId += 1;
      }

      logger.info(
        "Sending CT to mint & configure NFT Tokens, and to set Collection metadata."
      );
      let configure_nft_collection_ct =
        api.tx.addressPools.submitClearingTransaction(appAgentId, atomics);
      await processClearingTransaction(
        appAgentOwner,
        configure_nft_collection_ct
      );

      logger.info("Resolving promise with nftTokenIds:", nftTokenIds);
      resolve(nftTokenIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : error;
      logger.error("Error in set_metadata_and_mint_nft:", message);
      reject(error);
    }
  });
}

async function create_nft_transfers(
  api: ApiPromise,
  collection_id: any,
  token_id: any,
  token_sender: KeyringPair,
  token_recipient: KeyringPair
) {
  logger.info("Generate free transfers between the two users");
  logger.info("Collection ID: ", collection_id);
  logger.info("Token ID: ", token_id);
  logger.info("Token Sender: ", token_sender.address);
  logger.info("Token Recipient: ", token_recipient.address);

  const tx = api.tx.playerTransfers.submitTransferNfts(
    collection_id,
    token_id,
    token_recipient.address
  );

  await processSignedTransaction(token_sender, tx);
  logger.info(`Free transfer created and confirmed`);
}

export {
  create_nft_collections,
  create_nft_transfers,
  set_metadata_and_mint_nft,
};
