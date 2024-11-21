import { DocumentNode, parse, visit } from "graphql";

import { GraphQLHelper } from "./graphql-helper";

export interface ValidateDocumentInput {
  /** The GraphQL document to validate. */
  readonly document: DocumentNode | string;

  /** The variables to be sent with the query. */
  readonly variables: Readonly<Record<string, unknown>> & {
    /** Indicates whether preview content will be read. */
    readonly preview: boolean;
  };
}

/**
 * Validates a GraphQL document for the Contentful GraphQL API.
 *
 * A GraphQL document is valid if all of the following is true:
 *
 * - The document has exactly one `query` operation.
 * - If the `query` defines a `$preview` variable, it's of type `Boolean` or `Boolean!`.
 * - All fields have a consistent `preview` argument value: either `true` or `false | null`.
 * - If preview content is queried, all `query` root fields have their `preview` argument set to `true`.
 *
 * @example
 * let document = gql`
 *   query {
 *     myType {
 *       myField
 *     }
 *   }
 * `;
 *
 * // valid
 * validateDocument({ document, variables: { preview: false } });
 *
 * // invalid: `myType` must have the `preview` argument set to `true`
 * validateDocument({ document, variables: { preview: true } });
 *
 * document = gql`
 *   query ($preview: Boolean) {
 *     myType(preview: $preview) {
 *       myField
 *     }
 *   }
 * `;
 *
 * // valid
 * validateDocument({ document, variables: { preview: true } });
 */
export function validateDocument(input: ValidateDocumentInput): void {
  const { document: rawDoc, variables } = input;
  const document = typeof rawDoc === "string" ? parse(rawDoc) : rawDoc;

  const helper = new GraphQLHelper(document);

  let operationCount = 0;
  visit(document, {
    OperationDefinition(node) {
      helper.validateOperation(node);
      ++operationCount;
    },
    VariableDefinition(node) {
      helper.validateVariableDefinition(node);
    },
    Field(node, key, parent, path, ancestors) {
      helper.validateField(node, ancestors, variables);
    },
  });

  if (operationCount !== 1) {
    throw new Error("The document must have exactly 1 operation.");
  }
}
