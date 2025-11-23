export default `

type SearchTerm {
  term: String!
}

type Query {
  mostSearched: [SearchTerm!]! @deprecated(reason: "Always returns empty array, Elasticsearch removed")
}
 
type Mutation {
  finishSearch(term: String!): SearchTerm!
}
`;
