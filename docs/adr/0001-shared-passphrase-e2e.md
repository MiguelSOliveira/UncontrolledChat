# Shared-passphrase E2E encryption instead of per-user keypairs

All participants who share the same passphrase derive the same AES-GCM key via PBKDF2. This means any participant can decrypt any message in the key space — including messages sent before they joined.

We considered per-user asymmetric keypairs (each sender encrypts for each recipient's public key), which would give forward secrecy and prevent late-joiners from reading history. We rejected it because: the app is a broadcast group chat (not 1-to-1), managing per-user key exchange adds significant complexity (key discovery, key rotation, rekeying on join/leave), and the threat model does not require hiding messages from other room participants — only from the server and outside observers.

## Consequences

Late-joiners with the correct passphrase can decrypt all historical messages. This is intentional — message history is a feature, not a leak.
