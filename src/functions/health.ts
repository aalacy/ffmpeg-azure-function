import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function health(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    return { body: `health ok` };
};

app.http('health', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: health
});
