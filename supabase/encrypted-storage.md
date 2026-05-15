# Encrypted Storage

> Encrypt sensitive text in your app before it reaches Supabase — the database stores opaque bytes and never sees plaintext. Decrypt in the client after fetching.

---

## Why This Approach

Supabase's row-level security controls *who* can read a row, but a user with database access (service role, direct Postgres connection, a stolen backup) still sees the plaintext. Encrypting client-side means the ciphertext is all that ever leaves your app — even Supabase staff cannot read the data.

The tradeoff: you cannot query, filter, or sort on encrypted columns.

---

## Schema

```sql
CREATE TABLE private_notes (
  id      uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid  REFERENCES auth.users NOT NULL,
  payload text  NOT NULL   -- base64-encoded ciphertext
);
```

`text` works fine here — we'll base64-encode the ciphertext before storing so it survives the round-trip as a plain string.

---

## Python — Fernet (AES-128-CBC + HMAC-SHA256)

```bash
pip install cryptography supabase
```

```python
import os
from cryptography.fernet import Fernet
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
f = Fernet(os.environ["ENCRYPTION_KEY"])  # generate once: Fernet.generate_key().decode()

# --- encrypt and store ---
ciphertext = f.encrypt(b"my sensitive text").decode()  # base64 string
supabase.table("private_notes").insert({"user_id": uid, "payload": ciphertext}).execute()

# --- fetch and decrypt ---
row = supabase.table("private_notes").select("payload").eq("id", note_id).single().execute()
plaintext = f.decrypt(row.data["payload"].encode()).decode()
```

Generate your key once and store it somewhere safe — never in the database:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## JavaScript / TypeScript — AES-256-GCM (Web Crypto API)

Works in the browser and in Deno/Node (v19+) via the standard `crypto.subtle` API — no extra dependencies.

```ts
// --- key helpers (run once, store the exported key as a secret) ---
async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
}

async function importKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

// --- encrypt → base64 string ---
async function encrypt(key: CryptoKey, text: string): Promise<string> {
  const iv  = crypto.getRandomValues(new Uint8Array(12))  // fresh IV every call
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  // prefix IV to ciphertext so a single string holds everything needed to decrypt
  const combined = new Uint8Array(iv.byteLength + enc.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(enc), iv.byteLength)
  return btoa(String.fromCharCode(...combined))
}

// --- decrypt → plaintext string ---
async function decrypt(key: CryptoKey, b64: string): Promise<string> {
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const iv  = combined.slice(0, 12)
  const enc = combined.slice(12)
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc)
  return new TextDecoder().decode(dec)
}
```

```ts
// --- usage ---
const key = await importKey(process.env.ENCRYPTION_KEY!)

// store
const payload = await encrypt(key, 'my sensitive text')
await supabase.from('private_notes').insert({ user_id: uid, payload })

// fetch
const { data } = await supabase.from('private_notes').select('payload').eq('id', noteId).single()
const plaintext = await decrypt(key, data.payload)
```

---

## Gotchas

> ⚠️ **Losing the key means losing the data.** There is no recovery. Back up the key with at least the same care as the data — ideally keep it in a secrets manager (Doppler, Infisical, AWS Secrets Manager) rather than only in an env file.

> ⚠️ **Never reuse the IV.** The JS example calls `crypto.getRandomValues` on every encrypt call — this is correct. Do not cache or derive the IV from the plaintext.

> ⚠️ **You cannot query encrypted fields.** If you need to search by a field, leave it in plaintext and encrypt only the sensitive sub-fields.

> ⚠️ **Key rotation requires re-encrypting every row.** Decrypt each row with the old key, re-encrypt with the new key, write back. Only retire the old key once all rows are confirmed migrated.
