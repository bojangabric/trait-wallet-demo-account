const { ApiPromise, WsProvider } = require("@polkadot/api");
const { Keyring } = require("@polkadot/keyring");
const dotenv = require("dotenv");
const fs = require('fs');
const path = require('path');
const { create_app_agent } = require('./utils/app_agent');
const { create_fungible_tokens, set_metadata_and_mint_fungible_token, create_token_transfer } = require('./utils/fungible');
const { create_nft_collections, set_metadata_and_mint_nft, create_nft_transfers } = require('./utils/nft');
const { processSignedTransaction, processSignedBatchTransaction } = require('./utils/utils');

const startTime = Date.now();

const aws_s3_assets_path = path.join(__dirname, '..', 'aws_s3_assets');
const game_a_path = path.join(aws_s3_assets_path, 'game-a/');
const game_b_path = path.join(aws_s3_assets_path, 'game-b/');
const game_c_path = path.join(aws_s3_assets_path, 'game-c/');

const game_folders = [game_a_path, game_b_path, game_c_path];

dotenv.config();

async function main() {
    console.log("Read WS_PROVIDER_URL from .env file");
    const wsProviderUrl = process.env.WS_PROVIDER_URL;
    if (!wsProviderUrl) {
        throw new Error("WS_PROVIDER_URL is not set in the .env file");
    }

    console.log("Create a provider with the URL from .env");
    const provider = new WsProvider(wsProviderUrl);

    console.log("Instantiate the API with the provider");
    const api = await ApiPromise.create({
        provider,
        types: {
            TraitPrimitivesAppAgentCtActionOrigin: {
                _enum: {
                    AppAgentId: 'u32',
                    AppAgentAddress: 'AccountId',
                    TransactionalAddressId: 'u32',
                    TransactionalAddress: 'AccountId',
                    NamedAddress: 'AccountId',
                    NamedAddressName: 'Vec<u8>'
                }
            }
        }
    });

    console.log("Construct the keyring");
    const keyring = new Keyring({ type: "sr25519" });

    console.log("Load accounts from .env file");
    const faucetAccount = keyring.addFromUri(process.env.FAUCET_ACCOUNT_MNEMONIC);
    const appAgentOneOwner = keyring.addFromUri(process.env.APP_AGENT_OWNER_ONE_MNEMONIC);
    const appAgentTwoOwner = keyring.addFromUri(process.env.APP_AGENT_OWNER_TWO_MNEMONIC);
    const appAgentThreeOwner = keyring.addFromUri(process.env.APP_AGENT_OWNER_THREE_MNEMONIC);
    const appAgentOwners = [appAgentOneOwner, appAgentTwoOwner, appAgentThreeOwner];

    const demo_user_one = keyring.addFromUri(process.env.DEMO_ACCOUNT_ONE_MNEMONIC);
    const demo_user_two = keyring.addFromUri(process.env.DEMO_ACCOUNT_TWO_MNEMONIC);
    const demo_user_three = keyring.addFromUri(process.env.DEMO_ACCOUNT_THREE_MNEMONIC);

    const appAgentOwnerTransferAmount = parseInt(process.env.APP_AGENT_OWNER_TRANSFER_AMOUNT) * 1e12;
    const demoAccTransferAmount = parseInt(process.env.DEMO_ACCOUNT_TRANSFER_AMOUNT) * 1e12;

    console.log("Start to initialise the owners of the app agents");
    const transfers = [
        api.tx.balances.transferKeepAlive(appAgentOneOwner.address, appAgentOwnerTransferAmount.toString()),
        api.tx.balances.transferKeepAlive(appAgentTwoOwner.address, appAgentOwnerTransferAmount.toString()),
        api.tx.balances.transferKeepAlive(appAgentThreeOwner.address, appAgentOwnerTransferAmount.toString()),
        api.tx.balances.transferKeepAlive(demo_user_one.address, demoAccTransferAmount.toString()),
        api.tx.balances.transferKeepAlive(demo_user_two.address, demoAccTransferAmount.toString()),
        api.tx.balances.transferKeepAlive(demo_user_three.address, demoAccTransferAmount.toString()),
    ];

    console.log("Send the batch of transfers");
    await processSignedBatchTransaction(faucetAccount, api.tx.utility.batchAll(transfers));
    // await create_balance_transfers(api, demo_user_one, demo_user_two);
    // await create_balance_transfers(api, demo_user_three, demo_user_one);

    console.log("Traverse the game folders and collect entity data");
    const gameData = collectGameData(game_folders);

    console.log("Starting to process game data");
    for (let [gameIndex, game] of gameData.entries()) {
        console.log(`Processing game ${gameIndex + 1}`);
        const appAgentOwner = appAgentOwners[gameIndex];

        // Create app agent and set metadata
        console.log(`Creating app agent for game ${gameIndex + 1}`);
        const appAgentId = await create_app_agent(api, appAgentOwner, game.appAgent.metadataUrl);
        console.log(`App agent created for game ${gameIndex + 1}: ${appAgentId}`);

        // Create and configure fungible tokens
        if (game.fungibles.length > 0) {
            console.log(`Creating fungible tokens for game ${gameIndex + 1}`);
            const fungibleIds = await create_fungible_tokens(api, appAgentOwner, appAgentId, game.fungibles.map(f => f.decimals));
            console.log(`Fungible tokens created for game ${gameIndex + 1}:`, fungibleIds);
            console.log(`Save IDs of fungible tokens for later use`);
            for (let i = 0; i < fungibleIds.length; i++) {
                let fungibleId = fungibleIds[i];
                game.fungibles[i].tokenId = fungibleId;
            }
            console.log(`Setting metadata and minting fungible tokens for game ${gameIndex + 1}`);
            await set_metadata_and_mint_fungible_token(api, appAgentOwner, appAgentId, game.fungibles, demo_user_one);
            console.log(`Fungible tokens created and configured for game ${gameIndex + 1}`);
        }

        // Create and configure NFT collections and tokens
        console.log(`Creating NFT collections for game ${gameIndex + 1}`);
        const collectionIds = await create_nft_collections(api, appAgentOwner, appAgentId, game.nftCollections.length);
        console.log(`NFT collections created for game ${gameIndex + 1}:`, collectionIds);
        console.log(`Save IDs of NFT collections for later use`);
            for (let i = 0; i < collectionIds.length; i++) {
                let collectionId = collectionIds[i];
                game.nftCollections[i].collectionId = collectionId;
            }

        for (let i = 0; i < game.nftCollections.length; i++) {
            console.log(`Setting metadata and minting NFTs for collection ${collectionIds[i]} of game ${gameIndex + 1}`);
            let nftTokenIds = await set_metadata_and_mint_nft(api, appAgentOwner, appAgentId, game.nftCollections[i], demo_user_one.address);
            for (let k = 0; k < game.nftCollections[i].tokens.length; k++) {
                game.nftCollections[i].tokens[k].tokenId = nftTokenIds[k];
            }
        }
        console.log(`NFT collections created and configured for game ${gameIndex + 1}`);
    }

    console.log("All games processed");
    console.log("Fungibles:", gameData.map(f => f.fungibles).flat().map(f => f.tokenId));
    console.log("Collections:", gameData.map(f => f.nftCollections).flat().map(f => f.collectionId));

    console.log("Create demo transfers for fungibles");
    for (const fungibleInfo of gameData.map(f => f.fungibles).flat()) {
        await create_token_transfer(api, fungibleInfo, demo_user_one, [demo_user_two, demo_user_three], 250);
        await create_token_transfer(api, fungibleInfo, demo_user_two, [demo_user_one, demo_user_three], 125);
        await create_token_transfer(api, fungibleInfo, demo_user_three, [demo_user_one, demo_user_two], 50);
    }

    console.log("Create demo transfers for NFTs");
    for (const collectionInfo of gameData.map(f => f.nftCollections).flat()) {
        const recipient = Math.random() < 0.5 ? demo_user_three : demo_user_two;
        for (const nftTokenInfo of collectionInfo.tokens) {
            await create_nft_transfers(api, collectionInfo.collectionId, nftTokenInfo.tokenId, demo_user_one, recipient);
        }
    }
}

