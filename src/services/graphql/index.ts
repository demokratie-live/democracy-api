import { ApolloServer } from '@apollo/server';
import {
  ApolloServerPluginLandingPageLocalDefault,
  ApolloServerPluginLandingPageProductionDefault,
} from '@apollo/server/plugin/landingPage/default';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { applyMiddleware } from 'graphql-middleware';
import { Response } from 'express';
import CONFIG from '../../config';
import { ExpressReqContext } from '../../types/graphqlContext';

import typeDefs from '../../graphql/schemas';
import resolversImport from '../../graphql/resolvers';
import { Resolvers } from '../../generated/graphql';
import { permissions } from '../../express/auth/permissions';
import DataLoader from 'dataloader';
import { votedLoader } from '../../graphql/resolvers/dataLoaders';

// Models
import {
  ProcedureModel,
  UserModel,
  DeviceModel,
  PushNotificationModel,
  VoteModel,
  PhoneModel,
  VerificationModel,
  ActivityModel,
  SearchTermModel,
  DeputyModel,
} from '@democracy-deutschland/democracy-common';
import { Types } from 'mongoose';

const resolvers: Resolvers = resolversImport;

const schema = makeExecutableSchema({ typeDefs, resolvers });
const schemaWithPermissions = applyMiddleware(schema, permissions);

const apolloServer = new ApolloServer({
  schema: schemaWithPermissions,
  introspection: true,
  plugins: [
    // Apollo Sandbox for local development, production landing page otherwise
    CONFIG.GRAPHIQL || CONFIG.DEBUG
      ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
      : ApolloServerPluginLandingPageProductionDefault(),
  ],
});

// Context function for expressMiddleware
export const graphqlContextFunction = async ({
  req,
  res,
}: {
  req: ExpressReqContext;
  res: Response;
}) => ({
  // Connection
  res,
  // user
  user: req.user,
  device: req.device,
  phone: req.phone,
  version: req.version,
  applicationId: req.applicationId,
  // Models
  ProcedureModel,
  UserModel,
  DeviceModel,
  PhoneModel,
  VerificationModel,
  ActivityModel,
  VoteModel,
  PushNotificationModel,
  SearchTermModel,
  DeputyModel,
  votedLoader: new DataLoader<Types.ObjectId, boolean, unknown>((procedureObjIds) =>
    votedLoader({ procedureObjIds, device: req.device, phone: req.phone }),
  ),
});

export { apolloServer };
