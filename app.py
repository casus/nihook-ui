import os
from backend import create_app
import logging
from backend.services.ssh import ensure_ssh_available
from backend.services.scanner import scan_and_import_containers
from backend.config import PORT, DEBUG
from waitress import serve

logger = logging.getLogger(__name__)

app = create_app()

if __name__ == "__main__":
    if not ensure_ssh_available():
        logger.error(
            "SSH check failed: please verify SSH_HOSTNAME/SSH_USERNAME credentials or key"
        )
        raise SystemExit(1)
    
    with app.app_context():
        try:
             scan_and_import_containers()
        except Exception as e:
             logger.error(f"Startup scan failed: {e}")

    if DEBUG:
        logger.info(f"Starting development server on port {PORT}...")
        app.run(host="0.0.0.0", port=PORT, debug=True)
    else:
        logger.info(f"Starting production WSGI server on port {PORT}...")
        serve(app, host="0.0.0.0", port=PORT)
