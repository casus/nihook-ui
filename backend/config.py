import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class Config:
    # Flask configuration
    DEBUG = os.getenv('FLASK_DEBUG', 'False') == 'True'

    # Database configuration
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL', 'sqlite:///containers.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'super-secret-key-change-me')
    JWT_ACCESS_TOKEN_EXPIRES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 3600))
    # Only use Authorization headers for JWTs by default to avoid
    # accidentally reading malformed/old tokens from cookies.
    JWT_TOKEN_LOCATION = ['headers']
    JWT_COOKIE_SECURE = os.getenv('FLASK_ENV', 'development') == 'production'
    JWT_COOKIE_CSRF_PROTECT = False

    # SSH configuration for Podman
    SSH_CONFIG = {
        'hostname': os.getenv('SSH_HOSTNAME', 'localhost'),
        'port': int(os.getenv('SSH_PORT', 22)),
        'username': os.getenv('SSH_USERNAME', 'root'),
        'password': os.getenv('SSH_PASSWORD', ''),
        'key_filename': os.getenv('SSH_KEY_FILE', None),
        'jump_hosts': os.getenv('SSH_JUMP_HOSTS', '').split(',') if os.getenv('SSH_JUMP_HOSTS') else [],
        'jump_users': os.getenv('SSH_JUMP_USERS', '').split(',') if os.getenv('SSH_JUMP_USERS') else [],
        'jump_ports': [int(p) for p in os.getenv('SSH_JUMP_PORTS', '').split(',')] if os.getenv('SSH_JUMP_PORTS') else [],
    }

    # Podman configuration
    PODMAN_BINARY = os.getenv('PODMAN_BINARY', 'podman')

    # Container scripts configuration
    NIHOOK_FOLDER = os.getenv('NIHOOK_FOLDER', '/path/to/nihook')
    CONTAINER_SCRIPTS_DIR = os.getenv(
        'CONTAINER_SCRIPTS_DIR', '/path/to/nihook/scripts')
    SPIN_UP_SCRIPT = os.getenv('SPIN_UP_SCRIPT', 'spin_up_new_instance.sh')
    RESTART_SCRIPT = os.getenv('RESTART_SCRIPT', 'restart_instances.sh')
    RESUME_SCRIPT = os.getenv('RESUME_SCRIPT', 'resume_instances.sh')

    # Security
    SESSION_COOKIE_SECURE = os.getenv(
        'FLASK_ENV', 'development') == 'production'

# Allow direct imports (e.g. `from backend.config import DEBUG`)
DEBUG = Config.DEBUG
SSH_CONFIG = Config.SSH_CONFIG
NIHOOK_FOLDER = Config.NIHOOK_FOLDER
CONTAINER_SCRIPTS_DIR = Config.CONTAINER_SCRIPTS_DIR
SPIN_UP_SCRIPT = Config.SPIN_UP_SCRIPT
RESTART_SCRIPT = Config.RESTART_SCRIPT
RESUME_SCRIPT = Config.RESUME_SCRIPT
