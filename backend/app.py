#!/usr/bin/env python3

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from werkzeug.security import generate_password_hash, check_password_hash
import logging
import paramiko
from typing import Optional
from output_parser import parse_spinup_output
from config import Config
import json
import requests

# Load environment variables

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, static_folder="../frontend", template_folder="../frontend")

# Load configuration from Config class
app.config.from_object(Config)

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# JWT error handlers


@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization header is missing"}), 401


@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid or malformed token"}), 401


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired"}), 401


# Models


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    containers = db.relationship("Container", backref="owner", lazy=True)

    def __init__(self, username, email, password_hash):
        self.username = username
        self.email = email
        self.password_hash = password_hash


class Container(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500))
    status = db.Column(db.String(20), default="stopped")
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    # Additional container properties
    ports = db.Column(db.String(255))
    folder_path = db.Column(db.String(255))
    podman_id = db.Column(db.String(255))
    public_url = db.Column(db.String(255))
    instructions = db.Column(db.Text)
    nocodb_token = db.Column(db.String(255))
    nocodb_ssl_cert = db.Column(db.String(255))
    webhook_host = db.Column(db.String(255))
    webhook_user = db.Column(db.String(255))
    webhook_secret = db.Column(db.String(255))

    def __init__(
        self,
        name,
        description="",
        user_id=None,
        status="stopped",
        ports=None,
        folder_path=None,
        podman_id=None,
        public_url=None,
        instructions=None,
        nocodb_token=None,
        nocodb_ssl_cert=None,
        webhook_host=None,
        webhook_user=None,
        webhook_secret=None,
    ):
        self.name = name
        self.description = description
        self.user_id = user_id
        self.status = status
        self.ports = ports
        self.folder_path = folder_path
        self.podman_id = podman_id
        self.public_url = public_url
        self.instructions = instructions
        self.nocodb_token = nocodb_token
        self.nocodb_ssl_cert = nocodb_ssl_cert
        self.webhook_host = webhook_host
        self.webhook_user = webhook_user
        self.webhook_secret = webhook_secret

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "user_id": self.user_id,
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


# Schema validation helper functions

VALID_TYPES = ["string", "integer", "number", "boolean", "array", "object", "null"]
VALID_STRING_SUBTYPES = ["DateTime", "Duration", "URL", ""]
VALID_ARRAY_ITEM_TYPES = ["string", "integer", "number", "boolean", "null"]


def validate_and_normalize_schema(schema_def: dict) -> Optional[str]:
    """Validate and normalize schema definition according to prepare_json.py format"""
    if "properties" not in schema_def:
        return "Schema must have 'properties' key"

    # Validate top-level meta fields
    if "type" not in schema_def:
        schema_def["type"] = "object"

    if "required" not in schema_def:
        schema_def["required"] = []

    # Recursively validate properties
    return validate_properties_recursive(schema_def["properties"])


def validate_properties_recursive(properties: dict, path: str = "") -> Optional[str]:
    """Recursively validate properties and normalize types"""
    for field_name, field_def in properties.items():
        current_path = f"{path}.{field_name}" if path else field_name

        # Validate field definition is a dict
        if not isinstance(field_def, dict):
            return f"Field '{current_path}' must be an object"

        # Check if type is present
        if "type" not in field_def:
            return f"Field '{current_path}' must have a 'type' property"

        field_type = field_def["type"]

        # Validate field type
        if field_type not in VALID_TYPES:
            return f"Field '{current_path}' has invalid type '{field_type}'. Valid types: {', '.join(VALID_TYPES)}"

        # Handle string type with subtypes
        if field_type == "string":
            if "subtype" in field_def:
                subtype = field_def["subtype"]
                if subtype not in VALID_STRING_SUBTYPES:
                    return f"Field '{current_path}' has invalid subtype '{subtype}'. Valid subtypes: {', '.join(filter(None, VALID_STRING_SUBTYPES))}"

        # Handle array type
        elif field_type == "array":
            if "items" not in field_def:
                return (
                    f"Field '{current_path}' of type 'array' must have 'items' property"
                )

            items_def = field_def["items"]
            if not isinstance(items_def, dict) or "type" not in items_def:
                return f"Field '{current_path}' items must have a 'type' property"

            item_type = items_def["type"]
            if item_type not in VALID_ARRAY_ITEM_TYPES:
                return f"Field '{current_path}' has invalid item type '{item_type}'. Valid item types: {', '.join(VALID_ARRAY_ITEM_TYPES)}"

        # Handle object type with nested properties
        elif field_type == "object":
            if "properties" not in field_def:
                field_def["properties"] = {}

            if "required" not in field_def:
                field_def["required"] = []

            # Recursively validate nested properties
            if field_def["properties"]:
                error = validate_properties_recursive(
                    field_def["properties"], current_path
                )
                if error:
                    return error

    return None


