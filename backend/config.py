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
    }

    # Podman configuration
    PODMAN_BINARY = os.getenv('PODMAN_BINARY', 'podman')

    # Container scripts configuration
    CONTAINER_SCRIPTS_DIR = os.getenv(
        'CONTAINER_SCRIPTS_DIR', '/path/to/knuepf66-container')
    SPIN_UP_SCRIPT = os.getenv('SPIN_UP_SCRIPT', 'spin_up_new_instance.sh')
    RESTART_SCRIPT = os.getenv('RESTART_SCRIPT', 'restart_instances.sh')
    RESUME_SCRIPT = os.getenv('RESUME_SCRIPT', 'resume_instances.sh')

    # Security
    SESSION_COOKIE_SECURE = os.getenv(
        'FLASK_ENV', 'development') == 'production'
