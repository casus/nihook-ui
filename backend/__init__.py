from flask import Flask
from .extensions import db, jwt, migrate
from .api.schemas import schemas_bp
from .api.containers import containers_bp
from .api.auth import auth_bp
from .auth.jwt_callbacks import register_jwt_callbacks
from .logging_config import setup_logging
from .config import Config
from .web.frontend import frontend_bp


def create_app():
    setup_logging()
    app = Flask(__name__, static_folder="../frontend", template_folder="../frontend")
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    # Use render_as_batch=True to avoid issues with SQLite and Alembic when using DeclarativeBase
    migrate.init_app(app, db, render_as_batch=True)
    register_jwt_callbacks(jwt)

    # Register blueprints
    app.register_blueprint(frontend_bp)
    app.register_blueprint(auth_bp, url_prefix="/")
    app.register_blueprint(schemas_bp, url_prefix="/api/schemas")
    app.register_blueprint(containers_bp, url_prefix="/api/containers")

    return app