class Schema(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    schema_definition = db.Column(db.JSON, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime, server_default=db.func.now(), onupdate=db.func.now()
    )

    def __init__(self, name, schema_definition, user_id):
        self.name = name
        self.schema_definition = schema_definition
        self.user_id = user_id

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "schema_definition": self.schema_definition,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Database initialization
with app.app_context():
    # db.drop_all()
    db.create_all()

# Use values from Config
SSH_CONFIG = Config.SSH_CONFIG
CONTAINER_SCRIPTS_DIR = Config.CONTAINER_SCRIPTS_DIR
NIHOOK_FOLDER = Config.NIHOOK_FOLDER
SPIN_UP_SCRIPT = Config.SPIN_UP_SCRIPT
RESTART_SCRIPT = Config.RESTART_SCRIPT
RESUME_SCRIPT = Config.RESUME_SCRIPT


def get_ssh_client():
    """Create and return an SSH client"""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        if SSH_CONFIG["key_filename"]:
            client.connect(
                hostname=SSH_CONFIG["hostname"],
                port=SSH_CONFIG["port"],
                username=SSH_CONFIG["username"],
                key_filename=SSH_CONFIG["key_filename"],
            )
        else:
            client.connect(
                hostname=SSH_CONFIG["hostname"],
                port=SSH_CONFIG["port"],
                username=SSH_CONFIG["username"],
                password=SSH_CONFIG["password"],
            )
        return client
    except Exception as e:
        logger.error(
            "SSH connection failed to %s:%s as %s: %s",
            SSH_CONFIG["hostname"],
            SSH_CONFIG["port"],
            SSH_CONFIG["username"],
            e,
        )
        return None


def execute_podman_command(command):
    """Execute a podman command on the remote server"""
    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"
    print("Executing podman command:", command)
    try:
        stdin, stdout, stderr = client.exec_command(f"podman {command}")
        out_bytes = stdout.read()
        err_bytes = stderr.read()
        output = out_bytes.decode().strip()
        error = err_bytes.decode().strip()

        # Check the remote command exit status. Some podman messages are
        # warnings printed to stderr but still exit with status 0 (success).
        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            logger.error(
                "Podman command failed (exit %s): %s\nstderr: %s",
                exit_status,
                command,
                error,
            )
            return None, error or f"podman exited with status {exit_status}"

        # Success (exit_status == 0) — return stdout even if stderr contained warnings
        return output, None
    except Exception as e:
        logger.error("Exception during podman command execution: \n%s \n%s", e, command)
        return None, str(e)
    finally:
        client.close()


def execute_container_script(script_name, container_folder, additional_args=""):
    """Execute a custom container management script on the remote server"""
    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"

    full_command = f"cd {NIHOOK_FOLDER} && {CONTAINER_SCRIPTS_DIR}/{script_name} {container_folder if container_folder else ''} {additional_args}"
    try:
        # Change to the scripts directory and execute the script
        stdin, stdout, stderr = client.exec_command(full_command)
        out_bytes = stdout.read()
        err_bytes = stderr.read()
        output = out_bytes.decode().strip()
        error = err_bytes.decode().strip()

        exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            logger.error(
                "Container script failed (exit %s): %s\nstderr: %s",
                exit_status,
                full_command,
                error,
            )
            return None, error or f"script exited with status {exit_status}"

        return output, None
    except Exception as e:
        logger.error(
            "Exception during container script execution: \n%s \n%s", e, full_command
        )
        return None, str(e)
    finally:
        client.close()



def ensure_ssh_available():
    """Check SSH connectivity before starting the app"""
    client = get_ssh_client()
    if client is None:
        logger.error(
            "SSH preflight failed; cannot connect to %s:%s as %s",
            SSH_CONFIG["hostname"],
            SSH_CONFIG["port"],
            SSH_CONFIG["username"],
        )
        return False

    logger.info(
        "SSH preflight succeeded to %s:%s as %s",
        SSH_CONFIG["hostname"],
        SSH_CONFIG["port"],
        SSH_CONFIG["username"],
    )
    client.close()
    return True


# ============== Routes ================


@app.route("/")
def home():
    return render_template("index.html")


# Serve static files


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory("../frontend", filename)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    data = request.get_json()
    username = data.get("username")
    # TODO: Change this to hashed password comparison
    password = data.get("password")

    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        # Use string identity to be compatible with newer flask-jwt-extended
        access_token = create_access_token(identity=str(user.id))
        return jsonify(
            {
                "access_token": access_token,
                "user_id": user.id,
                "username": user.username,
            }
        ), 200

    return jsonify({"error": "Invalid username or password"}), 401


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already exists"}), 400

    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User registered successfully"}), 201


@app.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"message": "Logged out successfully"}), 200


