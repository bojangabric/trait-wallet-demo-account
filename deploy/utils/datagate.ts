import axios from "axios";
import dotenv from "dotenv";
import Pino from "pino";
dotenv.config();

const logger = Pino();

function buildDatagateUrl() {
  const datagateUrl = process.env.DATAGATE_URL;
  if (!datagateUrl) {
    throw new Error("DATAGATE_URL is not set in the .env file");
  }
  return datagateUrl + "/history/events";
}

function getAllEvents(transaction_hash: string): Promise<any[] | false> {
  return new Promise(async (resolve, reject) => {
    const apiUrl = buildDatagateUrl();

    logger.info(
      "DATAGATE:Checking event occurrence for transaction:",
      transaction_hash
    );

    const requestBody = {
      block_receipt: {
        block_index: {
          max_index: "blockchain_head",
        },
      },
      tx_receipt: {
        tx_hash: transaction_hash,
      },
      presentation: {
        sorting: "time_ascending",
      },
    };

    try {
      const response = await axios.post(apiUrl, requestBody);

      if (
        response.data &&
        response.data.data &&
        response.data.data.length > 0
      ) {
        resolve(response.data.data);
      } else {
        logger.info(
          `No events found for the transaction '${transaction_hash}'`
        );
        resolve(false);
      }
    } catch (error) {
      logger.error("Error calling the API:", error);
      reject(error);
    }
  });
}

export { getAllEvents };
