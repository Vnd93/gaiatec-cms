import assert from "node:assert/strict";
import test from "node:test";

import { exactCorporateOperatorEmail } from "./production-operator-identity-lib.mjs";

test("production operator and authenticated canary must be the same corporate identity", () => {
  assert.equal(
    exactCorporateOperatorEmail(
      " Operador@GaiatecSistemas.com.br ",
      "operador@gaiatecsistemas.com.br",
      "gaiatecsistemas.com.br",
    ),
    "operador@gaiatecsistemas.com.br",
  );
  assert.throws(
    () =>
      exactCorporateOperatorEmail(
        "operador@gaiatecsistemas.com.br",
        "outro@gaiatecsistemas.com.br",
        "gaiatecsistemas.com.br",
      ),
    /CMS_PRODUCTION_OPERATOR_IDENTITY_SECRET_INVALID/,
  );
  assert.throws(
    () => exactCorporateOperatorEmail("pessoa@example.com", "pessoa@example.com", "example.com.br"),
    /CMS_PRODUCTION_OPERATOR_IDENTITY_SECRET_INVALID/,
  );
});

test("production operator email validation fails closed on empty, malformed or deceptive domains", () => {
  for (const values of [
    ["", "", "gaiatecsistemas.com.br"],
    ["sem-arroba", "sem-arroba", "gaiatecsistemas.com.br"],
    ["pessoa@evil-gaiatecsistemas.com.br", "pessoa@evil-gaiatecsistemas.com.br", "gaiatecsistemas.com.br"],
    ["pessoa@gaiatecsistemas.com.br", "pessoa@gaiatecsistemas.com.br", "@gaiatecsistemas.com.br"],
  ]) {
    assert.throws(
      () => exactCorporateOperatorEmail(...values),
      /CMS_PRODUCTION_OPERATOR_IDENTITY_SECRET_INVALID/,
    );
  }
});
