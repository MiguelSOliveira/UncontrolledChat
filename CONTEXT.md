# UncontrolledChat

A real-time encrypted group chat where all participants sharing the same passphrase can read each other's messages. The server stores and relays only opaque ciphertext — it never has access to plaintext.

## Language

**Participant**:
A person present in a chat session, identified by a self-chosen display name. A Participant has no persistent account — the identity is ephemeral and lasts only for the duration of the session.
_Avoid_: User, member, account, client

**Username**:
The display name a Participant picks at join time. Not unique and not authenticated — two different people can pick the same username.
_Avoid_: Handle, nickname, identity

**Message**:
The plaintext content a Participant writes and intends to send. A Message exists only on the client; it is never transmitted or stored in plaintext.
_Avoid_: Chat, post, text

**Payload**:
The encrypted blob the server stores and broadcasts. A Payload is derived from a Message by the sender's client using the Room Key, and is the only form of content the server ever sees.
_Avoid_: Ciphertext, encrypted message, content

**Passphrase**:
A secret string a Participant supplies at join time. The Passphrase defines which messages a Participant can read — all Participants sharing the same Passphrase share the same key space.
_Avoid_: Password, secret, room code

**Room Key**:
The AES-GCM symmetric key derived from a Passphrase via PBKDF2. Two clients with the same Passphrase always produce the same Room Key. The Room Key never leaves the client.
_Avoid_: Encryption key, crypto key, secret key

**Key Space**:
The set of all Messages readable by holders of a given Passphrase. There is no explicit Room entity — the Key Space is the only meaningful grouping of Participants and Messages.
_Avoid_: Room, channel, group, chat room
