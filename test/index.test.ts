import { DocumentNode, parse } from "graphql";
import { describe, expect, it } from "vitest";

import { validateDocument } from "../src/index";

function gql(value: string | readonly string[]): DocumentNode {
  return parse(typeof value === "string" ? value : value.join(""));
}

describe("validateDocument", () => {
  describe("DocumentNode document", () => {
    it("validates the document", () => {
      const document = gql`
        query ($preview: Boolean) {
          field(preview: $preview)
        }
      `;

      validateDocument({
        document,
        variables: { preview: false },
      });
    });
  });

  describe("string document", () => {
    it("validates the document", () => {
      const document = `
        query ($preview: Boolean) {
          field(preview: $preview)
        }
      `;

      validateDocument({
        document,
        variables: { preview: false },
      });
    });
  });

  describe("no operation", () => {
    it("throws error", () => {
      const document = gql`
        type MyType {
          field: String
        }
      `;

      expect(() =>
        validateDocument({
          document,
          variables: { preview: false },
        }),
      ).toThrow(/operation/);
    });
  });
});
