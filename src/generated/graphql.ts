import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { IDeputy, IProcedure } from '@democracy-deutschland/democracy-common';
import { GraphQlContext } from '../types/graphqlContext';
import { DeepPartial } from 'utility-types';
export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = { [X in Exclude<keyof T, K>]?: T[X] } & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  Date: any;
};

export type ActivityIndex = {
  __typename?: 'ActivityIndex';
  activityIndex: Scalars['Int'];
  active?: Maybe<Scalars['Boolean']>;
};

export type Auth = {
  __typename?: 'Auth';
  token: Scalars['String'];
};

export type CodeResult = {
  __typename?: 'CodeResult';
  reason?: Maybe<Scalars['String']>;
  allowNewUser?: Maybe<Scalars['Boolean']>;
  succeeded: Scalars['Boolean'];
  resendTime?: Maybe<Scalars['Date']>;
  expireTime?: Maybe<Scalars['Date']>;
};

export type CommunityConstituencyVotes = {
  __typename?: 'CommunityConstituencyVotes';
  constituency: Scalars['String'];
  yes: Scalars['Int'];
  no: Scalars['Int'];
  abstination: Scalars['Int'];
  total: Scalars['Int'];
};

export type CommunityVotes = {
  __typename?: 'CommunityVotes';
  yes: Scalars['Int'];
  no: Scalars['Int'];
  abstination: Scalars['Int'];
  total: Scalars['Int'];
  constituencies: Array<CommunityConstituencyVotes>;
};

export type ConferenceWeek = {
  __typename?: 'ConferenceWeek';
  start: Scalars['Date'];
  end: Scalars['Date'];
  calendarWeek: Scalars['Int'];
};


export type DeputiesResult = {
  __typename?: 'DeputiesResult';
  total: Scalars['Int'];
  hasMore: Scalars['Boolean'];
  data: Array<Deputy>;
};

export type Deputy = {
  __typename?: 'Deputy';
  _id: Scalars['ID'];
  webId: Scalars['String'];
  imgURL: Scalars['String'];
  name: Scalars['String'];
  party?: Maybe<Scalars['String']>;
  job?: Maybe<Scalars['String']>;
  biography?: Maybe<Scalars['String']>;
  constituency?: Maybe<Scalars['String']>;
  directCandidate?: Maybe<Scalars['Boolean']>;
  contact?: Maybe<DeputyContact>;
  totalProcedures?: Maybe<Scalars['Int']>;
  procedures: Array<DeputyProcedure>;
  period: Scalars['Int'];
};


export type DeputyProceduresArgs = {
  procedureIds?: Maybe<Array<Scalars['String']>>;
  pageSize?: Maybe<Scalars['Int']>;
  offset?: Maybe<Scalars['Int']>;
};

export type DeputyContact = {
  __typename?: 'DeputyContact';
  address?: Maybe<Scalars['String']>;
  email?: Maybe<Scalars['String']>;
  links: Array<DeputyLink>;
};

export type DeputyLink = {
  __typename?: 'DeputyLink';
  name: Scalars['String'];
  URL: Scalars['String'];
  username?: Maybe<Scalars['String']>;
};

export type DeputyProcedure = {
  __typename?: 'DeputyProcedure';
  decision: VoteSelection;
  procedure: Procedure;
};

export type DeputyVote = {
  __typename?: 'DeputyVote';
  deputy: Deputy;
  decision: VoteSelection;
};

export type Deviants = {
  __typename?: 'Deviants';
  yes: Scalars['Int'];
  abstination: Scalars['Int'];
  no: Scalars['Int'];
  notVoted?: Maybe<Scalars['Int']>;
};

export type Device = {
  __typename?: 'Device';
  notificationSettings?: Maybe<NotificationSettings>;
};

export type Document = {
  __typename?: 'Document';
  editor: Scalars['String'];
  number: Scalars['String'];
  type: Scalars['String'];
  url: Scalars['String'];
};

export enum ListType {
  Preparation = 'PREPARATION',
  InVote = 'IN_VOTE',
  Past = 'PAST',
  Hot = 'HOT',
  Top100 = 'TOP100',
  ConferenceweeksPlanned = 'CONFERENCEWEEKS_PLANNED'
}

export type Mutation = {
  __typename?: 'Mutation';
  increaseActivity?: Maybe<ActivityIndex>;
  requestCode: CodeResult;
  requestVerification: VerificationResult;
  addToken: TokenResult;
  updateNotificationSettings?: Maybe<NotificationSettings>;
  toggleNotification?: Maybe<Procedure>;
  finishSearch: SearchTerm;
  signUp?: Maybe<Auth>;
  vote: Vote;
};


export type MutationIncreaseActivityArgs = {
  procedureId: Scalars['String'];
};


export type MutationRequestCodeArgs = {
  newPhone: Scalars['String'];
  oldPhoneHash?: Maybe<Scalars['String']>;
};


