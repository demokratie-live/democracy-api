import { ApolloServer, BaseContext } from '@apollo/server';

import typeDefs from '../../graphql/schemas';
import resolvers from '../../graphql/resolvers';
import DataLoader from 'dataloader';
import { votedLoader } from '../../graphql/resolvers/dataLoaders';
import express from 'express';

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

const app = express();

app.get('/test', () => 'hallo');

export const server = new ApolloServer<BaseContext>({
  resolvers,
  typeDefs,
  introspection: true, // process.env.NODE_ENV !== 'production',
});

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
