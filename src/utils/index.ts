import { readFile, writeFile, unlink } from "fs/promises";
import api from "api";
import Ffmpeg from "fluent-ffmpeg";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { path as ffprobePath } from "@ffprobe-installer/ffprobe";
import mime from "mime-types";
import dayjs from "dayjs";
import subsrt from "subsrt";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
dayjs.extend(customParseFormat);

const {
  MONSTER_API_TOKEN,
  MONSTER_IDENTIFIER,
} = process.env;

const sdk = api("@monster-api/v1.0#pric11qlnfvnbyc");

const SUBTITLES_LENGTH = 4;
export const JOB_MONSTER_TRANSCRIPTION = "monster-transcription";
export const JOB_FILE_UPLOAD = "file-upload";
export const JOB_PROGRESS = "progress";
export const JOB_FAILURE = "failed";
export const JOB_GENERATE_VIDEO = "generate-video";
export const JOB_CLEAN_2_HOUR = "clean-temp-2-hours";
export const JOB_CLEAN_EVERY_DAY = "clean-temp-evey-day";

// status
export const PENDING_TRANSCRIBING = "pending-transcribing";
export const COMPLETED = "completed";
export const UPLOADED = "uploaded";
export const DRAFT = "draft";
export const PENDING_GENERATE = "pending-generate";
export const TRANSCRIPTED = "transcripted";

sdk.auth(MONSTER_API_TOKEN);

const padZero = (str, len = 2) => {
  len = len || 2;
  var zeros = new Array(len).join('0');
  return (zeros + str).slice(-len);
}

export const calcMarginV = (height, position) =>
  height ? height * (1 - position / 100) : 30;

const parseAndRevertHex = (nakedHex) => {
  const isShort = nakedHex.length === 3 || nakedHex.length === 4;

  const twoDigitHexR = isShort
    ? `${nakedHex.slice(0, 1)}${nakedHex.slice(0, 1)}`
    : nakedHex.slice(0, 2);
  const twoDigitHexG = isShort
    ? `${nakedHex.slice(1, 2)}${nakedHex.slice(1, 2)}`
    : nakedHex.slice(2, 4);
  const twoDigitHexB = isShort
    ? `${nakedHex.slice(2, 3)}${nakedHex.slice(2, 3)}`
    : nakedHex.slice(4, 6);
  const twoDigitHexA =
    (isShort
      ? `${nakedHex.slice(3, 4)}${nakedHex.slice(3, 4)}`
      : nakedHex.slice(6, 8)) || "ff";
  const coverted = padZero((255 - parseInt(twoDigitHexA, 16)).toString(16))
  return `&H00${twoDigitHexB}${twoDigitHexG}${twoDigitHexR}`;
};

const toTimeString = (ms) => {
  var hh = Math.floor(ms / 1000 / 3600);
  var mm = Math.floor((ms / 1000 / 60) % 60);
  var ss = Math.floor((ms / 1000) % 60);
  var ff = Math.floor((ms % 1000) / 10); //2 digits
  var time =
    hh +
    ":" +
    (mm < 10 ? "0" : "") +
    mm +
    ":" +
    (ss < 10 ? "0" : "") +
    ss +
    "." +
    (ff < 10 ? "0" : "") +
    ff;
  return time;
};

export const msg2Client = (io, message) => {
  io.to("monster-callback").emit("monster", message);
};

export const fileMetaInfo = (file) => {
  let ext = mime.extension(file.mimetype);
  if (ext === "bin") ext = "mov";

  return [file, ext];
};

export const getVideoBaseKey = (key, ext) => `${key}.${ext}`;

export const getVideoOutKey = (key, ext) => `${key}-out.${ext}`;

export const getAudioKey = (key) => `${key}-audio.mp3`;

export const getThumbnailKey = (key) => `${key}-thumbnail.png`;

export const readFileContent = async (filePath) => {
  const content = await readFile(filePath);
  return content.toString('base64');
};

export const removeFile = async (filePath) => {
  try {
    await unlink(filePath);
  } catch (error) {
    console.error("[removeFile]", filePath, error);
  }
};

export const callMonsterAPI = async (file, language) => {
  console.log("[Moster API]", file);
  const { data } = await sdk.postGenerateWhisper(
    {
      file,
      beam_size: "5",
      best_of: "8",
      language,
      transcription_format: "word",
    },
    { webhook_url_name: MONSTER_IDENTIFIER },
  );

  return data;
};

export const extractAudioFromVideo = async (key, localPath) => {
  console.log("[extractAudioFromVideo] ", key, localPath);
  const output = `/tmp/${key}-audio.mp3`;
  const ffmpeg = new Ffmpeg();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg
      .input(localPath)
      .noVideo()
      .outputFormat(`mp3`)
      .saveToFile(output)
      // The callback that is run when FFmpeg is finished
      .on("end", () => {
        console.log("Audio has been extracted.");
        return resolve(output);
      })
      .on("progress", (progress) => {
        console.log(
          `[extractAudioFromVideo]Processing: ${Math.floor(
            progress.percent,
          )}% done`,
        );
      })
      // The callback that is run when FFmpeg encountered an error
      .on("error", (error) => {
        console.log("FFmpeg Audio error", error);
        return reject(new Error(error));
      });
  });
};