export type MutationRequestVerificationArgs = {
  code: Scalars['String'];
  newPhoneHash: Scalars['String'];
  newUser?: Maybe<Scalars['Boolean']>;
};


export type MutationAddTokenArgs = {
  token: Scalars['String'];
  os: Scalars['String'];
};


export type MutationUpdateNotificationSettingsArgs = {
  enabled?: Maybe<Scalars['Boolean']>;
  newVote?: Maybe<Scalars['Boolean']>;
  newPreperation?: Maybe<Scalars['Boolean']>;
  conferenceWeekPushs?: Maybe<Scalars['Boolean']>;
  voteConferenceWeekPushs?: Maybe<Scalars['Boolean']>;
  voteTOP100Pushs?: Maybe<Scalars['Boolean']>;
  outcomePushs?: Maybe<Scalars['Boolean']>;
  outcomePushsEnableOld?: Maybe<Scalars['Boolean']>;
  disableUntil?: Maybe<Scalars['Date']>;
  procedures?: Maybe<Array<Maybe<Scalars['String']>>>;
  tags?: Maybe<Array<Maybe<Scalars['String']>>>;
};


export type MutationToggleNotificationArgs = {
  procedureId: Scalars['String'];
};


export type MutationFinishSearchArgs = {
  term: Scalars['String'];
};


export type MutationSignUpArgs = {
  deviceHashEncrypted: Scalars['String'];
};


export type MutationVoteArgs = {
  procedure: Scalars['ID'];
  selection: VoteSelection;
  constituency?: Maybe<Scalars['String']>;
};

export type NotificationSettings = {
  __typename?: 'NotificationSettings';
  enabled?: Maybe<Scalars['Boolean']>;
  /** @deprecated <= 1.22 Notification Settings */
  newVote?: Maybe<Scalars['Boolean']>;
  /** @deprecated <= 1.22 Notification Settings */
  newPreperation?: Maybe<Scalars['Boolean']>;
  conferenceWeekPushs?: Maybe<Scalars['Boolean']>;
  voteConferenceWeekPushs?: Maybe<Scalars['Boolean']>;
  voteTOP100Pushs?: Maybe<Scalars['Boolean']>;
  outcomePushs?: Maybe<Scalars['Boolean']>;
  disableUntil?: Maybe<Scalars['Date']>;
  procedures?: Maybe<Array<Maybe<Scalars['String']>>>;
  tags?: Maybe<Array<Maybe<Scalars['String']>>>;
};

export type PartyVote = {
  __typename?: 'PartyVote';
  party: Scalars['String'];
  main: VoteSelection;
  deviants: Deviants;
};

export type Procedure = {
  __typename?: 'Procedure';
  _id: Scalars['ID'];
  title: Scalars['String'];
  procedureId: Scalars['String'];
  type: Scalars['String'];
  period?: Maybe<Scalars['Int']>;
  currentStatus?: Maybe<Scalars['String']>;
  currentStatusHistory: Array<Scalars['String']>;
  abstract?: Maybe<Scalars['String']>;
  tags: Array<Scalars['String']>;
  voteDate?: Maybe<Scalars['Date']>;
  voteEnd?: Maybe<Scalars['Date']>;
  voteWeek?: Maybe<Scalars['Int']>;
  voteYear?: Maybe<Scalars['Int']>;
  sessionTOPHeading?: Maybe<Scalars['String']>;
  subjectGroups: Array<Scalars['String']>;
  submissionDate?: Maybe<Scalars['Date']>;
  activityIndex: ActivityIndex;
  votes: Scalars['Int'];
  importantDocuments: Array<Document>;
  voteResults?: Maybe<VoteResult>;
  communityVotes?: Maybe<CommunityVotes>;
  voted: Scalars['Boolean'];
  votedGovernment?: Maybe<Scalars['Boolean']>;
  completed?: Maybe<Scalars['Boolean']>;
  notify?: Maybe<Scalars['Boolean']>;
  /** @deprecated Use listTypes instead of type */
  listType?: Maybe<ProcedureType>;
  list?: Maybe<ListType>;
  verified?: Maybe<Scalars['Boolean']>;
};


export type ProcedureCommunityVotesArgs = {
  constituencies?: Maybe<Array<Scalars['String']>>;
};

export type ProcedureFilter = {
  subjectGroups?: Maybe<Array<Scalars['String']>>;
  status?: Maybe<Array<Scalars['String']>>;
  type?: Maybe<Array<Scalars['String']>>;
  activity?: Maybe<Array<Scalars['String']>>;
};

export type ProceduresHavingVoteResults = {
  __typename?: 'ProceduresHavingVoteResults';
  total: Scalars['Int'];
  procedures: Array<Procedure>;
};

