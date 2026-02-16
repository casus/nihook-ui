from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, relationship, mapped_column

from backend.extensions import Base

if TYPE_CHECKING:
    from .container import Container


class GitlabRepository(Base):
    __tablename__ = "gitlab_repository"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    url: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[Optional[str]] = mapped_column(String(255))

    container_id: Mapped[int] = mapped_column(
        ForeignKey("container.id"),
        nullable=False
    )

    container: Mapped["Container"] = relationship(
        back_populates="gitlab_repositories"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "access_token": self.access_token,
            "container_id": self.container_id,
        }
