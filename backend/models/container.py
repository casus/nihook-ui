import os
import re
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import String, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, relationship, mapped_column

from backend.extensions import db, Base

if TYPE_CHECKING:
    from .user import User


class Container(Base):
    __tablename__ = "container"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, init=False)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False, init=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    status: Mapped[str] = mapped_column(String(20), default="stopped")

    owner: Mapped["User"] = relationship("User", back_populates="containers", default=None)

    # Additional container properties
    ports: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    folder_path: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    podman_id: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    public_url: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    instructions: Mapped[Optional[str]] = mapped_column(Text, default=None)

    nocodb_token: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    nocodb_ssl_cert: Mapped[Optional[str]] = mapped_column(String(255), default=None)

    webhook_host: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    webhook_user: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    webhook_secret: Mapped[Optional[str]] = mapped_column(String(255), default=None)


    def to_dict(self) -> dict:
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "owner_id": self.owner_id,
            "status": self.status,
            "ports": self.ports,
            "folder_path": self.folder_path,
            "podman_id": self.podman_id,
            "public_url": self.public_url,
            "instructions": self.instructions,
            "nocodb_token": self.nocodb_token,
            "nocodb_ssl_cert": self.nocodb_ssl_cert,
            "webhook_host": self.webhook_host,
            "webhook_user": self.webhook_user,
            "webhook_secret": self.webhook_secret,
        }

        return data

    def update_with_spinup_details(self, details: dict):
        """Update container fields from the dictionary returned by parse_spinup_output.
        Only updates fields that have a non-None value in the details dict.
        """
        if details.get("podman_id"):
            self.podman_id = details["podman_id"]
        if details.get("ports"):
            self.ports = details["ports"]
        if details.get("folder_path"):
            self.folder_path = details["folder_path"]
        if details.get("public_url"):
            self.public_url = details["public_url"]
        if details.get("instructions"):
            self.instructions = details["instructions"]
        if details.get("nocodb_token"):
            self.nocodb_token = details["nocodb_token"]
        if details.get("nocodb_ssl_cert"):
            self.nocodb_ssl_cert = details["nocodb_ssl_cert"]
        if details.get("webhook_host"):
            self.webhook_host = details["webhook_host"]
        if details.get("webhook_user"):
            self.webhook_user = details["webhook_user"]
        if details.get("webhook_secret"):
            self.webhook_secret = details["webhook_secret"]

    @staticmethod
    def parse_spinup_output(output: str, nihook_folder: str):
        """Parse the spin-up output and return podman_id, ports, folder_path, public_url, instructions, nocodb_token, nocodb_ssl_cert, webhook_host, webhook_user, and webhook_secret.

        Args:
            output: Full stdout/stderr text returned by the spin-up script.
            nihook_folder: Absolute path to the NIHOOK_FOLDER (e.g. /home/user/nihook).

        Returns:
            A dict with keys: 'podman_id', 'ports', 'folder_path', 'public_url', 'instructions', 'nocodb_token', 'nocodb_ssl_cert', 'webhook_host', 'webhook_user', 'webhook_secret'.
            Values are strings or None if not found.
        """
        # Podman/container id: look for a 64-char hex string on its own or within text
        podman_match = re.search(r"\b([0-9a-f]{64})\b", output)
        podman_id = podman_match.group(1) if podman_match else None

        # Ports: appear in the created folder name like 'nocodb_webhook_instance_5595_7595'
        ports_match = re.search(r"nocodb_webhook_instance_([0-9_]+)", output)
        ports = ports_match.group(1) if ports_match else None

        # folder_path: join nihook_folder with the created directory name if ports found
        folder_path = None
        if ports:
            folder_name = f"nocodb_webhook_instance_{ports}"
            # Ensure absolute path and normalized
            folder_path = os.path.normpath(os.path.join(nihook_folder, folder_name))

        # Extract public URL - look for patterns like "NocoDB at https://data.casus.science/7660"
        public_url = None
        nocodb_url_patterns = [
            r"NocoDB at (https?://[^\s]+)",
            r"Webhook at (https?://[^\s]+)",
            # IP based URLs like NocoDB at 127.0.0.1:8080
            r"NocoDB at (\d{1,3}(?:\.\d{1,3}){3}:\d+)",
            r"Webhook at (\d{1,3}(?:\.\d{1,3}){3}:\d+)",
        ]
        for pattern in nocodb_url_patterns:
            url_match = re.search(pattern, output)
            if url_match:
                public_url = url_match.group(1)
                # Ensure URL has protocol if missing (for IP addresses)
                if not public_url.startswith("http"):
                    public_url = f"http://{public_url}"
                break

        webhook_host = None

        webhook_url_patterns = [
            r"Webhook at (https?://[^\s]+)",
            r"Webhook at (\d{1,3}(?:\.\d{1,3}){3}:\d+)",
        ]

        for pattern in webhook_url_patterns:
            url_match = re.search(pattern, output)
            if url_match:
                webhook_host = url_match.group(1)
                # Ensure URL has protocol if missing (for IP addresses)
                if not webhook_host.startswith("http"):
                    webhook_host = f"http://{webhook_host}"
                break
        # Extract instructions - look for the entire instructions block
        instructions = None

        # First try to find the "Next steps" section which is the most comprehensive
        instructions_match = re.search(r"# Next steps.*?(?=\Z)", output, re.DOTALL)

        if not instructions_match:
            # If no "Next steps" found, look for the username/purpose pattern
            instructions_match = re.search(
                r"<Username>\s*<Purpose>.*?(?=\Z)", output, re.DOTALL
            )

        if not instructions_match:
            # If no structured patterns found, look for any URL patterns that might indicate instructions
            url_patterns = [
                r"NocoDB at https?://[^\s]+",
                r"Webhook at https?://[^\s]+",
                r"NocoDB at \d{1,3}(?:\.\d{1,3}){3}:\d+",
                r"Webhook at \d{1,3}(?:\.\d{1,3}){3}:\d+",
                r"🟢 NocoDB and webhook servers running",
            ]
            for pattern in url_patterns:
                if re.search(pattern, output):
                    # Capture from the first URL pattern to the end
                    instructions_match = re.search(
                        pattern + r".*?(?=\Z)", output, re.DOTALL
                    )
                    if instructions_match:
                        break

        if instructions_match:
            instructions = instructions_match.group(0).strip()
        else:
            # If no structured instructions found, use the entire output as instructions
            instructions = output.strip()

        # Extract NocoDB token - look for pattern like "NocoDB token: <token>"
        nocodb_token = None
        token_match = re.search(r"NocoDB token:\s*([^\s\n]+)", output)
        if token_match:
            nocodb_token = token_match.group(1)

        # Extract SSL certificate checking status - look for pattern like "SSL certificate checking is '<value>'"
        nocodb_ssl_cert = None
        ssl_match = re.search(r"SSL certificate checking is '([^']+)'", output)
        if ssl_match:
            nocodb_ssl_cert = ssl_match.group(1)

        # Extract webhook user - look for pattern like "* X-Webhook-User: firstuser"
        webhook_user = None
        webhook_user_match = re.search(r"\* X-Webhook-User:\s*(\S+)", output)
        if webhook_user_match:
            webhook_user = webhook_user_match.group(1)

        # Extract webhook secret - look for pattern like "* X-Webhook-Secret: E2EJnK4Pt1Z+TXVBaHHAD2gDTJDJI8G7pV4m33SO9vg="
        webhook_secret = None
        webhook_secret_match = re.search(r"\* X-Webhook-Secret:\s*(\S+)", output)
        if webhook_secret_match:
            webhook_secret = webhook_secret_match.group(1)

        return {
            "podman_id": podman_id,
            "ports": ports,
            "folder_path": folder_path,
            "public_url": public_url,
            "instructions": instructions,
            "nocodb_token": nocodb_token,
            "nocodb_ssl_cert": nocodb_ssl_cert,
            "webhook_host": webhook_host,
            "webhook_user": webhook_user,
            "webhook_secret": webhook_secret,
        }