function collectGameData(gameFolders) {
    return gameFolders.map(gameFolder => {
        const gameData = {
            appAgent: null,
            // array of { metadataUrl: metadataUrl, decimals: decimals, tokenId: id }
            fungibles: [],
            // array of { metadataUrl: metadataUrl, collectionId: id, tokens: [{ metadataUrl: metadataUrl, tokenId: id}]}
            nftCollections: []
        };

        const subFolders = fs.readdirSync(gameFolder);

        for (const subFolder of subFolders) {
            const folderPath = path.join(gameFolder, subFolder);

            if (subFolder.startsWith('app-agent-')) {
                gameData.appAgent = { metadataUrl: getObjectMetadataURL(folderPath).url };
            } else if (subFolder.startsWith('fungible-')) {
                gameData.fungibles.push({ metadataUrl: getObjectMetadataURL(folderPath).url, decimals: getObjectMetadataURL(folderPath).decimals });
            } else if (subFolder.startsWith('nft-collection')) {
                const collection = { metadataUrl: null, tokens: [] };
                const subsubFolders = fs.readdirSync(folderPath);

                for (const subsubFolder of subsubFolders) {
                    const subFolderPath = path.join(folderPath, subsubFolder);
                    if (subsubFolder.startsWith('nft-collection')) {
                        collection.metadataUrl = getObjectMetadataURL(subFolderPath).url;
                    } else if (subsubFolder.startsWith('nft-token')) {
                        collection.tokens.push({ metadataUrl: getObjectMetadataURL(subFolderPath).url });
                    }
                }

                gameData.nftCollections.push(collection);
            }
        }

        return gameData;
    });
}

/**
 * Function searches for the json file with object metadata.
 * And calculates the metadata URL based on the file path.
 *
 * @param {string} directory - The directory where the metadata file is stored.
 * @return {string|null} The metadata URL if found, otherwise null.
 */
function getObjectMetadataURL(directory) {
    const files = fs.readdirSync(directory);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    for (const file of jsonFiles) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);
            // get the decimals from the fungible metadata if it exists
            let decimals = jsonData.traits.fungible ? jsonData.traits.fungible.decimals : null;

            const relativePath = path.relative(aws_s3_assets_path, filePath);
            const url = `${process.env.CONTENT_BASE_URL}/${relativePath.replace(/\\/g, '/')}`;

            // console.log(`Generated URL: ${url}`);
            return { url, decimals };
        }
    }

    return null;
}

async function create_balance_transfers(api, token_recipient, token_recipient_two) {
    console.log("Generate free transfers between the two users");

    for (let i = 0; i < 2; i++) {
        let tx = api.tx.playerTransfers.submitTransferBalances(
            token_recipient_two.address,
            1000000
        );
        await processSignedTransaction(token_recipient, tx);
    }
    console.log(`Free transfer created and confirmed`);
}

main()
    .catch(console.error)
    .finally(() => {
        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000; // Convert to seconds
        console.log(`Total execution time: ${executionTime.toFixed(2)} seconds`);
        process.exit();
    });
