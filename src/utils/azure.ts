import {
  BlobClient,
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobDeleteOptions,
} from "@azure/storage-blob";
import { stat } from "fs/promises";

const {
  AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_ACCESS_KEY,
  AZURE_STORAGE_CONTAINER_NAME,
} = process.env;

// Use StorageSharedKeyCredential with storage account and account key
// StorageSharedKeyCredential is only available in Node.js runtime, not in browsers
const sharedKeyCredential = new StorageSharedKeyCredential(
  AZURE_STORAGE_ACCOUNT_NAME!,
  AZURE_ACCESS_KEY!,
);

const blobServiceClient = new BlobServiceClient(
  `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
  sharedKeyCredential,
);

export const upload2Azure = async (
  localFilePath,
  key,
  progressCallback,
  containerName = AZURE_STORAGE_CONTAINER_NAME,
) => {
  const containerClient = blobServiceClient.getContainerClient(containerName!);
  const blockBlobClient = containerClient.getBlockBlobClient(key);
  const stats = await stat(localFilePath);
  const fileSize = stats.size;
  const uploadBlobResponse = await blockBlobClient.uploadFile(localFilePath, {
    onProgress: ({ loadedBytes }) => progressCallback(loadedBytes / fileSize),
  });
  console.log(
    `[upload2Azure] Upload block blob ${containerName} ${key} successfully`,
    uploadBlobResponse.requestId,
  );
};

export const getAzureBlob = async (
  key,
  containerName = AZURE_STORAGE_CONTAINER_NAME,
) => {
  const blockBlobClient = new BlobClient(
    blobServiceClient.url + containerName + "/" + key,
    blobServiceClient.credential,
  );
  const signedURL = await blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse("r"),
    startsOn: new Date(Date.now() - 300 * 1000),
    expiresOn: new Date(Date.now() + 3600 * 1000),
  });
  console.log(
    `[getAzureBlob]Get the object ${containerName} ${key}`,
    signedURL,
  );
  return signedURL;
};

export const deleteBlobIfItExists = async (
  key: string,
  containerName = AZURE_STORAGE_CONTAINER_NAME,
) => {
  // include: Delete the base blob and all of its snapshots.
  // only: Delete only the blob's snapshots and not the blob itself.
  const options: BlobDeleteOptions = {
    deleteSnapshots: "include", // or 'only'
  };

  const containerClient = blobServiceClient.getContainerClient(containerName!);
  const blockBlobClient = containerClient.getBlockBlobClient(key);

  await blockBlobClient.deleteIfExists(options);

  console.log(`deleted blob ${key}`);
};

export const downloadBlobAsStream = async (
  key,
  writableStream,
  containerName = AZURE_STORAGE_CONTAINER_NAME,
) => {
  const containerClient = blobServiceClient.getContainerClient(containerName!);
  const blockBlobClient = containerClient.getBlockBlobClient(key);

  const downloadResponse = await blockBlobClient.download();

  if (downloadResponse && downloadResponse.readableStreamBody) {
    await new Promise((resolve, reject) => {
      downloadResponse
        .readableStreamBody!.pipe(writableStream)
        .on("error", (error) => {
          console.log("[error][downloadBlobAsStream] ", error);
          return reject(error);
        });

      writableStream
        .on("finish", (data) => {
          console.log(data);
          return resolve(data);
        })
        .on("error", (error) => {
          console.log("[error][downloadBlobAsStream] ", error);
          return reject(error);
        });
    });
  }
};