@app.route("/api/containers", methods=["GET"])
@jwt_required()
def get_containers():
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    containers = Container.query.filter_by(user_id=current_user_id).all()

    # Batch-update statuses with a single podman inspect call to save SSH roundtrips
    podman_ids = [c.podman_id for c in containers if c.podman_id]
    if podman_ids:
        ids_str = " ".join(podman_ids)
        # format outputs lines like: <id>:<Status>
        output, error = execute_podman_command(
            f'inspect {ids_str} --format "{{{{.Id}}}}:{{{{.State.Status}}}}"'
        )
        if output and not error:
            # Parse lines and map statuses back to container objects
            id_status = {}
            for line in output.splitlines():
                parts = line.strip().split(":", 1)
                if len(parts) != 2:
                    continue
                pid, status = parts
                id_status[pid] = status

            # Update matching Container objects (match by equality or prefix)
            updated = False
            for c in containers:
                if not c.podman_id:
                    continue
                # Find matching inspected id (full id returned by podman may be longer)
                matched_status = None
                for inspected_id, status in id_status.items():
                    if (
                        inspected_id == c.podman_id
                        or inspected_id.startswith(c.podman_id)
                        or c.podman_id.startswith(inspected_id)
                    ):
                        matched_status = status
                        break
                if matched_status:
                    new_status = matched_status.lower()
                    if c.status != new_status:
                        c.status = new_status
                        updated = True

            # Commit once if any container changed
            if updated:
                db.session.commit()

    return jsonify([container.to_dict() for container in containers]), 200


@app.route("/api/containers", methods=["POST"])
@jwt_required()
def create_container():
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    data = request.get_json()

    # Create container record in database
    new_container = Container(
        name=data["name"],
        description=data.get("description", ""),
        user_id=current_user_id,
    )

    # Create container on remote server using custom script
    # Build arguments for the spin_up script
    script_args = []

    # script_args.append(f'--name {data["name"]}')

    args_str = " ".join(script_args)

    output, error = execute_container_script(SPIN_UP_SCRIPT, None, args_str)
    if not output or error:
        return jsonify({"error": f"Failed to create container: {error}"}), 500
    container_details = parse_spinup_output(output, NIHOOK_FOLDER)
    print(container_details)
    new_container.podman_id = container_details.get("podman_id")
    new_container.ports = container_details.get("ports")
    new_container.folder_path = container_details.get("folder_path")
    new_container.public_url = container_details.get("public_url")
    new_container.instructions = container_details.get("instructions")
    new_container.nocodb_token = container_details.get("nocodb_token")
    new_container.nocodb_ssl_cert = container_details.get("nocodb_ssl_cert")
    new_container.webhook_host = container_details.get("webhook_host")
    new_container.webhook_user = container_details.get("webhook_user")
    new_container.webhook_secret = container_details.get("webhook_secret")
    new_container.status = "running"
    # Persist the new Container object to the database
    db.session.add(new_container)
    db.session.commit()
    logger.info("Created new container: %s", new_container.to_dict())
    return jsonify(new_container.to_dict()), 201