export enum ProcedureType {
  InVote = 'IN_VOTE',
  Preparation = 'PREPARATION',
  Voting = 'VOTING',
  Past = 'PAST',
  Hot = 'HOT'
}

export type ProcedureWomFilter = {
  subjectGroups: Array<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  activityIndex?: Maybe<ActivityIndex>;
  currentConferenceWeek: ConferenceWeek;
  deputiesOfConstituency: Array<Deputy>;
  deputies: DeputiesResult;
  deputy?: Maybe<Deputy>;
  notificationSettings?: Maybe<NotificationSettings>;
  procedure: Procedure;
  procedures: Array<Procedure>;
  proceduresById: Array<Procedure>;
  proceduresByIdHavingVoteResults: ProceduresHavingVoteResults;
  notifiedProcedures: Array<Procedure>;
  /** @deprecated use searchProceduresAutocomplete */
  searchProcedures: Array<Procedure>;
  searchProceduresAutocomplete: SearchProcedures;
  votedProcedures: Array<Procedure>;
  proceduresWithVoteResults: Array<Procedure>;
  recommendedProcedures: RecommendedProceduresResult;
  showRecommendations: Scalars['Boolean'];
  mostSearched: Array<SearchTerm>;
  me?: Maybe<User>;
  votes?: Maybe<Vote>;
  communityVotes?: Maybe<CommunityVotes>;
  voteStatistic?: Maybe<VoteStatistic>;
};


export type QueryActivityIndexArgs = {
  procedureId: Scalars['String'];
};


export type QueryDeputiesOfConstituencyArgs = {
  constituency: Scalars['String'];
  period?: Maybe<Scalars['Int']>;
  directCandidate?: Maybe<Scalars['Boolean']>;
};


export type QueryDeputiesArgs = {
  period?: Maybe<Scalars['Int']>;
  limit?: Maybe<Scalars['Int']>;
  offset?: Maybe<Scalars['Int']>;
  filterTerm?: Maybe<Scalars['String']>;
  filterIds?: Maybe<Array<Scalars['String']>>;
  excludeIds?: Maybe<Array<Scalars['String']>>;
  filterConstituency?: Maybe<Scalars['String']>;
};


export type QueryDeputyArgs = {
  id: Scalars['String'];
};


export type QueryProcedureArgs = {
  id: Scalars['ID'];
};


export type QueryProceduresArgs = {
  listTypes?: Maybe<Array<ListType>>;
  type?: Maybe<ProcedureType>;
  pageSize?: Maybe<Scalars['Int']>;
  offset?: Maybe<Scalars['Int']>;
  sort?: Maybe<Scalars['String']>;
  filter?: Maybe<ProcedureFilter>;
  period?: Maybe<Scalars['Int']>;
};


export type QueryProceduresByIdArgs = {
  ids: Array<Scalars['String']>;
  pageSize?: Maybe<Scalars['Int']>;
  offset?: Maybe<Scalars['Int']>;
};


export type QueryProceduresByIdHavingVoteResultsArgs = {
  procedureIds?: Maybe<Array<Scalars['String']>>;
  period?: Maybe<Scalars['Int']>;
  timespan?: Maybe<VotedTimeSpan>;
  pageSize?: Maybe<Scalars['Int']>;
  offset?: Maybe<Scalars['Int']>;
  filter?: Maybe<ProcedureWomFilter>;
};


export type QuerySearchProceduresArgs = {
  term: Scalars['String'];
};


export type QuerySearchProceduresAutocompleteArgs = {
  term: Scalars['String'];
  period?: Maybe<Scalars['Int']>;
};


export type QueryProceduresWithVoteResultsArgs = {
  procedureIds: Array<Scalars['String']>;
};


export type QueryRecommendedProceduresArgs = {
  period?: Maybe<Scalars['Int']>;
};


export type QueryShowRecommendationsArgs = {
  period?: Maybe<Scalars['Int']>;
};


export type QueryVotesArgs = {
  procedure: Scalars['ID'];
  constituencies?: Maybe<Array<Scalars['String']>>;
};


export type QueryCommunityVotesArgs = {
  procedure: Scalars['ID'];
  constituencies?: Maybe<Array<Scalars['String']>>;
};

export type RecommendationGroup = {
  __typename?: 'RecommendationGroup';
  title: Scalars['String'];
  procedures: Array<Procedure>;
};

export type RecommendedProceduresResult = {
  __typename?: 'RecommendedProceduresResult';
  total: Scalars['Int'];
  hasMore: Scalars['Boolean'];
  data: Array<RecommendationGroup>;
};

export type Schema = {
  __typename?: 'Schema';
  query?: Maybe<Query>;
};

export type SearchProcedures = {
  __typename?: 'SearchProcedures';
  procedures: Array<Procedure>;
  autocomplete: Array<Scalars['String']>;
};

export type SearchTerm = {
  __typename?: 'SearchTerm';
  term: Scalars['String'];
};

