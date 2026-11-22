# EmDash 1.4.0 -> 1.5.0 upgrade with existing data

`npm run test:emdash-upgrade` now runs the upgrade twice: from the 1.0.1 baseline as before, and from
`--from=1.4.0`, the last `main` before this PR (`399c352224feb6577cc587e5bcb4a194f7cabc47`), which is what dinkuskit.com runs today.
Run locally on 22 Nov 2026, Node 24.22.0, loopback Wrangler with local D1 and R2 only.

1. The pinned 1.4.0 source and lock are built and started on a fresh local D1, with its merchant schema (0001-0015).
2. Setup, a passkey sign-in, a published home edit, a media reference, a setting, a plugin state row and
   merchant account, organization, membership, selection, grant and binding rows are written on 1.4.0.
3. That worker stops. The 1.5.0 build starts on the same D1 and R2 files, then restarts once more.

## Results

- Last migration on 1.4.0: `091_redirect_artifacts` (90 applied).
- Applied by 1.5.0: `092_plugin_kv_options`, `093_menu_item_orphans`, `094_media_usage_file_url_reindex`, `095_plugin_storage_unique_scope`, `096_revision_kind_and_editors`, `097_room_storage`.
- Stored data after the upgrade equals the data before it, row for row: **true**.
- After the second restart the migration list and stored data are unchanged, the edited home page still
  renders, and the original sign-in session still reads the CMS.

Preserved rows (synthetic fixture data):

```json
{
  "seed_complete": "true",
  "media": {
    "id": "cms-upgrade-media",
    "storage_key": "cms-upgrade-media/proof.png",
    "content_hash": "synthetic-content-hash",
    "status": "ready"
  },
  "setting": {
    "value": "{\"media_id\":\"cms-upgrade-media\",\"value\":\"preserved-setting\"}"
  },
  "plugin": {
    "plugin_id": "dinkuskit-upgrade-fixture",
    "version": "1.4.0-fixture",
    "status": "active",
    "data": "{\"media_id\":\"cms-upgrade-media\",\"value\":\"preserved-plugin-state\"}"
  },
  "accounts": [
    {
      "user_id": "upgrade-owner",
      "subject": "upgrade-person",
      "disabled": 0
    }
  ],
  "organizations": [
    {
      "organization_id": "upgrade-org",
      "owner_user_id": "upgrade-owner",
      "authority_subject": "upgrade-authority",
      "status": "active"
    }
  ],
  "memberships": [
    {
      "organization_id": "upgrade-org",
      "user_id": "upgrade-owner",
      "role": "owner",
      "status": "active",
      "permissions": "[\"membership:manage\",\"inventory:admin\"]"
    }
  ],
  "selections": [
    {
      "user_id": "upgrade-owner",
      "organization_id": "upgrade-org"
    }
  ],
  "grants": [
    {
      "account_subject": "upgrade-authority",
      "site_id": "upgrade-site",
      "attested": 1,
      "granted_at": 1
    }
  ],
  "bindings": [
    {
      "site_id": "upgrade-site",
      "account_subject": "upgrade-authority",
      "site_origin": "https://upgrade-site.example.test",
      "service": "inventory",
      "revoked": 0
    }
  ]
}
```

## Fixture output

```text
PASS Production worker uses Cloudflare + deny-all namespace guard; Access candidate and loopback CMS-operation fixture stay on separate configs
PASS Fresh Cloudflare adapter build uses official D1 DB + R2 MEDIA bindings and no production resource IDs
PASS Pinned public 1.4.0 source and lock built the baseline worker; its merchant schema initialized only in owned local D1
PASS Wrangler/workerd local emulation started on loopback with official local D1/R2 bindings
PASS Initialized fixture worker answered official setup/status through D1-backed runtime
PASS Anonymous authenticated content mutation is denied
PASS Spoofed Host/session gates do not authenticate a content mutation
PASS Official setup API applied seed structure/content on the D1-backed worker
PASS Native setup accepted a synthetic software passkey registration
PASS Native passkey login established an operator session from the same software authenticator
PASS Authenticated official content API edit is visible on an anonymous public home read after publish
PASS Actual 1.4.0 runtime created content/media references, settings, plugin records and completed seed; 092-097 are pending
PASS Owned worker-1 stopped; persist-to contains actual D1 files, not only KV session blobs
PASS Owned worker restarted against the same persist-to D1/R2 directory
PASS Anonymous public read after restart still shows the authenticated D1-backed edit
PASS Actual 1.4.0 -> 1.5 upgrade applied only 092-097, preserving CMS state, media reference, original session and merchant authority rows without reseeding
PASS Spoofed Host/session gates still deny a content mutation after restart
PASS Initialized CMS setup is blocked after the first admin exists
PASS Anonymous content mutation remains denied after restart
PASS Upgraded 1.5 runtime restarted again with unchanged CMS/merchant state and migration ledger
```
