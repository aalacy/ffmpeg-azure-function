import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { setupRedis } from "../setup";
import videoGenerator from "../jobs/video-generator";
import { JOB_FAILURE } from "../utils";

export async function generator(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const cacheConnection = await setupRedis();
    try {
        await videoGenerator(request, cacheConnection);
    } catch (error) {
        cacheConnection.publish(JOB_FAILURE, JSON.stringify({ error: error?.message || error }))
    }

    return { body: `uploading...` };
};

app.http('generator', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: generator
});
