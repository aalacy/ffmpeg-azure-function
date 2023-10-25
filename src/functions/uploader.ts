import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

import { setupRedis } from "../setup";
import fileUploader from "../jobs/file-uploader";
import { JOB_FAILURE } from "../utils";

export async function upload(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const cacheConnection = await setupRedis();
    try {
        await fileUploader(request, cacheConnection);
    } catch (error) {
        cacheConnection.publish(JOB_FAILURE, JSON.stringify({ error: error?.message || error }))
    }

    return { body: `uploading...` };
};

app.http('upload', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: upload
});
