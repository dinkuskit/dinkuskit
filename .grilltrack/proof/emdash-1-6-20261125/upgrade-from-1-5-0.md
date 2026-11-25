# EmDash 1.5.0 -> 1.6.0 upgrade with existing data

`npm run test:emdash-upgrade` runs the upgrade twice: from the 1.0.1 baseline as before, and from
`--from=1.5.0`, the last `main` before this PR (`46d1526f54e63b11595933ee09247736f0e828a6`), in place of the 1.4.0 baseline.
The live site runs 1.5.0. Run locally on 25 Nov 2026, Node 24.22.0, loopback Wrangler with local D1 and R2 only.

1. The pinned 1.5.0 source and lock are built and started on a fresh local D1, with its merchant schema.
2. Setup, a passkey sign-in, a published home edit, a media reference, a setting, a plugin state row and
   merchant account, organization, membership, selection, grant and binding rows are written on 1.5.0.
3. That worker stops. The 1.6.0 build starts on the same D1 and R2 files, then restarts once more.

## Results

- Last migration on 1.5.0: `097_room_storage` (96 applied).
- Applied by 1.6.0: `098_user_last_login` (adds the `users.last_login_at` column).
- Stored data after the upgrade equals the data before it, row for row: **true**.
- After the second restart the migration list and stored data are unchanged, the edited home page still
  renders, and the original sign-in session still reads the CMS.

From 1.0.1 the same run applied exactly `090` to `098` with the same preservation.

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
    "version": "1.5.0-fixture",
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