@app.route("/api/containers/<int:container_id>", methods=["GET"])
@jwt_required()
def get_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Update status from remote server
    output, error = execute_podman_command(
        f'inspect {container.podman_id} --format "{{{{.State.Status}}}}"'
    )
    if output:
        container.status = output.lower()
        db.session.commit()

    return jsonify(container.to_dict()), 200


@app.route("/api/containers/<int:container_id>", methods=["PUT"])
@jwt_required()
def update_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    data = request.get_json()

    # Update container properties
    if "name" in data:
        container.name = data["name"]
    if "description" in data:
        container.description = data["description"]
    db.session.commit()

    return jsonify(container.to_dict()), 200


@app.route("/api/containers/<int:container_id>/start", methods=["POST"])
@jwt_required()
def start_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Use custom resume script to start container
    output, error = execute_container_script(RESUME_SCRIPT, container.folder_path)

    if not output or error:
        return jsonify({"error": f"Failed to start container: {error}"}), 500

    container_details = parse_spinup_output(output, NIHOOK_FOLDER)
    container.podman_id = container_details.get("podman_id")
    container.ports = container_details.get("ports")
    container.folder_path = container_details.get("folder_path")
    container.public_url = container_details.get("public_url")
    container.instructions = container_details.get("instructions")
    container.nocodb_token = container_details.get("nocodb_token")
    container.nocodb_ssl_cert = container_details.get("nocodb_ssl_cert")
    container.webhook_host = container_details.get("webhook_host")
    container.webhook_user = container_details.get("webhook_user")
    container.webhook_secret = container_details.get("webhook_secret")
    container.status = "running"
    # Persist the new Container object to the database
    db.session.add(container)
    db.session.commit()

    return jsonify(
        {"message": "Container started successfully", "status": container.status}
    ), 200


@app.route("/api/containers/<int:container_id>/stop", methods=["POST"])
@jwt_required()
def stop_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    output, error = execute_podman_command(f"stop {container.podman_id}")
    if error:
        return jsonify({"error": f"Failed to stop container: {error}"}), 500

    container.status = "stopped"
    db.session.commit()

    return jsonify(
        {"message": "Container stopped successfully", "status": container.status}
    ), 200


@app.route("/api/containers/<int:container_id>/restart", methods=["POST"])
@jwt_required()
def restart_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Use custom restart script to restart container
    output, error = execute_container_script(RESTART_SCRIPT, container.folder_path)
    if error or not output:
        return jsonify({"error": f"Failed to restart container: {error}"}), 500

    # Update container details from restart output
    container_details = parse_spinup_output(output, NIHOOK_FOLDER)
    if container_details.get("podman_id"):
        container.podman_id = container_details.get("podman_id")
    if container_details.get("public_url"):
        container.public_url = container_details.get("public_url")
    if container_details.get("instructions"):
        container.instructions = container_details.get("instructions")
    if container_details.get("nocodb_token"):
        container.nocodb_token = container_details.get("nocodb_token")
    if container_details.get("nocodb_ssl_cert"):
        container.nocodb_ssl_cert = container_details.get("nocodb_ssl_cert")
    if container_details.get("webhook_host"):
        container.webhook_host = container_details.get("webhook_host")
    if container_details.get("webhook_user"):
        container.webhook_user = container_details.get("webhook_user")
    if container_details.get("webhook_secret"):
        container.webhook_secret = container_details.get("webhook_secret")

    container.status = "running"
    db.session.commit()

    return jsonify(
        {"message": "Container restarted successfully", "status": container.status}
    ), 200


@app.route("/api/containers/<int:container_id>/delete", methods=["POST"])
@jwt_required()
def delete_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Remove container from remote server
    output, error = execute_podman_command(
        f"rm -f {container.podman_id} && rm -rf {container.folder_path}"
    )
    if error:
        return jsonify({"error": f"Failed to delete container: {error}"}), 500

    # Remove from database
    db.session.delete(container)
    db.session.commit()

    return jsonify({"message": "Container deleted successfully"}), 200


