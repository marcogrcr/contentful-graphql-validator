import {
  ArgumentNode,
  ASTNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  Kind,
  OperationDefinitionNode,
  ValueNode,
  VariableDefinitionNode,
  visit,
} from "graphql";

interface FragmentUsage {
  readonly node: FragmentSpreadNode;
  readonly ancestors: readonly (ASTNode | readonly ASTNode[])[];
}

/**
 * Provides functionality for working with GraphQL queries sent to the Contentful GraphQL API.
 *
 * This class is not meant to be used directly.
 */
export class GraphQLHelper {
  readonly #document: DocumentNode;

  // caches
  readonly #fragmentUsedInRoot = new Map<FragmentDefinitionNode, boolean>();
  readonly #fragmentUsages = new Map<FragmentDefinitionNode, FragmentUsage[]>();

  constructor(document: DocumentNode) {
    this.#document = document;
  }

  /**
   * Gets the usages of a fragment.
   *
   * ```graphql
   * query {
   *   ... MyFragment # usage
   * }
   *
   * fragment MyFragment on Type {
   *   field
   * }
   * ```
   */
  getFragmentUsages(fragment: FragmentDefinitionNode): FragmentUsage[] {
    let usages = this.#fragmentUsages.get(fragment);
    if (usages) {
      return usages;
    }

    usages = [];
    visit(this.#document, {
      FragmentSpread(node, key, parent, path, ancestors) {
        if (node.name.value === fragment.name.value) {
          usages.push({
            node,
            // we have to copy this array because `visit` clears the `ancestors` array reference
            ancestors: [...ancestors],
          });
        }
      },
    });
    this.#fragmentUsages.set(fragment, usages);

