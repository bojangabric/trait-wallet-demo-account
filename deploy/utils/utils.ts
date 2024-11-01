import { SubmittableExtrinsic } from "@polkadot/api/types";
import { KeyringPair } from "@polkadot/keyring/types";
import { ISubmittableResult } from "@polkadot/types/types";
import Pino from "pino";
import { getAllEvents } from "./datagate";

const expectedTxFinalisationTime = 45000; // 45 sec
const maxWaitTime = 6000000; // 10 minutes in milliseconds
const maxRetries = 3;
const initialBackoff = 30000; // 30 seconds
const logger = Pino();

async function checkTxSuccessWithRetry(
  txHash: string,
  successModuleName: string,
  successEventName: string
) {
  logger.info(`Checking success of transaction ${txHash}`);

  await new Promise((resolve) =>
    setTimeout(resolve, expectedTxFinalisationTime)
  );

  let retries = 0;
  while (retries < maxRetries) {
    const result = await getAllEvents(txHash);
    if (result) {
      for (const event of result) {
        if (
          event.receipt.event_module === successModuleName &&
          event.receipt.event_name === successEventName
        ) {
          logger.info(
            `Event ${successModuleName}.${successEventName} confirmed for transaction ${txHash}`
          );
          return result;
        }
      }
      throw new Error(
        `Event ${successModuleName}.${successEventName} not found for transaction ${txHash}`
      );
    } else {
      retries++;
      if (retries === maxRetries) {
        logger.info(
          `Failed to find the event ${successModuleName}.${successEventName} in tx ${txHash} after ${maxRetries} attempts`
        );
        throw new Error();
      }
      const backoffTime = initialBackoff * Math.pow(2, retries - 1);
      logger.info(
        `Couldn't fetch events generated by transaction. Retrying in ${backoffTime}ms. Attempt ${retries} of ${maxRetries}`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffTime));
    }
  }
}

async function processClearingTransaction(
  signer: KeyringPair,
  ct: SubmittableExtrinsic<"promise", ISubmittableResult>
): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`CT processing timed out after ${maxWaitTime}ms`));
    }, maxWaitTime);

    try {
      const txHash = await ct.signAndSend(signer, { nonce: -1 });
      const txEvents = await checkTxSuccessWithRetry(
        txHash.toString(),
        "AddressPools",
        "CTProcessingCompleted"
      );
      logger.info(`CT processing completed successfully`);
      clearTimeout(timeout);
      resolve(txEvents);
    } catch (error) {
      clearTimeout(timeout);
      logger.error("Error in processClearingTransaction:", error);
      reject(error);
    }
  });
}

async function processSignedTransaction(
  signer: KeyringPair,
  tx: SubmittableExtrinsic<"promise", ISubmittableResult>
) {
  return new Promise<any[] | undefined>(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Transaction timed out after ${maxWaitTime}ms`));
    }, maxWaitTime);

    try {
      const txHash = await tx.signAndSend(signer, { nonce: -1 });
      const txEvents = await checkTxSuccessWithRetry(
        txHash.toString(),
        "System",
        "ExtrinsicSuccess"
      );
      logger.info(`Transaction processing completed successfully`);
      clearTimeout(timeout);
      resolve(txEvents);
    } catch (error) {
      clearTimeout(timeout);
      logger.error("Error in processSignedTransaction:", error);
      reject(error);
    }
  });
}

async function processSignedBatchTransaction(
  signer: KeyringPair,
  tx: SubmittableExtrinsic<"promise", ISubmittableResult>
) {
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Batch transaction timed out after ${maxWaitTime}ms`));
    }, maxWaitTime);

    try {
      const txHash = await tx.signAndSend(signer, { nonce: -1 });
      let txEvents = await checkTxSuccessWithRetry(
        txHash.toString(),
        "Utility",
        "BatchCompleted"
      );
      logger.info(`Batch transaction processing completed successfully`);
      clearTimeout(timeout);
      resolve(txEvents);
    } catch (error) {
      clearTimeout(timeout);
      logger.error("Error in processSignedBatchTransaction:", error);
      reject(error);
    }
  });
}

export {
  processClearingTransaction,
  processSignedBatchTransaction,
  processSignedTransaction,
};