export type TokenResult = {
  __typename?: 'TokenResult';
  succeeded?: Maybe<Scalars['Boolean']>;
};

export type User = {
  __typename?: 'User';
  _id: Scalars['String'];
  verified: Scalars['Boolean'];
  /** @deprecated Field no longer supported */
  deviceHash?: Maybe<Scalars['String']>;
};

export type VerificationResult = {
  __typename?: 'VerificationResult';
  reason?: Maybe<Scalars['String']>;
  succeeded: Scalars['Boolean'];
};

export type Vote = {
  __typename?: 'Vote';
  _id: Scalars['ID'];
  voted: Scalars['Boolean'];
  voteResults?: Maybe<CommunityVotes>;
};

export enum VotedTimeSpan {
  CurrentSittingWeek = 'CurrentSittingWeek',
  LastSittingWeek = 'LastSittingWeek',
  CurrentQuarter = 'CurrentQuarter',
  LastQuarter = 'LastQuarter',
  CurrentYear = 'CurrentYear',
  LastYear = 'LastYear',
  Period = 'Period'
}

export type VoteResult = {
  __typename?: 'VoteResult';
  procedureId: Scalars['String'];
  yes: Scalars['Int'];
  no: Scalars['Int'];
  abstination: Scalars['Int'];
  notVoted?: Maybe<Scalars['Int']>;
  /** @deprecated Field no longer supported */
  notVote?: Maybe<Scalars['Int']>;
  governmentDecision: VoteSelection;
  decisionText?: Maybe<Scalars['String']>;
  namedVote: Scalars['Boolean'];
  partyVotes: Array<PartyVote>;
  deputyVotes: Array<DeputyVote>;
};


export type VoteResultDeputyVotesArgs = {
  constituencies?: Maybe<Array<Scalars['String']>>;
  directCandidate?: Maybe<Scalars['Boolean']>;
  webIds?: Maybe<Array<Scalars['String']>>;
};

export enum VoteSelection {
  Yes = 'YES',
  No = 'NO',
  Abstination = 'ABSTINATION',
  Notvoted = 'NOTVOTED'
}