    return usages;
  }

  /**
   * Indicates whether the specified fragment is used in the operation root.
   *
   * ```graphql
   * query {
   *   ... MyFragment # used in operation root
   *   field {
   *     ... MyFragment # used in nested field
   *   }
   * }
   *
   * fragment MyFragment on Type {
   * }
   * ```
   */
  isFragmentUsedInRoot(fragment: FragmentDefinitionNode): boolean {
    let usedInRoot = this.#fragmentUsedInRoot.get(fragment);
    if (usedInRoot !== undefined) {
      return usedInRoot;
    }

    usedInRoot = this.#isFragmentUsedInRoot(fragment, []);
    this.#fragmentUsedInRoot.set(fragment, usedInRoot);

    return usedInRoot;
  }

  /** Determines whether a {@link FieldNode} or {@link FragmentSpread} is present at the root of a document. */
  isInRoot(
    node: FieldNode | FragmentSpreadNode,
    ancestors: readonly (ASTNode | readonly ASTNode[])[],
  ):
    | {
        readonly isRoot: false;
      }
    | {
        readonly isRoot: true;
        readonly container: FragmentDefinitionNode | OperationDefinitionNode;
      } {
    if (node.kind === Kind.FIELD) {
      /**
       * Root `FieldNode` ancestors:
       * ```
       * type RootFieldNodeAncestors =
       *   // root field
       *   | [
       *       DocumentNode,
       *       ExecutableDefinitionNode[],
       *       OperationDefinitionNode,
       *       SelectionSetNode,
       *     ]
       *   // root fragment field
       *   | [
       *       DocumentNode,
       *       ExecutableDefinitionNode[],
       *       FragmentDefinition,
       *       SelectionSet,
       *   ]
       *   // root inline fragment field
       *   | [
       *       DocumentNode,
       *       ExecutableDefinitionNode[],
       *       FragmentDefinition | OperationDefinitionNode,
       *       SelectionSetNode,
       *       SelectionNode[],
       *       InlineFragmentNode,
       *       SelectionSetNode,
       *   ];
       * ```
       */
      const container = ancestors[ancestors.length - 2] as ASTNode;

      // root field
      if (container.kind === Kind.OPERATION_DEFINITION) {
        return { isRoot: true, container };
      }

      // root fragment field
      if (container.kind === Kind.FRAGMENT_DEFINITION) {
        return { isRoot: true, container };
      }

      // root inline fragment field
      if (container.kind === Kind.INLINE_FRAGMENT) {
        const d = ancestors[ancestors.length - 7];
        const isRoot = "kind" in d && d.kind === Kind.DOCUMENT;
        if (!isRoot) {
          return { isRoot };
        }

        const container = ancestors[ancestors.length - 5];
        return {
          isRoot,
          container: container as
            | FragmentDefinitionNode
            | OperationDefinitionNode,
        };
      }

      // nested field
      return { isRoot: false };
    }

    /**
     * Root `FragmentSpreadNode` ancestors:
     * ```
     * type RootFragmentSpreadNodeAncestors = [
     *   DocumentNode,
     *   ExecutableDefinitionNode[],
     *   FragmentDefinition | OperationDefinitionNode,
     *   SelectionSetNode,
     * ];
     */
    const d = ancestors[ancestors.length - 4];
    const isRoot = "kind" in d && d.kind === Kind.DOCUMENT;
    if (!isRoot) {
      return { isRoot };
    }

    const container = ancestors[ancestors.length - 2];
    return {
      isRoot,
      container: container as FragmentDefinitionNode | OperationDefinitionNode,
    };
  }

  /** Gets an argument value. */
  resolveArgumentValue(
    argument: ArgumentNode,
    variables: Record<string, unknown>,
  ): unknown {
    return this.#resolveValueNode(argument.value, variables);
  }

  /** Validates the `preview` argument of a field. */
  validateField(
    node: FieldNode,
    ancestors: readonly (ASTNode | readonly ASTNode[])[],
    variables: Record<string, unknown>,
  ) {
    const previewVar = variables?.preview;

    // the value of all fields with a `preview` argument must match the `preview` variable value
    let previewArg: unknown;
    node.arguments?.forEach((arg) => {
      // for `preview` argument
      if (arg.name.value === "preview") {
        // resolve the argument value
        previewArg = this.resolveArgumentValue(arg, variables);

        if (previewArg !== null && typeof previewArg !== "boolean") {
          throw new Error(
            `Field with non-boolean preview argument value: ${node.name.value}`,
          );
        }

        // ensure the coalesced boolean value matches
        if (!previewVar !== !previewArg) {
          throw new Error(
            `Preview mismatch for field '${node.name.value}'. The variable is '${previewVar}', but the argument has another value`,
          );
        }
      }
    });

    // if `preview` variable is true, the `preview` argument must be set to true on all root fields
    if (previewVar && !previewArg) {
      const result = this.isInRoot(node, ancestors);
      if (
        result.isRoot &&
        (result.container.kind === Kind.OPERATION_DEFINITION ||
          this.isFragmentUsedInRoot(result.container))
      ) {
        throw new Error(
          `Root field does not have a preview argument set to true: ${node.name.value}`,
        );
      }
    }
  }

  /** Ensures the operation is a query. */
  validateOperation(node: OperationDefinitionNode): void {
    if (node.operation !== "query") {
      throw new Error("The operation must be a query");
    }
  }

  /** Ensures the preview variable is of type `Boolean` (if any). */
  validateVariableDefinition(node: VariableDefinitionNode): void {
    if (node.variable.name.value === "preview") {
      // Unwrap non-null types (e.g. Boolean! => Boolean)
      const type =
        node.type.kind === Kind.NON_NULL_TYPE ? node.type.type : node.type;

      if (type.kind === Kind.LIST_TYPE || type.name.value !== "Boolean") {
        throw new Error("The preview variable must be of type Boolean");
      }
    }
  }

  #isFragmentUsedInRoot(
    fragment: FragmentDefinitionNode,
    visited: FragmentDefinitionNode[],
  ): boolean {
    if (visited.includes(fragment)) {
      throw new Error(
        `A fragment cycle has been detected: ${visited.map((x) => x.name.value).join("->")}${fragment.name.value}`,
      );
    }

    visited.push(fragment);

    const usages = this.getFragmentUsages(fragment);
    return usages.some(({ node, ancestors }) => {
      const result = this.isInRoot(node, ancestors);
      if (!result.isRoot) {
        return false;
      }

      if (result.container.kind === Kind.OPERATION_DEFINITION) {
        return true;
      }

      return this.#isFragmentUsedInRoot(result.container, visited);
    });
  }

  #resolveValueNode(
    value: ValueNode,
    variables: Record<string, unknown>,
  ): unknown {
    if (value.kind === Kind.NULL) {
      return null;
    }

    if (value.kind === Kind.INT) {
      return parseInt(value.value);
    }

    if (value.kind === Kind.FLOAT) {
      return parseFloat(value.value);
    }

    if (value.kind === Kind.OBJECT) {
      const obj: Record<string, unknown> = {};
      for (const f of value.fields) {
        obj[f.name.value] = this.#resolveValueNode(f.value, variables);
      }

      return obj;
    }

    if (value.kind === Kind.LIST) {
      return value.values.map((x) => this.#resolveValueNode(x, variables));
    }

    if (value.kind === Kind.VARIABLE) {
      return variables[value.name.value] ?? null;
    }

    return value.value;
  }
}
