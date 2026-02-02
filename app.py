from backend import create_app
import logging
from backend.services.ssh import ensure_ssh_available

logger = logging.getLogger(__name__)

app = create_app()

if __name__ == "__main__":
    if not ensure_ssh_available():
        logger.error(
            "SSH check failed: please verify SSH_HOSTNAME/SSH_USERNAME credentials or key"
        )
        raise SystemExit(1)
    app.run(debug=True)
