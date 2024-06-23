import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authMiddleware } from './express/auth';
import CONFIG from './config';
import { expressMiddleware } from '@apollo/server/express4';

import { logger } from './services/logger';

import { connectDB } from './services/mongoose';
import { appVersion } from './express/appVersion';
import { applicationId } from './express/applicationId';
import { context, server } from './services/graphql';
import http from 'http';

const main = async () => {
  // Connect to DB - this keeps the process running
  // IMPORTANT - This is done before any Model is registered
  await connectDB();

  // Express Server
  const app = express();
  const httpServer = http.createServer(app);

  // Cookie parser to debug JWT easily
  if (CONFIG.DEBUG) {
    app.use(cookieParser());
  }

  // Authentification
  // Here several Models are included
  app.use(authMiddleware);

  // add version to graphql context
  app.use(appVersion);

  // add application id to graphql context
  app.use(applicationId);

  // Graphql
  // Here several Models are included for graphql
  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, {
      context,
    }),
  );

  await new Promise<void>((resolve) => httpServer.listen({ port: 4000 }, resolve));
  console.log(`🚀 Server ready at http://localhost:4000/graphql`);

  // Start Server
  // app.listen({ port: CONFIG.PORT }, () => {
  //   logger.info(`🚀 Server ready at http://localhost:${CONFIG.PORT}${CONFIG.GRAPHQL_PATH}`, {
  //     metaKey: 'metaValue',
  //   });
  // });
};

// Async Wrapping Function
// Catches all errors
(async () => {
  await main();
})().catch((error) => {
  logger.error('Error in main async function', { error });
  process.exit(1);
});
