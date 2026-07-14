# No explicit Room entity — key space defined by passphrase alone

There is no Room model, Room ID, or Room table. Grouping is implicit: participants who derive the same Room Key from their passphrase share a key space and can read each other's messages.

We considered an explicit Room (with a name, invite code, and server-side membership list) but rejected it because it would require the server to know which participants belong together — which leaks social graph information. Keeping rooms implicit means the server only sees Participants and Payloads, with no link between them beyond the user_id on each Payload.

## Consequences

The server cannot tell which participants share a passphrase. All participants share a single broadcast channel — there is no concept of joining different rooms within the same server instance.
