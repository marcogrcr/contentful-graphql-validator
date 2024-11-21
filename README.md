# contentful-graphql-validator

This packge provides a funciton that validates GraphQL documents meant to be sent to the [GraphQL Content API].

# Usage

```js
import { validateDocument } from "contentful-graphql-validator";

validateDocument({
  // You can use `graphql-tag` package or similar or a plain string
  document: gql`
    query {
      myType {
        myField
      }
    }
  `,
  // specify the variables that would be sent alongside the query to the API
  variables: {
    // required: indicate whether preview content will be read
    preview: false,
  },
});
```

# Validation

## What is validated?

A GraphQL document is valid if all of the following is true:

- The document has exactly one `query` operation.
- If the `query` defines a `$preview` variable, it's of type `Boolean` or `Boolean!`.
- All fields have a consistent `preview` argument value: either `true` or `false | null`.
- If preview content is queried, all `query` root fields have their `preview` argument set to `true`.

# Why validate the queries?

Unlike the REST API counterparts which separate published from preview content via the [Content Delivery API] and
[Content Preview API] respectively, the [GraphQL Content API] provides a single endpoint for obtaining both.
To determine which version of content to obtain, a [preview] argument is available for every field that obtains an entry
or a collection of entries.

Unfortunately, there's no server-side validation on this argument beyond type matching which allows for queries that may
not be desired such as mixing preview and published content:

```graphql
query {
  myType1(preview: true) {
    myReference {
      # this will inherit `preview: true`
      myField
    }
  }
  myType2(preview: false) {
    myReference {
      # this will inherit `preview: false`
      myField
    }
  }
}
```

While it's unlikely that someone would accidentally write that query, it's more likely for something like this happens,
especially in complex queries:

```graphql
query ($preview: Boolean) {
  myType1(preview: $preview) {
    myField
  }
  # (...long complex query...)
  myTypeN {
    # Accidentally forgot to add `preview: $preview`
    myField
  }
}
```

When the query is executed with `{ preview: true }`, the `myTypeN` field would obtain published content since the
`preview` argument defaults to `false`.

This becomes even more complex when using fragments:

```graphql
query ($preview: Boolean) {
  myType1(preview: $preview) {
    ...MyType1Fragment
  }
  ...MyQueryFragment1
}

fragment MyQueryFragment1 on Query {
  ...MyQueryFragment2
}

fragment MyQueryFragment2 on Query {
  myType1 {
    # This should have `preview: $preview`
    ...MyType1Fragment
  }
}

fragment MyType1Fragment on Type1 {
  # This doesn't need the `preview` argument since it inherits the `preview` argument value from `Query.myType1`
  myField
}
```

[Content Delivery API]: https://www.contentful.com/developers/docs/references/content-delivery-api/
[Content Preview API]: https://www.contentful.com/developers/docs/references/content-preview-api/
[GraphQL Content API]: https://www.contentful.com/developers/docs/references/graphql/
[preview]: https://www.contentful.com/developers/docs/references/graphql/#/introduction/previewing-content
