const redis = require("redis");

export function setupRedis() {
  // Connection configuration
  return redis
    .createClient({
      url: `rediss://submagicpro.redis.cache.windows.net:6380`,
      password: "og7jpVhbsxpjr5cTGCa1JGwLoVt16Nk2RAzCaK61huQ=",
    })
    .on("error", (err) => console.log("Redis Client Error", err))
    .on("reconnecting", () => console.log('redis reconnecting'))
    .on("ready", () => console.log('redis ready'))
    .on("connect", () => {
      console.log("[redids] connected");
    })
    .connect();
}