export const generateThumbnail = async (key, localPath) => {
  console.log("[generateThumbnail] ", key, localPath);
  const output = `/tmp/${key}-thumbnail.png`;
  const ffmpeg = new Ffmpeg();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg
      .input(localPath)
      .seek("00:00:00.500")
      .size("120x?")
      .outputOptions("-frames:v", 1)
      // .outputFormat("png")
      .saveToFile(output)
      // The callback that is run when FFmpeg is finished
      .on("end", () => {
        console.log("Thumbnail has been generated.");
        return resolve(output);
      })
      .on("progress", (progress) => {
        console.log(
          `[generateThumbnail]Processing: ${Math.floor(
            progress.percent,
          )}% done`,
        );
      })
      // The callback that is run when FFmpeg encountered an error
      .on("error", (error) => {
        console.log("FFmpeg Thumbnail error", error);
        return reject(new Error(error));
      });
  });
};

export const convertSrt2Ass = async (processId) => {
  const parent = `/tmp/${processId}`;
  console.log("[FFMpeg] ", parent);
  const ffmpeg = new Ffmpeg();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg
      .input(`${parent}-sub.srt`)
      // Output file
      .saveToFile(`${parent}-sub.ass`)

      // Log the percentage of work completed
      .on("progress", (progress) => {
        console.log(
          `[convertSrt2Ass]Processing: ${Math.floor(progress.percent)}% done`,
        );
      })

      // The callback that is run when FFmpeg is finished
      .on("end", () => {
        console.log("[convertSrt2Ass]FFmpeg has finished.");
        return resolve(`${parent}-sub.ass`);
      })

      // The callback that is run when FFmpeg encountered an error
      .on("error", (error) => {
        console.log("[convertSrt2Ass]FFmpeg error", error);
        return reject(new Error(error));
      });
  });
};

export const convertSrt2AssTest = async (processId) => {
  const parent = `/home/com/Downloads/${processId}`;
  console.log("[FFMpeg] ", parent);
  const ffmpeg = new Ffmpeg();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg
      .input(`${parent}-sub.srt`)
      // Output file
      .saveToFile(`${parent}-sub.ass`)

      // Log the percentage of work completed
      .on("progress", (progress) => {
        console.log(
          `[convertSrt2Ass]Processing: ${Math.floor(progress.percent)}% done`,
        );
      })

      // The callback that is run when FFmpeg is finished
      .on("end", () => {
        console.log("[convertSrt2Ass]FFmpeg has finished.");
        return resolve(`${parent}-sub.ass`);
      })

      // The callback that is run when FFmpeg encountered an error
      .on("error", (error) => {
        console.log("[convertSrt2Ass]FFmpeg error", error);
        return reject(new Error(error));
      });
  });
};

export const runFfmpeg = async (localPath, processId, duration) => {
  const parent = `/tmp/${processId}-`;
  const fontsdir = `${process.cwd()}/assets/fonts/`;
  console.log("[FFMpeg] ", localPath, processId, duration, fontsdir);
  const ffmpeg = new Ffmpeg(localPath);
  // const ffmpeg = new Ffmpeg(readableStreamBody);
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg
      // Input file
      // Audio bit rate
      // .outputOptions(["-map 0:0"])
      .videoFilters([`subtitles=${parent}sub.ass:fontsdir=${fontsdir}`])
      .videoCodec("libx264")
      .format("mp4")
      // .size(`${metadata.width}x${metadata.height}`)
      .audioCodec("copy")
      .duration(duration) // if no provided, it will not end

      // Output file
      .saveToFile(`${parent}out.mp4`)

      // Log the percentage of work completed
      .on("progress", (progress) => {
        console.log(`Processing: ${Math.floor(progress.percent)}% done`);
      })

      // The callback that is run when FFmpeg is finished
      .on("end", () => {
        console.log("FFmpeg has finished.");
        return resolve(`${parent}out.mp4`);
      })

      // The callback that is run when FFmpeg encountered an error
      .on("error", (error) => {
        console.log("FFmpeg error", error);
        return reject(new Error(error));
      });
  });
};

export const getMetadataOfVideo = (input): Promise<any> => {
  const ffmpeg = new Ffmpeg();
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  return new Promise((resolve, reject) => {
    ffmpeg.input(input).ffprobe(input, (error, metadata) => {
      if (error) reject(error);
      else resolve(metadata);
    });
  });
};