export type VoteStatistic = {
  __typename?: 'VoteStatistic';
  proceduresCount: Scalars['Int'];
  votedProcedures: Scalars['Int'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type LegacyStitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type NewStitchingResolver<TResult, TParent, TContext, TArgs> = {
  selectionSet: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type StitchingResolver<TResult, TParent, TContext, TArgs> = LegacyStitchingResolver<TResult, TParent, TContext, TArgs> | NewStitchingResolver<TResult, TParent, TContext, TArgs>;
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterator<TResult> | Promise<AsyncIterator<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Query: ResolverTypeWrapper<{}>;
  String: ResolverTypeWrapper<DeepPartial<Scalars['String']>>;
  ActivityIndex: ResolverTypeWrapper<DeepPartial<ActivityIndex>>;
  Int: ResolverTypeWrapper<DeepPartial<Scalars['Int']>>;
  Boolean: ResolverTypeWrapper<DeepPartial<Scalars['Boolean']>>;
  ConferenceWeek: ResolverTypeWrapper<DeepPartial<ConferenceWeek>>;
  Date: ResolverTypeWrapper<DeepPartial<Scalars['Date']>>;
  Deputy: ResolverTypeWrapper<IDeputy>;
  ID: ResolverTypeWrapper<DeepPartial<Scalars['ID']>>;
  DeputyContact: ResolverTypeWrapper<DeepPartial<DeputyContact>>;
  DeputyLink: ResolverTypeWrapper<DeepPartial<DeputyLink>>;
  DeputyProcedure: ResolverTypeWrapper<DeepPartial<Omit<DeputyProcedure, 'procedure'> & { procedure: ResolversTypes['Procedure'] }>>;
  VoteSelection: ResolverTypeWrapper<DeepPartial<VoteSelection>>;
  Procedure: ResolverTypeWrapper<IProcedure>;
  Document: ResolverTypeWrapper<DeepPartial<Document>>;
  VoteResult: ResolverTypeWrapper<DeepPartial<Omit<VoteResult, 'deputyVotes'> & { deputyVotes: Array<ResolversTypes['DeputyVote']> }>>;
  PartyVote: ResolverTypeWrapper<DeepPartial<PartyVote>>;
  Deviants: ResolverTypeWrapper<DeepPartial<Deviants>>;
  DeputyVote: ResolverTypeWrapper<DeepPartial<Omit<DeputyVote, 'deputy'> & { deputy: ResolversTypes['Deputy'] }>>;
  CommunityVotes: ResolverTypeWrapper<DeepPartial<CommunityVotes>>;
  CommunityConstituencyVotes: ResolverTypeWrapper<DeepPartial<CommunityConstituencyVotes>>;
  ProcedureType: ResolverTypeWrapper<DeepPartial<ProcedureType>>;
  ListType: ResolverTypeWrapper<DeepPartial<ListType>>;
  DeputiesResult: ResolverTypeWrapper<DeepPartial<Omit<DeputiesResult, 'data'> & { data: Array<ResolversTypes['Deputy']> }>>;
  NotificationSettings: ResolverTypeWrapper<DeepPartial<NotificationSettings>>;
  ProcedureFilter: ResolverTypeWrapper<DeepPartial<ProcedureFilter>>;
  VotedTimeSpan: ResolverTypeWrapper<DeepPartial<VotedTimeSpan>>;
  ProcedureWOMFilter: ResolverTypeWrapper<DeepPartial<ProcedureWomFilter>>;
  ProceduresHavingVoteResults: ResolverTypeWrapper<DeepPartial<Omit<ProceduresHavingVoteResults, 'procedures'> & { procedures: Array<ResolversTypes['Procedure']> }>>;
  SearchProcedures: ResolverTypeWrapper<DeepPartial<Omit<SearchProcedures, 'procedures'> & { procedures: Array<ResolversTypes['Procedure']> }>>;
  RecommendedProceduresResult: ResolverTypeWrapper<DeepPartial<Omit<RecommendedProceduresResult, 'data'> & { data: Array<ResolversTypes['RecommendationGroup']> }>>;
  RecommendationGroup: ResolverTypeWrapper<DeepPartial<Omit<RecommendationGroup, 'procedures'> & { procedures: Array<ResolversTypes['Procedure']> }>>;
  SearchTerm: ResolverTypeWrapper<DeepPartial<SearchTerm>>;
  User: ResolverTypeWrapper<DeepPartial<User>>;
  Vote: ResolverTypeWrapper<DeepPartial<Vote>>;
  VoteStatistic: ResolverTypeWrapper<DeepPartial<VoteStatistic>>;
  Mutation: ResolverTypeWrapper<{}>;
  CodeResult: ResolverTypeWrapper<DeepPartial<CodeResult>>;
  VerificationResult: ResolverTypeWrapper<DeepPartial<VerificationResult>>;
  TokenResult: ResolverTypeWrapper<DeepPartial<TokenResult>>;
  Auth: ResolverTypeWrapper<DeepPartial<Auth>>;
  Device: ResolverTypeWrapper<DeepPartial<Device>>;
  Schema: ResolverTypeWrapper<DeepPartial<Omit<Schema, 'query'> & { query?: Maybe<ResolversTypes['Query']> }>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Query: {};
  String: DeepPartial<Scalars['String']>;
  ActivityIndex: DeepPartial<ActivityIndex>;
  Int: DeepPartial<Scalars['Int']>;
  Boolean: DeepPartial<Scalars['Boolean']>;
  ConferenceWeek: DeepPartial<ConferenceWeek>;
  Date: DeepPartial<Scalars['Date']>;
  Deputy: IDeputy;
  ID: DeepPartial<Scalars['ID']>;
  DeputyContact: DeepPartial<DeputyContact>;
  DeputyLink: DeepPartial<DeputyLink>;
  DeputyProcedure: DeepPartial<Omit<DeputyProcedure, 'procedure'> & { procedure: ResolversParentTypes['Procedure'] }>;
  Procedure: IProcedure;
  Document: DeepPartial<Document>;
  VoteResult: DeepPartial<Omit<VoteResult, 'deputyVotes'> & { deputyVotes: Array<ResolversParentTypes['DeputyVote']> }>;
  PartyVote: DeepPartial<PartyVote>;
  Deviants: DeepPartial<Deviants>;
  DeputyVote: DeepPartial<Omit<DeputyVote, 'deputy'> & { deputy: ResolversParentTypes['Deputy'] }>;
  CommunityVotes: DeepPartial<CommunityVotes>;
  CommunityConstituencyVotes: DeepPartial<CommunityConstituencyVotes>;
  DeputiesResult: DeepPartial<Omit<DeputiesResult, 'data'> & { data: Array<ResolversParentTypes['Deputy']> }>;
  NotificationSettings: DeepPartial<NotificationSettings>;
  ProcedureFilter: DeepPartial<ProcedureFilter>;
  ProcedureWOMFilter: DeepPartial<ProcedureWomFilter>;
  ProceduresHavingVoteResults: DeepPartial<Omit<ProceduresHavingVoteResults, 'procedures'> & { procedures: Array<ResolversParentTypes['Procedure']> }>;
  SearchProcedures: DeepPartial<Omit<SearchProcedures, 'procedures'> & { procedures: Array<ResolversParentTypes['Procedure']> }>;
  RecommendedProceduresResult: DeepPartial<Omit<RecommendedProceduresResult, 'data'> & { data: Array<ResolversParentTypes['RecommendationGroup']> }>;
  RecommendationGroup: DeepPartial<Omit<RecommendationGroup, 'procedures'> & { procedures: Array<ResolversParentTypes['Procedure']> }>;
  SearchTerm: DeepPartial<SearchTerm>;
  User: DeepPartial<User>;
  Vote: DeepPartial<Vote>;
  VoteStatistic: DeepPartial<VoteStatistic>;
  Mutation: {};
  CodeResult: DeepPartial<CodeResult>;
  VerificationResult: DeepPartial<VerificationResult>;
  TokenResult: DeepPartial<TokenResult>;
  Auth: DeepPartial<Auth>;
  Device: DeepPartial<Device>;
  Schema: DeepPartial<Omit<Schema, 'query'> & { query?: Maybe<ResolversParentTypes['Query']> }>;
};

export type ActivityIndexResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['ActivityIndex'] = ResolversParentTypes['ActivityIndex']> = {
  activityIndex?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  active?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AuthResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Auth'] = ResolversParentTypes['Auth']> = {
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CodeResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['CodeResult'] = ResolversParentTypes['CodeResult']> = {
  reason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  allowNewUser?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  succeeded?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  resendTime?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  expireTime?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CommunityConstituencyVotesResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['CommunityConstituencyVotes'] = ResolversParentTypes['CommunityConstituencyVotes']> = {
  constituency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  yes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  no?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  abstination?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CommunityVotesResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['CommunityVotes'] = ResolversParentTypes['CommunityVotes']> = {
  yes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  no?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  abstination?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  constituencies?: Resolver<Array<ResolversTypes['CommunityConstituencyVotes']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ConferenceWeekResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['ConferenceWeek'] = ResolversParentTypes['ConferenceWeek']> = {
  start?: Resolver<ResolversTypes['Date'], ParentType, ContextType>;
  end?: Resolver<ResolversTypes['Date'], ParentType, ContextType>;
  calendarWeek?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface DateScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Date'], any> {
  name: 'Date';
}

export type DeputiesResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['DeputiesResult'] = ResolversParentTypes['DeputiesResult']> = {
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  hasMore?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  data?: Resolver<Array<ResolversTypes['Deputy']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeputyResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Deputy'] = ResolversParentTypes['Deputy']> = {
  _id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  webId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  imgURL?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  party?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  job?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  biography?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  constituency?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  directCandidate?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  contact?: Resolver<Maybe<ResolversTypes['DeputyContact']>, ParentType, ContextType>;
  totalProcedures?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  procedures?: Resolver<Array<ResolversTypes['DeputyProcedure']>, ParentType, ContextType, RequireFields<DeputyProceduresArgs, never>>;
  period?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeputyContactResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['DeputyContact'] = ResolversParentTypes['DeputyContact']> = {
  address?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  links?: Resolver<Array<ResolversTypes['DeputyLink']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeputyLinkResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['DeputyLink'] = ResolversParentTypes['DeputyLink']> = {
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  URL?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  username?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeputyProcedureResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['DeputyProcedure'] = ResolversParentTypes['DeputyProcedure']> = {
  decision?: Resolver<ResolversTypes['VoteSelection'], ParentType, ContextType>;
  procedure?: Resolver<ResolversTypes['Procedure'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeputyVoteResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['DeputyVote'] = ResolversParentTypes['DeputyVote']> = {
  deputy?: Resolver<ResolversTypes['Deputy'], ParentType, ContextType>;
  decision?: Resolver<ResolversTypes['VoteSelection'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeviantsResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Deviants'] = ResolversParentTypes['Deviants']> = {
  yes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  abstination?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  no?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  notVoted?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeviceResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Device'] = ResolversParentTypes['Device']> = {
  notificationSettings?: Resolver<Maybe<ResolversTypes['NotificationSettings']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DocumentResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Document'] = ResolversParentTypes['Document']> = {
  editor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  number?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  increaseActivity?: Resolver<Maybe<ResolversTypes['ActivityIndex']>, ParentType, ContextType, RequireFields<MutationIncreaseActivityArgs, 'procedureId'>>;
  requestCode?: Resolver<ResolversTypes['CodeResult'], ParentType, ContextType, RequireFields<MutationRequestCodeArgs, 'newPhone'>>;
  requestVerification?: Resolver<ResolversTypes['VerificationResult'], ParentType, ContextType, RequireFields<MutationRequestVerificationArgs, 'code' | 'newPhoneHash'>>;
  addToken?: Resolver<ResolversTypes['TokenResult'], ParentType, ContextType, RequireFields<MutationAddTokenArgs, 'token' | 'os'>>;
  updateNotificationSettings?: Resolver<Maybe<ResolversTypes['NotificationSettings']>, ParentType, ContextType, RequireFields<MutationUpdateNotificationSettingsArgs, never>>;
  toggleNotification?: Resolver<Maybe<ResolversTypes['Procedure']>, ParentType, ContextType, RequireFields<MutationToggleNotificationArgs, 'procedureId'>>;
  finishSearch?: Resolver<ResolversTypes['SearchTerm'], ParentType, ContextType, RequireFields<MutationFinishSearchArgs, 'term'>>;
  signUp?: Resolver<Maybe<ResolversTypes['Auth']>, ParentType, ContextType, RequireFields<MutationSignUpArgs, 'deviceHashEncrypted'>>;
  vote?: Resolver<ResolversTypes['Vote'], ParentType, ContextType, RequireFields<MutationVoteArgs, 'procedure' | 'selection'>>;
};

export type NotificationSettingsResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['NotificationSettings'] = ResolversParentTypes['NotificationSettings']> = {
  enabled?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  newVote?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  newPreperation?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  conferenceWeekPushs?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  voteConferenceWeekPushs?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  voteTOP100Pushs?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  outcomePushs?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  disableUntil?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  procedures?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>;
  tags?: Resolver<Maybe<Array<Maybe<ResolversTypes['String']>>>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PartyVoteResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['PartyVote'] = ResolversParentTypes['PartyVote']> = {
  party?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  main?: Resolver<ResolversTypes['VoteSelection'], ParentType, ContextType>;
  deviants?: Resolver<ResolversTypes['Deviants'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProcedureResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Procedure'] = ResolversParentTypes['Procedure']> = {
  _id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  procedureId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  period?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  currentStatus?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  currentStatusHistory?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  abstract?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  voteDate?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  voteEnd?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  voteWeek?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  voteYear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  sessionTOPHeading?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  subjectGroups?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  submissionDate?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  activityIndex?: Resolver<ResolversTypes['ActivityIndex'], ParentType, ContextType>;
  votes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  importantDocuments?: Resolver<Array<ResolversTypes['Document']>, ParentType, ContextType>;
  voteResults?: Resolver<Maybe<ResolversTypes['VoteResult']>, ParentType, ContextType>;
  communityVotes?: Resolver<Maybe<ResolversTypes['CommunityVotes']>, ParentType, ContextType, RequireFields<ProcedureCommunityVotesArgs, never>>;
  voted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  votedGovernment?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  completed?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  notify?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  listType?: Resolver<Maybe<ResolversTypes['ProcedureType']>, ParentType, ContextType>;
  list?: Resolver<Maybe<ResolversTypes['ListType']>, ParentType, ContextType>;
  verified?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProceduresHavingVoteResultsResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['ProceduresHavingVoteResults'] = ResolversParentTypes['ProceduresHavingVoteResults']> = {
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  procedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  activityIndex?: Resolver<Maybe<ResolversTypes['ActivityIndex']>, ParentType, ContextType, RequireFields<QueryActivityIndexArgs, 'procedureId'>>;
  currentConferenceWeek?: Resolver<ResolversTypes['ConferenceWeek'], ParentType, ContextType>;
  deputiesOfConstituency?: Resolver<Array<ResolversTypes['Deputy']>, ParentType, ContextType, RequireFields<QueryDeputiesOfConstituencyArgs, 'constituency'>>;
  deputies?: Resolver<ResolversTypes['DeputiesResult'], ParentType, ContextType, RequireFields<QueryDeputiesArgs, never>>;
  deputy?: Resolver<Maybe<ResolversTypes['Deputy']>, ParentType, ContextType, RequireFields<QueryDeputyArgs, 'id'>>;
  notificationSettings?: Resolver<Maybe<ResolversTypes['NotificationSettings']>, ParentType, ContextType>;
  procedure?: Resolver<ResolversTypes['Procedure'], ParentType, ContextType, RequireFields<QueryProcedureArgs, 'id'>>;
  procedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType, RequireFields<QueryProceduresArgs, never>>;
  proceduresById?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType, RequireFields<QueryProceduresByIdArgs, 'ids'>>;
  proceduresByIdHavingVoteResults?: Resolver<ResolversTypes['ProceduresHavingVoteResults'], ParentType, ContextType, RequireFields<QueryProceduresByIdHavingVoteResultsArgs, never>>;
  notifiedProcedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType>;
  searchProcedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType, RequireFields<QuerySearchProceduresArgs, 'term'>>;
  searchProceduresAutocomplete?: Resolver<ResolversTypes['SearchProcedures'], ParentType, ContextType, RequireFields<QuerySearchProceduresAutocompleteArgs, 'term'>>;
  votedProcedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType>;
  proceduresWithVoteResults?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType, RequireFields<QueryProceduresWithVoteResultsArgs, 'procedureIds'>>;
  recommendedProcedures?: Resolver<ResolversTypes['RecommendedProceduresResult'], ParentType, ContextType, RequireFields<QueryRecommendedProceduresArgs, never>>;
  showRecommendations?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<QueryShowRecommendationsArgs, never>>;
  mostSearched?: Resolver<Array<ResolversTypes['SearchTerm']>, ParentType, ContextType>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  votes?: Resolver<Maybe<ResolversTypes['Vote']>, ParentType, ContextType, RequireFields<QueryVotesArgs, 'procedure'>>;
  communityVotes?: Resolver<Maybe<ResolversTypes['CommunityVotes']>, ParentType, ContextType, RequireFields<QueryCommunityVotesArgs, 'procedure'>>;
  voteStatistic?: Resolver<Maybe<ResolversTypes['VoteStatistic']>, ParentType, ContextType>;
};

export type RecommendationGroupResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['RecommendationGroup'] = ResolversParentTypes['RecommendationGroup']> = {
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  procedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RecommendedProceduresResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['RecommendedProceduresResult'] = ResolversParentTypes['RecommendedProceduresResult']> = {
  total?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  hasMore?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  data?: Resolver<Array<ResolversTypes['RecommendationGroup']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SchemaResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Schema'] = ResolversParentTypes['Schema']> = {
  query?: Resolver<Maybe<ResolversTypes['Query']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SearchProceduresResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['SearchProcedures'] = ResolversParentTypes['SearchProcedures']> = {
  procedures?: Resolver<Array<ResolversTypes['Procedure']>, ParentType, ContextType>;
  autocomplete?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SearchTermResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['SearchTerm'] = ResolversParentTypes['SearchTerm']> = {
  term?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TokenResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['TokenResult'] = ResolversParentTypes['TokenResult']> = {
  succeeded?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  _id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  verified?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  deviceHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VerificationResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['VerificationResult'] = ResolversParentTypes['VerificationResult']> = {
  reason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  succeeded?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VoteResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['Vote'] = ResolversParentTypes['Vote']> = {
  _id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  voted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  voteResults?: Resolver<Maybe<ResolversTypes['CommunityVotes']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VoteResultResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['VoteResult'] = ResolversParentTypes['VoteResult']> = {
  procedureId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  yes?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  no?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  abstination?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  notVoted?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  notVote?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  governmentDecision?: Resolver<ResolversTypes['VoteSelection'], ParentType, ContextType>;
  decisionText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  namedVote?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  partyVotes?: Resolver<Array<ResolversTypes['PartyVote']>, ParentType, ContextType>;
  deputyVotes?: Resolver<Array<ResolversTypes['DeputyVote']>, ParentType, ContextType, RequireFields<VoteResultDeputyVotesArgs, never>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type VoteStatisticResolvers<ContextType = GraphQlContext, ParentType extends ResolversParentTypes['VoteStatistic'] = ResolversParentTypes['VoteStatistic']> = {
  proceduresCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  votedProcedures?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = GraphQlContext> = {
  ActivityIndex?: ActivityIndexResolvers<ContextType>;
  Auth?: AuthResolvers<ContextType>;
  CodeResult?: CodeResultResolvers<ContextType>;
  CommunityConstituencyVotes?: CommunityConstituencyVotesResolvers<ContextType>;
  CommunityVotes?: CommunityVotesResolvers<ContextType>;
  ConferenceWeek?: ConferenceWeekResolvers<ContextType>;
  Date?: GraphQLScalarType;
  DeputiesResult?: DeputiesResultResolvers<ContextType>;
  Deputy?: DeputyResolvers<ContextType>;
  DeputyContact?: DeputyContactResolvers<ContextType>;
  DeputyLink?: DeputyLinkResolvers<ContextType>;
  DeputyProcedure?: DeputyProcedureResolvers<ContextType>;
  DeputyVote?: DeputyVoteResolvers<ContextType>;
  Deviants?: DeviantsResolvers<ContextType>;
  Device?: DeviceResolvers<ContextType>;
  Document?: DocumentResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  NotificationSettings?: NotificationSettingsResolvers<ContextType>;
  PartyVote?: PartyVoteResolvers<ContextType>;
  Procedure?: ProcedureResolvers<ContextType>;
  ProceduresHavingVoteResults?: ProceduresHavingVoteResultsResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RecommendationGroup?: RecommendationGroupResolvers<ContextType>;
  RecommendedProceduresResult?: RecommendedProceduresResultResolvers<ContextType>;
  Schema?: SchemaResolvers<ContextType>;
  SearchProcedures?: SearchProceduresResolvers<ContextType>;
  SearchTerm?: SearchTermResolvers<ContextType>;
  TokenResult?: TokenResultResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  VerificationResult?: VerificationResultResolvers<ContextType>;
  Vote?: VoteResolvers<ContextType>;
  VoteResult?: VoteResultResolvers<ContextType>;
  VoteStatistic?: VoteStatisticResolvers<ContextType>;
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = GraphQlContext> = Resolvers<ContextType>;
