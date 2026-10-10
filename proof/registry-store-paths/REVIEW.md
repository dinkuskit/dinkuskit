# Registry path repair review

Source intent and standards review covers sha256:469e2539b58eb10c8de304957ec5c279a46b74f5bdfb402626409508bdfee397, with scope/algorithm in PROOF.md.

Accepted required fix from FINDING.md is resolved: Payments routes now match the pinned publisher-derived Registry runtime identity. Former slug and another publisher's ID are denied. Service identity, audience/scope, grant checks, origin binding, proof comparison, timeout/size/redirect restrictions and production unavailable gate are unchanged.

Independent verification: regression failure before repair, full83-test verification after repair, upstream installer persisted identity, actual installed callback/proof and browser consent/status evidence inspected. All UI availability claims remain narrow. Inventory's missing publisher assignment is a disclosed delivery limitation, not silently supplied from another product.

No unresolved source defect identified. Exact final-commit CI/OpenClaw/native reviews remain separate delivery evidence and do not authorize merge or deployment.