@app.route("/api/containers/<int:container_id>/logs", methods=["GET"])
@jwt_required()
def list_container_logs(container_id):
    """List available log files in container's logs directory"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    if not container.folder_path:
        return jsonify({"error": "Container has no folder path configured"}), 400

    # List log files in the container's logs directory
    logs_dir = f"{container.folder_path}/logs"

    client = get_ssh_client()
    if not client:
        return jsonify({"error": "Failed to connect to remote server"}), 500

    try:
        # Check if logs directory exists
        command_to_execute = f"ls {logs_dir} 2>/dev/null"
        stdin, stdout, stderr = client.exec_command(command_to_execute)
        print("Executed command:", command_to_execute)
        log_files = stdout.read().decode().strip()

        if not log_files:
            return jsonify({"files": []}), 200

        # Extract just the filenames (without full path)
        files = []
        for line in log_files.split("\n"):
            if line.strip():
                filename = line.split("/")[-1]
                files.append(filename)

        return jsonify({"files": files}), 200

    except Exception as e:
        logger.error(f"Error listing log files: {e}")
        return jsonify({"error": f"Failed to list log files: {str(e)}"}), 500
    finally:
        client.close()


@app.route("/api/containers/<int:container_id>/logs/<filename>", methods=["GET"])
@jwt_required()
def get_container_log(container_id, filename):
    """Get content of a specific log file"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    container = Container.query.filter_by(
        id=container_id, user_id=current_user_id
    ).first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    if not container.folder_path:
        return jsonify({"error": "Container has no folder path configured"}), 400

    # Validate filename to prevent directory traversal
    if not filename.endswith(".log"):
        return jsonify({"error": "Invalid log file name"}), 400

    if ".." in filename or "/" in filename:
        return jsonify({"error": "Invalid log file name"}), 400

    log_file_path = f"{container.folder_path}/logs/{filename}"

    client = get_ssh_client()
    if not client:
        return jsonify({"error": "Failed to connect to remote server"}), 500

    try:
        # Check if file exists and get its content
        stdin, stdout, stderr = client.exec_command(f"cat {log_file_path} 2>/dev/null")
        content = stdout.read().decode("utf-8", errors="replace")

        if not content:
            return jsonify({"error": "Log file is empty or does not exist"}), 404

        return jsonify(
            {"filename": filename, "content": content, "container_id": container_id}
        ), 200

    except Exception as e:
        logger.error(f"Error reading log file {filename}: {e}")
        return jsonify({"error": f"Failed to read log file: {str(e)}"}), 500
    finally:
        client.close()


# Schema Management Endpoints


@app.route("/schema-builder", methods=["GET"])
def schema_builder():
    return render_template("schema-builder.html")


