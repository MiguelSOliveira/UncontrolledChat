# UncontrolledChat

A real-time encrypted group chat where all participants sharing the same passphrase can read each other's messages. The server stores and relays only opaque ciphertext — it never has access to plaintext.

## Language

**Participant**:
A person present in a chat session, identified by a self-chosen display name. A Participant has no persistent account — the identity is ephemeral and lasts only for the duration of the session.
_Avoid_: User, member, account, client

**Bot**:
An automated broadcaster that injects Payloads directly into the server's broadcast channel without joining as a Participant. A Bot belongs to exactly one Key Space (it encrypts with a fixed Passphrase) and has no session lifecycle — it does not trigger JOIN or LEAVE events.
_Avoid_: Agent, user, participant, service

**Username**:
The display name a Participant or Bot uses to identify itself. Not unique and not authenticated — two different people can pick the same username, and a Bot's username is fixed at deployment time.
_Avoid_: Handle, nickname, identity

**Message**:
The plaintext content a Participant writes and intends to send. A Message exists only on the client; it is never transmitted or stored in plaintext.
_Avoid_: Chat, post, text

**Command**:
A typed instruction prefixed with `/` that triggers a client or server action instead of producing a Message. Commands are never transmitted as Payloads and never stored. Examples: `/news`, `/crypto`, `/clear`, `/?`.
_Avoid_: Message, chat command, slash command

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
The set of all Messages readable by holders of a given Passphrase. There is no explicit Room entity — the Key Space is the only meaningful grouping of Participants, Bots, and Messages.
_Avoid_: Room, channel, group, chat room

**History Clear**:
The act of deleting all persisted Payloads from the server and broadcasting a wipe event so every connected client empties its local message view. A History Clear affects the entire Key Space, not just the client that triggered it.
_Avoid_: Clear chat, delete messages, reset
