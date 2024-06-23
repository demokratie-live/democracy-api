import { ApolloServer, BaseContext } from '@apollo/server';

import typeDefs from '../../graphql/schemas';
import resolvers from '../../graphql/resolvers';
import DataLoader from 'dataloader';
import { votedLoader } from '../../graphql/resolvers/dataLoaders';
import express from 'express';
import { makeExecutableSchema } from '@graphql-tools/schema';

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
import { authDirective } from './authDirective';

const app = express();

app.get('/test', () => 'hallo');

function getUser(token: string) {
  const roles = ['UNKNOWN', 'USER', 'REVIEWER', 'ADMIN'];
  return {
    hasRole: (role: string) => {
      const tokenIndex = roles.indexOf(token);
      const roleIndex = roles.indexOf(role);
      return roleIndex >= 0 && tokenIndex >= roleIndex;
    },
  };
}

const { authDirectiveTypeDefs, authDirectiveTransformer } = authDirective('auth', getUser);

let schema = makeExecutableSchema({ typeDefs: [authDirectiveTypeDefs, typeDefs], resolvers });
schema = authDirectiveTransformer(schema);

export const server = new ApolloServer<BaseContext>({
  // resolvers,
  // typeDefs: [authDirectiveTypeDefs, typeDefs],
  schema: schema,
  introspection: process.env.NODE_ENV !== 'production',
});

console.log('process.env.NODE_ENV', process.env.NODE_ENV);

export const context = async ({ req, res }) => ({
  // Connection
  res,
  // user
  user: req.user,
  device: req.device,
  phone: req.phone,
  version: req.version,
  applicationId: req.applicationId,
  test: req.test,
  test2: req.headers.test,
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