@app.route("/api/schemas", methods=["GET"])
@jwt_required()
def get_schemas():
    """Get all schemas for current user"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schemas = Schema.query.filter_by(user_id=current_user_id).all()
    return jsonify([schema.to_dict() for schema in schemas]), 200


@app.route("/api/schemas", methods=["POST"])
@jwt_required()
def create_schema():
    """Create a new schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    data = request.get_json()

    if not data.get("name"):
        return jsonify({"error": "Schema name is required"}), 400

    if not data.get("schema_definition"):
        return jsonify({"error": "Schema definition is required"}), 400

    # Validate and normalize schema definition structure
    schema_def = data["schema_definition"]
    if not isinstance(schema_def, dict):
        return jsonify({"error": "Schema definition must be a JSON object"}), 400

    if "properties" not in schema_def:
        return jsonify({"error": "Schema definition must have properties"}), 400

    # Validate and normalize the schema
    validation_error = validate_and_normalize_schema(schema_def)
    if validation_error:
        return jsonify({"error": validation_error}), 400

    try:
        new_schema = Schema(
            name=data["name"], schema_definition=schema_def, user_id=current_user_id
        )
        db.session.add(new_schema)
        db.session.commit()
        logger.info(f"Created new schema: {new_schema.to_dict()}")
        return jsonify(new_schema.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating schema: {e}")
        return jsonify({"error": f"Failed to create schema: {str(e)}"}), 500


@app.route("/api/schemas/<int:schema_id>", methods=["GET"])
@jwt_required()
def get_schema(schema_id):
    """Get a specific schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    return jsonify(schema.to_dict()), 200


@app.route("/api/schemas/<int:schema_id>", methods=["PUT"])
@jwt_required()
def update_schema(schema_id):
    """Update a schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    data = request.get_json()

    # Update schema fields
    if "name" in data:
        schema.name = data["name"]

    if "schema_definition" in data:
        schema_def = data["schema_definition"]
        if not isinstance(schema_def, dict):
            return jsonify({"error": "Schema definition must be a JSON object"}), 400
        if "properties" not in schema_def:
            return jsonify({"error": "Schema definition must have properties"}), 400
        schema.schema_definition = schema_def

    db.session.commit()
    logger.info(f"Updated schema: {schema.to_dict()}")
    return jsonify(schema.to_dict()), 200


@app.route("/api/schemas/<int:schema_id>", methods=["DELETE"])
@jwt_required()
def delete_schema(schema_id):
    """Delete a schema"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    db.session.delete(schema)
    db.session.commit()

    return jsonify({"message": "Schema deleted successfully"}), 200


@app.route("/api/schemas/<int:schema_id>/download", methods=["GET"])
@jwt_required()
def download_schema(schema_id):
    """Download schema as SCHEMA.json file"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    schema = Schema.query.filter_by(id=schema_id, user_id=current_user_id).first()

    if not schema:
        return jsonify({"error": "Schema not found"}), 404

    # Create filename with SCHEMA.json suffix
    filename = f"{schema.name}.SCHEMA.json"

    # Return as JSON file download
    return jsonify({"filename": filename, "schema": schema.schema_definition}), 200


@app.route("/api/create-table", methods=["POST"])
@jwt_required()
def create_table_from_schema():
    try:
        user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity"}), 401

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    container_id = data.get("container_id")
    schema_id = data.get("schema_id")
    table_name = data.get("table_name")
    
    # base_id logic: if provided, use it. if not, check for new_base_name
    base_id = data.get("base_id")
    new_base_name = data.get("new_base_name")

    if not container_id or not schema_id or not table_name:
        return jsonify({"error": "Missing required fields: container_id, schema_id, table_name"}), 400

    if not base_id and not new_base_name:
         return jsonify({"error": "Either base_id or new_base_name must be provided"}), 400

    # Retrieve Container
    container = Container.query.filter_by(id=container_id, user_id=user_id).first()
    if not container:
        return jsonify({"error": "Container not found or unauthorized"}), 404
        
    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400

    # Retrieve Schema
    schema = Schema.query.filter_by(id=schema_id).first()
    if not schema or schema.user_id != user_id:
        return jsonify({"error": "Schema not found or unauthorized"}), 404

    # Prepare request to downstream container
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/create-table-file"
    
    headers = {}
    if container.webhook_user:
        headers["X-Webhook-User"] = container.webhook_user
    if container.webhook_secret:
        headers["X-Webhook-Secret"] = container.webhook_secret

    # Form data for requests
    form_data = {
        "table_name": table_name,
    }
    if base_id:
        form_data["base_id"] = base_id
    if new_base_name:
        form_data["new_base_name"] = new_base_name

    # Prepare file: convert schema_definition (dict) to JSON string/bytes
    schema_json = json.dumps(schema.schema_definition)
    files = {
        "schema": ("schema.json", schema_json, "application/json")
    }

    try:
        resp = requests.post(
            webhook_url,
            data=form_data,
            files=files,
            headers=headers,
            timeout=30
        )
        
        if resp.status_code >= 200 and resp.status_code < 300:
            try:
                resp_json = resp.json()
                return jsonify(resp_json), 200
            except:
                return jsonify({"message": "Table created successfully", "upstream_response": resp.text}), 200
        else:
            return jsonify({
                "error": f"Upstream error: {resp.status_code}", 
                "details": resp.text
            }), resp.status_code

    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling webhook: {e}")
        return jsonify({"error": f"Failed to contact container: {str(e)}"}), 502


if __name__ == "__main__":
    if not ensure_ssh_available():
        logger.error(
            "SSH check failed: please verify SSH_HOSTNAME/SSH_USERNAME credentials or key"
        )
        raise SystemExit(1)

    app.run(debug=True, host="0.0.0.0", port=5000)
