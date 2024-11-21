import { DocumentNode, Kind, parse, visit } from "graphql";
import { describe, expect, it } from "vitest";

import { GraphQLHelper } from "../src/graphql-helper";

function gql(value: string | readonly string[]): DocumentNode {
  return parse(typeof value === "string" ? value : value.join(""));
}

describe("GraphQLHelper", () => {
  describe("getFragmentUsages", () => {
    it("caches and returns the usages", () => {
      const document = gql`
        query {
          ...MyFragment
          field {
            ...MyFragment
          }
        }

        fragment MyFragment on Type {
          field
        }

        fragment OtherFragment on Type {
          ...MyFragment
        }
      `;

      const sut = new GraphQLHelper(document);

      let visited = false;
      visit(document, {
        FragmentDefinition(node) {
          if (node.name.value === "MyFragment") {
            const actual = sut.getFragmentUsages(node);

            expect(actual.length).toBe(3);
            expect(sut.getFragmentUsages(node)).toBe(actual); // cache

            visited = true;
          }
        },
      });

      expect(visited).toBe(true);
    });
  });

  describe("isFragmentUsedInRoot", () => {
    it("caches and returns the value", () => {
      const document = gql`
        query {
          ...Fragment1
          field1 {
            ...Fragment3
          }
        }

        fragment Fragment1 on Type {
          field2
          ...Fragment2
          field3 {
            ...Fragment4
          }
        }

        fragment Fragment2 on Type {
          field4
        }

        fragment Fragment3 on Type {
          field5
        }

        fragment Fragment4 on Type {
          field6
        }

        fragment Fragment5 on Type {
          field7
        }
      `;

      const sut = new GraphQLHelper(document);

      const testCases = new Map([
        ["Fragment1", true],
        ["Fragment2", true],
        ["Fragment3", false],
        ["Fragment4", false],
        ["Fragment5", false],
      ]);
      let visitCount = 0;
      visit(document, {
        FragmentDefinition(node) {
          const name = node.name.value;

          const actual = sut.isFragmentUsedInRoot(node);

          expect(actual, name).toBe(testCases.get(name));
          expect(actual, name).toBe(sut.isFragmentUsedInRoot(node)); // cache

          ++visitCount;
        },
      });

      expect(visitCount).toBe(testCases.size);
    });

    describe("fragment usage cycle", () => {
      it("throws error", () => {
        const document = gql`
          fragment Fragment1 on Type {
            ...Fragment2
          }

          fragment Fragment2 on Type {
            ...Fragment3
          }

          fragment Fragment3 on Type {
            ...Fragment1
          }
        `;

        const sut = new GraphQLHelper(document);

        let visitCount = 0;
        visit(document, {
          FragmentDefinition(node) {
            expect(
              () => sut.isFragmentUsedInRoot(node),
              node.name.value,
            ).toThrowError(/cycle/);
            ++visitCount;
          },
        });

        expect(visitCount).toBe(3);
      });
    });
  });

  describe("isInRoot", () => {
    it("returns the appropriate value", () => {
      const document = gql`
        query {
          field1
          ...Fragment1
          ... on Type {
            field2
            field3 {
              field4
            }
          }
          field5 {
            field6
            ...Fragment2
            ... on Type {
              field7
              field8 {
                field9
              }
            }
          }
        }

        fragment Fragment3 on Type {
          field10
          ...Fragment4
          ... on Type {
            field11
            field12 {
              field13
            }
          }
          field14 {
            field15
            ...Fragment5
            ... on Type {
              field16
              field17 {
                field18
              }
            }
          }
        }
      `;
      const sut = new GraphQLHelper(document);

      const testCases = new Map<
        string,
        { isRoot: false } | { isRoot: true; containerKind: Kind }
      >([
        ["field1", { isRoot: true, containerKind: Kind.OPERATION_DEFINITION }],
        [
          "Fragment1",
          { isRoot: true, containerKind: Kind.OPERATION_DEFINITION },
        ],
        ["field2", { isRoot: true, containerKind: Kind.OPERATION_DEFINITION }],
        ["field3", { isRoot: true, containerKind: Kind.OPERATION_DEFINITION }],
        ["field4", { isRoot: false }],
        ["field5", { isRoot: true, containerKind: Kind.OPERATION_DEFINITION }],
        ["field6", { isRoot: false }],
        ["Fragment2", { isRoot: false }],
        ["field7", { isRoot: false }],
        ["field8", { isRoot: false }],
        ["field9", { isRoot: false }],
        ["field10", { isRoot: true, containerKind: Kind.FRAGMENT_DEFINITION }],
        [
          "Fragment4",
          { isRoot: true, containerKind: Kind.FRAGMENT_DEFINITION },
        ],
        ["field11", { isRoot: true, containerKind: Kind.FRAGMENT_DEFINITION }],
        ["field12", { isRoot: true, containerKind: Kind.FRAGMENT_DEFINITION }],
        ["field13", { isRoot: false }],
        ["field14", { isRoot: true, containerKind: Kind.FRAGMENT_DEFINITION }],
        ["field15", { isRoot: false }],
        ["Fragment5", { isRoot: false }],
        ["field16", { isRoot: false }],
        ["field17", { isRoot: false }],
        ["field18", { isRoot: false }],
      ]);

      let visitCount = 0;
      const validate = (
        node: Parameters<typeof sut.isInRoot>[0],
        ancestors: Parameters<typeof sut.isInRoot>[1],
      ) => {
        const actual = sut.isInRoot(node, ancestors);

        const name = node.name.value;
        const expected = testCases.get(name);
        expect(actual.isRoot, name).toBe(expected?.isRoot);
        if (actual.isRoot && expected?.isRoot) {
          expect(actual.container.kind, name).toBe(expected.containerKind);
        }
        ++visitCount;
      };

      visit(document, {
        Field(node, key, parent, path, ancestors) {
          validate(node, ancestors);
        },
        FragmentSpread(node, key, parent, path, ancestors) {
          validate(node, ancestors);
        },
      });

      expect(visitCount).toBe(testCases.size);
    });
  });

  describe("resolveArgumentValue", () => {
    it("resolves the argument value", () => {
      const document = gql`
        query {
          field(
            arg1: null
            arg2: true
            arg3: 123
            arg4: 123.456
            arg5: "str"
            arg6: [1, 2, 3]
            arg7: { foo: "bar" }
            arg8: $var
            arg9: $missing
          )
        }
      `;
      const sut = new GraphQLHelper(document);

      const testCases = new Map<string, unknown>([
        ["arg1", null],
        ["arg2", true],
        ["arg3", 123],
        ["arg4", 123.456],
        ["arg5", "str"],
        ["arg6", [1, 2, 3]],
        ["arg7", { foo: "bar" }],
        ["arg8", "value"],
        ["arg9", null],
      ]);

      let visitCount = 0;
      visit(document, {
        Argument(node) {
          const actual = sut.resolveArgumentValue(node, { var: "value" });

          const name = node.name.value;
          expect(actual, name).toStrictEqual(testCases.get(name));
          ++visitCount;
        },
      });

      expect(visitCount).toBe(testCases.size);
    });
  });

  describe("validateField", () => {
    const document = gql`
      query {
        field1 {
          field2
          ...Fragment1
        }
        field3(preview: false)
        field4(preview: true)
        field5(preview: "string")
        field6(preview: $false)
        field7(preview: $true)
        field8(preview: $null)
        field9(preview: $missing)
        ... on Type {
          field10 {
            field11
          }
        }
        ...Fragment2
      }

      fragment Fragment1 on Type {
        field12
      }

      fragment Fragment2 on Type {
        ...Fragment3
      }

      fragment Fragment3 on Type {
        field13
      }

      fragment Fragment4 on Type {
        field14
      }
    `;
    const sut = new GraphQLHelper(document);
    const variables = { false: false, true: true, null: null };

    describe.each([false, undefined])("preview arg is %s", (preview) => {
      it("validates fields accordingly", () => {
        const testCases = new Map<string, { error?: RegExp }>([
          ["field1", {}],
          ["field2", {}],
          ["field3", {}],
          ["field4", { error: /mismatch/ }],
          ["field5", { error: /non-boolean/ }],
          ["field6", {}],
          ["field7", { error: /mismatch/ }],
          ["field8", {}],
          ["field9", {}],
          ["field10", {}],
          ["field11", {}],
          ["field12", {}],
          ["field13", {}],
          ["field14", {}],
        ]);

        let visitCount = 0;
        visit(document, {
          Field(node, key, parent, path, ancestors) {
            const name = node.name.value;
            const { error } = testCases.get(name) ?? {};
            expect(
              () =>
                sut.validateField(node, ancestors, { ...variables, preview }),
              name,
            )[error ? "to" : "not"].throw(error);

            ++visitCount;
          },
        });

        expect(visitCount).toBe(testCases.size);
      });
    });

    describe("preview is true", () => {
      it("validates field accordingly", () => {
        const testCases = new Map<string, { error?: RegExp }>([
          ["field1", { error: /Root field/ }],
          ["field2", {}],
          ["field3", { error: /mismatch/ }],
          ["field4", {}],
          ["field5", { error: /non-boolean/ }],
          ["field6", { error: /mismatch/ }],
          ["field7", {}],
          ["field8", { error: /mismatch/ }],
          ["field9", { error: /mismatch/ }],
          ["field10", { error: /Root field/ }],
          ["field11", {}],
          ["field12", {}],
          ["field13", { error: /Root field/ }],
          ["field14", {}],
        ]);

        let visitCount = 0;
        visit(document, {
          Field(node, key, parent, path, ancestors) {
            const name = node.name.value;
            const { error } = testCases.get(name) ?? {};
            expect(
              () =>
                sut.validateField(node, ancestors, {
                  ...variables,
                  preview: true,
                }),
              name,
            )[error ? "to" : "not"].throw(error);

            ++visitCount;
          },
        });

        expect(visitCount).toBe(testCases.size);
      });
    });
  });

  describe("validateOperation", () => {
    describe("query operation", () => {
      it("passes validation", () => {
        const document = gql`
          query {
            field
          }
        `;
        const sut = new GraphQLHelper(document);

        let visited = false;
        visit(document, {
          OperationDefinition(node) {
            sut.validateOperation(node);
            visited = true;
          },
        });

        expect(visited).toBe(true);
      });
    });

    describe("mutation operation", () => {
      it("fails validation", () => {
        const document = gql`
          mutation {
            operation
          }
        `;
        const sut = new GraphQLHelper(document);

        let visited = false;
        visit(document, {
          OperationDefinition(node) {
            expect(() => sut.validateOperation(node)).toThrowError(/query/);
            visited = true;
          },
        });

        expect(visited).toBe(true);
      });
    });
  });

  describe("validateVariableDefinition", () => {
    describe("preview parameter", () => {
      describe("Boolean type", () => {
        it("passes validation", () => {
          const document = gql`
            query ($preview: Boolean) {
              field
            }
          `;
          const sut = new GraphQLHelper(document);

          let visited = false;
          visit(document, {
            VariableDefinition(node) {
              sut.validateVariableDefinition(node);
              visited = true;
            },
          });

          expect(visited).toBe(true);
        });
      });

      describe("Boolean! type", () => {
        it("passes validation", () => {
          const document = gql`
            query ($preview: Boolean!) {
              field
            }
          `;
          const sut = new GraphQLHelper(document);

          let visited = false;
          visit(document, {
            VariableDefinition(node) {
              sut.validateVariableDefinition(node);
              visited = true;
            },
          });

          expect(visited).toBe(true);
        });
      });

      describe("other type", () => {
        it("fails validation", () => {
          const document = gql`
            query ($preview: String) {
              field
            }
          `;
          const sut = new GraphQLHelper(document);

          let visited = false;
          visit(document, {
            VariableDefinition(node) {
              expect(() => sut.validateVariableDefinition(node)).toThrowError(
                /Boolean/,
              );
              visited = true;
            },
          });

          expect(visited).toBe(true);
        });
      });
    });

    describe("other parameter", () => {
      it("passes validation", () => {
        const document = gql`
          query ($param: String) {
            field
          }
        `;
        const sut = new GraphQLHelper(document);

        let visited = false;
        visit(document, {
          VariableDefinition(node) {
            sut.validateVariableDefinition(node);
            visited = true;
          },
        });

        expect(visited).toBe(true);
      });
    });
  });
});
