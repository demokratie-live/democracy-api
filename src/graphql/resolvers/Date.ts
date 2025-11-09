import { DateTimeResolver } from 'graphql-scalars';
import { Resolvers } from '../../generated/graphql';

const DateApi: Resolvers = {
  Date: DateTimeResolver,
};

export default DateApi;
