# DinkusKit.com Worker trace: Finish setup, Disconnect during Finish setup, stale key cancel

Built Worker from this branch, local D1 and KV, run 2026-11-22. Keys, passes, PKCE values and secrets are redacted; ids are relabelled.

## 1. Allowed Finish setup
  - POST /api/store-connections {"protocol_version":2,"client_id":"dinkus-commerce-emdash","service":"commerce","site_origin":"https://acme-goods.example","callback_uri":"https://acme-goods.example/_emdash/admin/plugins/r_gshdrqaldna3r7sn/settings","code_challenge":"[redacted]","code_challenge_method":"S256"} → 200 {"protocol_version":2,"site_id":"id-1","connection_id":"id-2","challenge":"[redacted]","verification_uri":"https://dinkuskit.com/account/connect?connection_id=id-2","expires_in":600,"expires_at":1795366928510,"interval":5}
  - (store receipt for id-2 placed in the proof-receipt store)
  - POST /account/connect?connection_id=id-2 → 303 (location https://acme-goods.example/_emdash/admin/plugins/r_gshdrqaldna3r7sn/settings)
  - POST /api/store-connections/token {"client_id":"dinkus-commerce-emdash","connection_id":"id-2","code_verifier":"[redacted]"} → 200 {"store_key":"dk_store_[redacted]","site_id":"id-1"}
  - POST /api/store-connections {"protocol_version":2,"client_id":"dinkus-payments-emdash","service":"payments","site_origin":"https://acme-goods.example","callback_uri":"https://acme-goods.example/_emdash/admin/plugins/r_3brsc2on3bu673rn/status","code_challenge":"[redacted]","code_challenge_method":"S256"} → 200 {"protocol_version":2,"site_id":"id-1","connection_id":"id-3","challenge":"[redacted]","verification_uri":"https://dinkuskit.com/account/connect?connection_id=id-3","expires_in":600,"expires_at":1795366928657,"interval":5}
  - (store receipt for id-3 placed in the proof-receipt store)
  - POST /api/store-connections/finish {"client_id":"dinkus-payments-emdash","connection_id":"id-3","code_verifier":"[redacted]"} → 200 {"access_token":"[pass redacted]","token_type":"Bearer","expires_in":300,"site_id":"id-1","store_key":"dk_store_[redacted]"}
  - POST /api/store-passes {"site_id":"id-1","scope":"payments:checkout","audience":"dinkus-payments"} → 200 {"access_token":"[pass redacted]","token_type":"Bearer","expires_in":300}
  - D1 after Finish setup:
    - plugin keys: commerce 1, payments 1
    - service grants: payments on
    - connections: commerce redeemed ×1, payments redeemed ×1
    - Disconnect recorded: none

## 2. The owner presses Disconnect while Finish setup is reading the store receipt
  - POST /api/store-connections {"protocol_version":2,"client_id":"dinkus-payments-emdash","service":"payments","site_origin":"https://acme-goods.example","callback_uri":"https://acme-goods.example/_emdash/admin/plugins/r_3brsc2on3bu673rn/status","code_challenge":"[redacted]","code_challenge_method":"S256"} → 200 {"protocol_version":2,"site_id":"id-1","connection_id":"id-4","challenge":"[redacted]","verification_uri":"https://dinkuskit.com/account/connect?connection_id=id-4","expires_in":600,"expires_at":1795366928768,"interval":5}
  - (store receipt for id-4 placed in the proof-receipt store, answered after 5000 ms)
  - (300 ms into the Finish setup below, the owner presses Disconnect Payments)
  - POST /account/sites → 303 (location /account/sites)
  - (the Disconnect finished while the Finish setup was still waiting on the receipt)
  - POST /api/store-connections/finish {"client_id":"dinkus-payments-emdash","connection_id":"id-4","code_verifier":"[redacted]"} (sent before the Disconnect) → 409 {"error":"approval_failed"}
  - POST /api/store-passes {"site_id":"id-1","scope":"payments:checkout","audience":"dinkus-payments"} → 401 {"error":"invalid_store_key"}
  - D1 after the Disconnect and the refused Finish setup:
    - plugin keys: commerce 1
    - service grants: payments on
    - connections: commerce redeemed ×1, payments denied ×1, payments redeemed ×1
    - Disconnect recorded: payments

## 3. An uninstall cancel with a key the owner already disconnected
  - POST /api/store-connections {"protocol_version":2,"client_id":"dinkus-payments-emdash","service":"payments","site_origin":"https://acme-goods.example","callback_uri":"https://acme-goods.example/_emdash/admin/plugins/r_3brsc2on3bu673rn/status","code_challenge":"[redacted]","code_challenge_method":"S256"} → 200 {"protocol_version":2,"site_id":"id-1","connection_id":"id-5","challenge":"[redacted]","verification_uri":"https://dinkuskit.com/account/connect?connection_id=id-5","expires_in":600,"expires_at":1795366933844,"interval":5}
  - (store receipt for id-5 placed in the proof-receipt store)
  - POST /account/connect?connection_id=id-5 → 303 (location https://acme-goods.example/_emdash/admin/plugins/r_3brsc2on3bu673rn/status)
  - D1 after the owner approved a new Payments Connect (not picked up yet):
    - plugin keys: commerce 1
    - service grants: payments on
    - connections: commerce redeemed ×1, payments approved ×1, payments denied ×1, payments redeemed ×1
    - Disconnect recorded: none
  - (the uninstall below presents the Payments key from step 1, which the Disconnect in step 2 removed)
  - POST /api/store-keys/cancel {"site_id":"id-1"} → 401 {"error":"invalid_store_key"}
  - D1 after the stale cancel:
    - plugin keys: commerce 1
    - service grants: payments on
    - connections: commerce redeemed ×1, payments approved ×1, payments denied ×1, payments redeemed ×1
    - Disconnect recorded: none
  - POST /api/store-connections/token {"client_id":"dinkus-payments-emdash","connection_id":"id-5","code_verifier":"[redacted]"} → 200 {"access_token":"[pass redacted]","token_type":"Bearer","expires_in":300,"site_id":"id-1","store_key":"dk_store_[redacted]"}
  - POST /api/store-passes {"site_id":"id-1","scope":"payments:checkout","audience":"dinkus-payments"} → 200 {"access_token":"[pass redacted]","token_type":"Bearer","expires_in":300}
  - POST /api/store-keys/cancel {"site_id":"id-1"} → 200 {"cancelled":true}
  - POST /api/store-passes {"site_id":"id-1","scope":"commerce:settings","audience":"dinkuskit"} → 200 {"access_token":"[pass redacted]","token_type":"Bearer","expires_in":300}
  - D1 after the current key cancelled itself:
    - plugin keys: commerce 1
    - service grants: payments on
    - connections: commerce redeemed ×1, payments denied ×1, payments redeemed ×2
    - Disconnect recorded: none

All assertions passed.