const buildASS = (captions, options, metadata) => {
  var eol = options.eol || "\r\n";
  var ass = options.format == "ass";

  var content = "";
  content += "[Script Info]" + eol;
  content += `PlayResY: ${metadata.height}` + eol;
  content += `PlayResX: ${metadata.width}` + eol;
  content += "; Script generated by subsrt " + eol;
  content += "ScriptType: v4.00" + (ass ? "+" : "") + eol;
  content += "Collisions: Normal" + eol;
  content += eol;

  const {
    data: {
      Fontname,
      Fontsize,
      PrimaryColour,
      BackColour,
      Bold = "-1",
      Italic = "0",
      MarginV = 30,
    },
  } = captions.find((cap) => cap.type === "style");
  content += "[V4+ Styles]" + eol;
  content +=
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding" +
    eol;
  content +=
    `Style: DefaultVCD, ${Fontname},${Fontsize},${PrimaryColour},&H00000000,&H00000000, ${BackColour},${Bold},${Italic},0,0,100,100,0.00,0.00,4,1,0,2,30,30,${MarginV},0` +
    eol;

  content += eol;
  content += "[Events]" + eol;
  content +=
    "Format: " +
    (ass ? "Layer" : "Marked") +
    ", Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text" +
    eol;

  for (var i = 0; i < captions.length; i++) {
    var caption = captions[i];
    if (caption.type == "meta") {
      continue;
    }

    if (typeof caption.type === "undefined" || caption.type == "caption") {
      content +=
        "Dialogue: " +
        (ass ? "0" : "Marked=0") +
        "," +
        toTimeString(caption.start) +
        "," +
        toTimeString(caption.end) +
        ",DefaultVCD, NTP,0000,0000,0000,," +
        caption.text.replace(/\r?\n/g, "\\N") +
        eol;
      continue;
    }

    if (options.verbose) {
      console.log("SKIP:", caption);
    }
  }

  return content;
};

export const parseASSAndRebuild = async (filePath, metadata) => {
  console.log("[parseASSAndRebuild]", filePath);
  const fileContent = await readFile(filePath, "utf8");
  const captions = subsrt.parse(fileContent, { format: "ass" });
  const PrimaryColour = parseAndRevertHex(metadata.fontColor.replace("#", ""));
  const BackColour = parseAndRevertHex(
    metadata.backgroundColor.replace("#", ""),
  );
  const newCaptions = captions.map((cap) => {
    if (cap.type === "style") {
      return {
        ...cap,
        data: {
          ...cap.data,
          Alignment: 1,
          Fontname: metadata.font,
          Fontsize: metadata.fontSize * 6,
          PrimaryColour,
          BackColour,
          Bold: metadata.fontWeight === "Bold" ? "1" : "0",
          Italic: metadata.fontWeight === "Italic" ? "1" : "0",
          MarginV: metadata.marginV,
        },
      };
    } else return { ...cap };
  });

  await buildASSAndWriteFile(newCaptions, filePath, metadata);
};

export const buildASSAndWriteFile = async (captions, filePath, metadata) => {
  const content = buildASS(captions, { format: "ass" }, metadata);
  await writeFile(filePath, content);
};

const extractVTT = (data) => {
  const [start, second] = data.split("-->");
  const [end, text] = second.split("::");
  return {
    start: start.trim(),
    end: end.trim(),
    text: text.trim(),
  };
};

const add1SecToEnd = (cue) => {
  const date = dayjs(cue.end, "HH:mm:ss,SSS", true);
  cue.end = date.add(1, "second").format("HH:mm:ss,SSS");
};

const adjustEndOfPrev = (prev, cue) => {
  if (
    dayjs(prev.end, "HH:mm:ss,SSS").isAfter(dayjs(cue.start, "HH:mm:ss,SSS"))
  ) {
    prev.end = cue.start;
  }
};

export const twoHoursBefore = () => dayjs().subtract(2, "hours").toISOString();

export const parseAndGenerateVTT = (data) => {
  const newCues: { start: any; end: any; text: any; identifier: string }[] = [];
  for (let idx in data) {
    const cue = extractVTT(data[idx]);
    const len = Math.ceil(+idx / SUBTITLES_LENGTH);
    if (+idx % SUBTITLES_LENGTH === 0) {
      // add 1 second to end time to ensure the transcript remains a bit longer to be read.
      add1SecToEnd(cue);

      if (newCues.length === 0 || newCues.length === len) {
        newCues.push({
          identifier: len.toString(),
          ...cue,
        });
        // It should correct the end time considering the start time of new chunk
        if (newCues.length > 1) adjustEndOfPrev(newCues.at(-2), cue);
      } else {
        newCues.at(-1)!.end = cue.end;
        newCues.at(-1)!.text += " " + cue.text;
      }
    } else {
      newCues.at(-1)!.text += " " + cue.text;
    }
  }

  return generateCues2Vtt(newCues);
};

export const generateCues2Vtt = (cues) => {
  let output = "";
  for (let cue of cues) {
    output += "\n";
    output += `${cue.identifier}\n`;
    output += `${cue.start} --> ${cue.end}`;
    output += cue.styles ? ` ${cue.styles}` : "";
    output += `\n${cue.text}`;
    output += "\n";
  }
  return output;
};

export const verificationCode = () => {
  return Math.random().toString().slice(2, 8);
};

export const parseReadableStream = async (body) => {
  const chunks = [];
  for await (let chunk of body) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}