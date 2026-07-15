"""SQLAlchemy async database setup and ORM models."""

from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, String, Text, UniqueConstraint, delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DB_PATH = Path(__file__).parent.parent / "chat.db"
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class ParticipantRow(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class MessageRow(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[str] = mapped_column(String(40), nullable=False)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "content": self.content,
            "user_id": self.user_id,
            "username": self.username,
            "created_at": self.created_at.isoformat(),
        }


class PersonaRow(Base):
    """Encrypted persona definition scoped to one Key Space."""

    __tablename__ = "personas"
    __table_args__ = (
        UniqueConstraint("key_space_id", "name_token", name="uq_persona_key_space_name"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    key_space_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name_token: Mapped[str] = mapped_column(String(64), nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    def to_dict(self) -> dict[str, str]:
        """Convert the encrypted persona row to a wire payload."""
        return {
            "id": self.id,
            "ciphertext": self.ciphertext,
            "created_at": self.created_at.isoformat(),
        }


async def init_db() -> None:
    """Create tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncSession:
    """Return a new async session."""
    return AsyncSessionLocal()


async def save_participant(session: AsyncSession, participant_id: str, username: str, joined_at: datetime) -> None:
    row = ParticipantRow(id=participant_id, username=username, joined_at=joined_at)
    session.add(row)
    await session.commit()


async def get_participant(session: AsyncSession, participant_id: str) -> ParticipantRow | None:
    result = await session.execute(select(ParticipantRow).where(ParticipantRow.id == participant_id))
    return result.scalar_one_or_none()


async def save_message(
    session: AsyncSession,
    msg_id: str,
    content: str,
    user_id: str,
    username: str,
    created_at: datetime,
) -> None:
    row = MessageRow(
        id=msg_id,
        content=content,
        user_id=user_id,
        username=username,
        created_at=created_at,
    )
    session.add(row)
    await session.commit()


async def clear_messages(session: AsyncSession) -> None:
    """Delete all messages from the database."""
    await session.execute(delete(MessageRow))
    await session.commit()


async def get_all_messages(session: AsyncSession) -> list[MessageRow]:
    result = await session.execute(select(MessageRow).order_by(MessageRow.created_at))
    return list(result.scalars().all())


async def save_persona(
    session: AsyncSession,
    persona_id: str,
    key_space_id: str,
    name_token: str,
    ciphertext: str,
    created_at: datetime,
) -> PersonaRow:
    """Persist an encrypted persona definition."""
    row = PersonaRow(
        id=persona_id,
        key_space_id=key_space_id,
        name_token=name_token,
        ciphertext=ciphertext,
        created_at=created_at,
    )
    session.add(row)
    await session.commit()

    return row


async def get_personas(session: AsyncSession, key_space_id: str) -> list[PersonaRow]:
    """Return personas in a Key Space ordered by creation time."""
    result = await session.execute(
        select(PersonaRow)
        .where(PersonaRow.key_space_id == key_space_id)
        .order_by(PersonaRow.created_at)
    )

    return list(result.scalars().all())


async def get_persona(
    session: AsyncSession,
    persona_id: str,
    key_space_id: str,
) -> PersonaRow | None:
    """Return a persona when its id and Key Space both match."""
    result = await session.execute(
        select(PersonaRow).where(
            PersonaRow.id == persona_id,
            PersonaRow.key_space_id == key_space_id,
        )
    )

    return result.scalar_one_or_none()


async def delete_persona(
    session: AsyncSession,
    persona_id: str,
    key_space_id: str,
) -> bool:
    """Delete a persona from a Key Space."""
    row = await get_persona(session, persona_id, key_space_id)
    if row is None:
        return False

    await session.delete(row)
    await session.commit()

    return True
