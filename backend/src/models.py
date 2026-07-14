"""Data models for UncontrolledChat."""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Participant:
    """A person present in a chat session, identified by a self-chosen username."""

    username: str
    id: str = field(default_factory=lambda: __import__("uuid").uuid4().hex)
    joined_at: datetime = field(default_factory=datetime.now)


@dataclass
class Message:
    """Represents a chat message."""

    content: str
    user_id: str
    username: str
    id: str = field(default_factory=lambda: __import__("uuid").uuid4().hex)
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        """Convert message to dictionary."""
        return {
            "id": self.id,
            "content": self.content,
            "user_id": self.user_id,
            "username": self.username,
            "created_at": self.created_at.isoformat(),
        }
