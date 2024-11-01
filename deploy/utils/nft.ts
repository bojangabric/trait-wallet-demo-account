import { ApiPromise } from "@polkadot/api";
import { KeyringPair } from "@polkadot/keyring/types";
import { Collection } from "./types";
import { processClearingTransaction, processSignedTransaction } from "./utils";

async function create_nft_collections(
  api: ApiPromise,
  appAgentOwner: KeyringPair,
  appAgentId: string | number,
  collection_count: number
) {
  return new Promise<string[]>(async (resolve, reject) => {
    try {
      console.log(
        "Start to create NFT Collections for the AppAgent ID " + appAgentId
      );

      console.log("Build Clearing transaction to create NFT Collections");
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

      console.log(
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
          console.log("NFT Collection created with ID: " + collection_id);
          collection_ids.push(collection_id);
        }
      }

      console.log("Generated collection IDs: ", collection_ids);
      if (collection_ids.length != collection_count) {
        throw new Error("Not all NFT collections were created");
      }

      console.log("Resolving promise with collection_ids:", collection_ids);
      resolve(collection_ids);
    } catch (error) {
      console.error("Error creating NFT Collections:", error.message);
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
      console.log(
        "Start to configure NFT Collection `" +
          collectionInfo.collectionId +
          "` for the AppAgent ID " +
          appAgentId
      );

      let nftTokenIds: number[] = [];

      console.log("Build Clearing transaction to setup NFT collection");
      // As we have a small number of NFT tokens in each collection - only 10 -
      // we can join all operations into a single CT.
      let atomics: any[] = [];

      console.log("Create atomic to set collection metadata");
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

      console.log("Create atomics to mint and configure NFT tokens.");
      let tokenId = 0;
      for (const nftToken of collectionInfo.tokens) {
        let metadataUrl = nftToken.metadataUrl;

        console.log(
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

      console.log(
        "Sending CT to mint & configure NFT Tokens, and to set Collection metadata."
      );
      let configure_nft_collection_ct =
        api.tx.addressPools.submitClearingTransaction(appAgentId, atomics);
      await processClearingTransaction(
        appAgentOwner,
        configure_nft_collection_ct
      );

      console.log("Resolving promise with nftTokenIds:", nftTokenIds);
      resolve(nftTokenIds);
    } catch (error) {
      console.error("Error in set_metadata_and_mint_nft:", error.message);
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
  console.log("Generate free transfers between the two users");
  console.log("Collection ID: ", collection_id);
  console.log("Token ID: ", token_id);
  console.log("Token Sender: ", token_sender.address);
  console.log("Token Recipient: ", token_recipient.address);

  const tx = api.tx.playerTransfers.submitTransferNfts(
    collection_id,
    token_id,
    token_recipient.address
  );

  await processSignedTransaction(token_sender, tx);
  console.log(`Free transfer created and confirmed`);
}

export {
  create_nft_collections,
  create_nft_transfers,
  set_metadata_and_mint_nft,
};
