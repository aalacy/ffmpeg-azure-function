import { writeFile } from "fs/promises";
import { createWriteStream } from "fs";

import {
  COMPLETED,
  calcMarginV,
  convertSrt2Ass,
  getVideoBaseKey,
  getVideoOutKey,
  parseASSAndRebuild,
  runFfmpeg,
  removeFile,
  JOB_PROGRESS,
  JOB_GENERATE_VIDEO,
  parseReadableStream,
} from "../utils";
import {
  downloadBlobAsStream,
  getAzureBlob,
  upload2Azure,
} from "../utils/azure";

export default async function (req, redis) {
  const bodyData = await parseReadableStream(req.body);
  const { file, visitorId } = bodyData;

  const userId = file?.userId;

  redis.publish(JOB_PROGRESS, JSON.stringify({
    message: "Downloading...",
    percent: 10,
    userId,
    visitorId,
  }));

  // write vtt to the local file
  const srtVttPath = `/tmp/${file.key}-sub.srt`;
  const srtAssPath = `/tmp/${file.key}-sub.ass`;
  await writeFile(srtVttPath, file.vtt);
  await convertSrt2Ass(file.key);
  let marginV = calcMarginV(file.height, file.metadata.position);
  const metadata1 = {
    ...file.metadata,
    width: file.width,
    height: file.height,
    marginV,
  };
  await parseASSAndRebuild(srtAssPath, metadata1);
  redis.publish(JOB_PROGRESS, JSON.stringify({
    message: "Downloading...",
    percent: 30,
    userId,
    visitorId,
  }));
  // generate a video using FFMpeg
  const videoKey = getVideoBaseKey(file.key, file.ext);
  const inputFile = `${file.localPath}.${file.ext}`;
  const writableStream = createWriteStream(inputFile);
  await downloadBlobAsStream(videoKey, writableStream);
  const output = await runFfmpeg(inputFile, file.key, file.duration);

  // upload it to S3 bucket
  const videoOutKey = getVideoOutKey(file.key, file.ext);
  await upload2Azure(output, videoOutKey, (progress) =>
    redis.publish(JOB_PROGRESS, JSON.stringify({
      message: "Downloading...",
      percent: 50 + progress * 40,
      userId,
      visitorId,
    })),
  );

  redis.publish(JOB_PROGRESS, JSON.stringify({
    message: "Downloading...",
    percent: 99,
    userId,
    visitorId,
  }));

  file.output = await getAzureBlob(videoOutKey);
  file.status = COMPLETED;

  // remove files
  await removeFile(inputFile);
  await removeFile(output); // output video file
  await removeFile(srtVttPath); // vtt file
  await removeFile(srtAssPath); // ass file

  redis.publish(JOB_GENERATE_VIDEO, JSON.stringify({ file }))
}
