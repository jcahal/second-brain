# Encrypted Storage

> Three encryption strategies for Supabase data, ordered from least to most isolation: server-side SQL functions, Vault secret storage, and client-side encryption. See [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) and [pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html).

---

## Why Encrypt at the Database Layer?

Supabase encrypts data at rest on disk by default — but that only protects against physical theft of storage media. It does not protect against a compromised database connection, a stolen logical backup, or a superuser with direct access to the database process.

Column-level and client-side encryption protect the *bytes themselves*, regardless of how the database is accessed. The three approaches below differ in one critical dimension: **who holds the key**, and therefore who is capable of decrypting the data.

---

## Approach A — pgcrypto (Server-Side Symmetric AES)

`pgcrypto` is a PostgreSQL extension that runs symmetric encryption directly in the database process. The key is passed as a string in the SQL call, which means encryption requires no application code change and no external service. The tradeoff is that the key travels over the database connection and lives in the database session while the query runs.

### Enable the extension

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- run once per database; requires superuser or service role
```

### Encrypt on insert

```sql
INSERT INTO private_data (payload)
VALUES (pgp_sym_encrypt('sensitive text', 'your-passphrase'));
-- column type should be text or bytea
-- load the passphrase from an env var in your app — never hardcode it
```

### Decrypt on read

```sql
SELECT pgp_sym_decrypt(payload::bytea, 'your-passphrase')
FROM private_data
WHERE id = $1;
-- cast to bytea required — pgcrypto stores binary data
```

### Gotchas

> ⚠️ The passphrase appears as a string literal in `pg_stat_activity` while the query is running. If `log_min_duration_statement` is set to `0` in development, it will also appear in query logs. Set it to `-1` in dev to avoid logging all queries.

> ⚠️ `pgp_sym_encrypt` uses a random IV on every call, so the same plaintext produces different ciphertext each time. You cannot use an encrypted column in a `WHERE` clause, join, or index — the bytes are incomparable across rows.

> ⚠️ The key lives in the PostgreSQL session, not a hardware security module. A superuser can observe it in `pg_stat_activity` during query execution. This approach is suitable for protecting data from application-layer breaches, not from DBA-level access.

---

## Approach B — Supabase Vault (pgsodium-backed)

Vault uses pgsodium, which wraps libsodium's `crypto_secretbox`. The master encryption key is stored in a server-side key file managed by Supabase infrastructure — it is never present in your SQL calls or query logs. When you call `vault.create_secret()`, pgsodium derives an encryption key from the master key transparently. You never handle or see the key.

This is meaningfully different from pgcrypto: the key is not in your SQL, not in your app code, and not in any log. The tradeoff is that the key is still on Supabase infrastructure, so the isolation boundary is Supabase's infrastructure security, not your own.

### Create a secret

```sql
SELECT vault.create_secret('my-api-key-value', 'my-api-key-name');
-- returns a UUID — save it if you want to update the secret later
-- 'name' is optional but enables lookup by name instead of UUID
```

### Read a secret

```sql
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'my-api-key-name';
-- decryption happens inside the pgsodium extension
-- plaintext is returned only to your session
```

### Update a secret

```sql
SELECT vault.update_secret('the-uuid-from-create', 'new-api-key-value');
-- pass the UUID returned by create_secret, not the name
```

### Gotchas

> ⚠️ `vault.decrypted_secrets` is a view, not a table. Every `SELECT` decrypts live — there is no cached plaintext row. This is by design, but it means repeated reads have decryption overhead.

> ⚠️ Vault is designed for small secrets: API keys, tokens, connection strings. Do not use it for bulk row-level encryption of large payloads — use pgcrypto or client-side encryption for that.

> ⚠️ On Supabase Cloud, the pgsodium master key is managed for you. On **self-hosted** Supabase, you must generate and configure this key yourself — it is not created automatically. See the [pgsodium key management docs](https://github.com/michelp/pgsodium#server-key-management).

> ⚠️ The `anon` key cannot call Vault functions directly — they require the `service_role` key or an explicit `GRANT EXECUTE` on the function to a specific role.

---

## Approach C — Client-Side Encryption (Application Layer)

In this approach the plaintext never leaves your application process. Supabase receives only opaque bytes. Even if the database is fully compromised — backups exfiltrated, superuser credentials exposed, Supabase infrastructure accessed — the data is unreadable without the key that never touched the database.

This is the only approach where database administrators cannot read the data. The tradeoff is that your application owns key management entirely.

### Python — Fernet (AES-128-CBC + HMAC-SHA256)

```python
from cryptography.fernet import Fernet
import os

