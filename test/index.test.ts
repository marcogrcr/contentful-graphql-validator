import { describe, expect, it } from "vitest";

import { helloWorld } from "../src/index";

describe("index", () => {
  describe("helloWorld", () => {
    it("returns Hello World!", () => {
      const actual = helloWorld();
      expect(actual).toBe("Hello World!");
    });
  });
});
