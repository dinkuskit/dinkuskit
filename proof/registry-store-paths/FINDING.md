# Registry route identity finding

Accepted required fix against website source c0e871e3b2b63a511c78669cb78b29bd810c51f3 (merged in f664a60b4fc4b8c35d7228dbb37c01c44292e768): Payments callback/proof registration uses the package slug rather than the installed Registry identity.

EmDash 1.2.0 src/registry/plugin-id.ts makeRegistryPluginId derives a stable opaque ID from the publisher DID and slug. src/api/handlers/registry.ts registry installer uses that ID as its runtime identifier. Payments public manifest pins publisher did:plc:ekk4pjmkh3k3ql2kfoex3qt4, slug dinkus-payments, ID r_3brsc2on3bu673rn. Thus the existing slug registration rejects the real installed callback and fetches the wrong proof path.

Repair the server-owned fixed registration and paired fixtures/docs. Do not accept arbitrary caller paths, runtime IDs, regex-only identities or proof URLs. Preserve service isolation and origin/fetch restrictions. Validate publisher-derived identity against pinned upstream mechanics, reject former slug and another publisher's derived ID, and require paired actual Registry installer evidence before claiming installed integration. Existing synthetic slug proof is insufficient.