KEY = os.environ["ENCRYPTION_KEY"]  # generate once: Fernet.generate_key().decode()
f = Fernet(KEY)

ciphertext = f.encrypt(b"sensitive value")  # authenticated encryption — tamper-evident
# store ciphertext (bytes) in a bytea column in Supabase

plaintext = f.decrypt(ciphertext)           # raises InvalidToken if tampered
```

Fernet tokens include a timestamp. Passing `ttl=3600` to `f.decrypt()` will reject tokens older than one hour — useful for expiring short-lived tokens.

### Node.js — AES-256-GCM (built-in `node:crypto`)

```js
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')  // 32 bytes
const iv  = randomBytes(12)   // 96-bit IV — generate a fresh IV for every encryption call

const cipher    = createCipheriv('aes-256-gcm', KEY, iv)
const encrypted = Buffer.concat([cipher.update('sensitive value', 'utf8'), cipher.final()])
const tag       = cipher.getAuthTag()  // 16-byte authentication tag — must travel with ciphertext

// Store as a single bytea column: iv (12) || tag (16) || ciphertext
const stored = Buffer.concat([iv, tag, encrypted])
```

To decrypt, slice the stored buffer back into its components and reverse the process with `createDecipheriv` + `decipher.setAuthTag(tag)`.

### Target table schema

```sql
CREATE TABLE private_records (
  id      uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  payload bytea NOT NULL    -- encrypted bytes from your app
);
-- bytea is the correct type for arbitrary binary — do not use text for ciphertext
```

### Gotchas

> ⚠️ The Supabase JavaScript client returns `bytea` columns as a hex string prefixed with `\x` (e.g. `\xdeadbeef`). Strip the prefix and decode from hex before passing to your decryption function.

> ⚠️ You cannot search, filter, or sort on an encrypted column — the bytes are opaque. If you need to query by a field, encrypt only the sensitive sub-fields and leave queryable fields in plaintext.

> ⚠️ For the Node.js AES-GCM example: never reuse an IV with the same key. GCM becomes cryptographically broken under IV reuse — an attacker can recover the key. Always call `randomBytes(12)` per encryption call.

> ⚠️ If you split IV, tag, and ciphertext into separate columns, you risk writing a row with mismatched components. Storing all three concatenated in a single `bytea` column eliminates this class of bug.

---

## Key Management

Your encryption is only as strong as your key management. The table below covers the common options:

| Location | Best for | Caution |
|---|---|---|
| Environment variable | Simple single-server deployments | Visible in `/proc`, leaks to child processes, no audit log |
| Supabase Vault | Keys used by Edge Functions or SQL | Key still resides on Supabase infrastructure |
| AWS KMS / GCP Cloud KMS | Production workloads, compliance requirements | Added latency per decrypt call; per-API-call cost |
| HashiCorp Vault / Infisical | Self-hosted or multi-cloud key management | Significant operational overhead |

### Gotchas

> ⚠️ **Losing the encryption key means losing the data permanently.** There is no recovery path. Treat key backups with at least the same security posture as the data they protect — ideally stricter.

> ⚠️ **Key rotation requires re-encrypting every row.** There is no in-place rotation. The safe procedure: read each row decrypted with the old key, re-encrypt with the new key, write back. Do this in a transaction or with a dual-read window to avoid a state where some rows use the old key and some the new. Only retire the old key once all rows have been confirmed migrated.
