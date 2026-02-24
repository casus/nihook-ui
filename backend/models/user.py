from typing import List, TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean
from sqlalchemy.orm import Mapped, relationship, mapped_column

from backend.extensions import Base

if TYPE_CHECKING:
    from . import Container, Schema


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, init=False)

    username: Mapped[str] = mapped_column(
        String(80),
        unique=True,
        nullable=False
    )

    email: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        nullable=False
    )

    password_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False
    )
    
    is_admin: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False
    )

    containers: Mapped[List["Container"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
        default_factory=list,
    )

    schemas: Mapped[List["Schema"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
        default_factory=list,
    )