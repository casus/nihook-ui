from importlib.resources import files
import json
from flask import Blueprint, request, jsonify, render_template, send_from_directory
import requests
from sqlalchemy import select
from werkzeug.security import generate_password_hash, check_password_hash
from backend.extensions import db
from backend.models import Container, User 
from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity,
)
from backend.config import SPIN_UP_SCRIPT, RESTART_SCRIPT, RESUME_SCRIPT, NIHOOK_FOLDER
import logging
from backend.services.ssh import (
    get_ssh_client,
    execute_podman_command,
    execute_container_script,
)

containers_bp = Blueprint("containers", __name__)

logger = logging.getLogger(__name__)


@containers_bp.route("/", methods=["GET"])
@jwt_required()
def get_containers():
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(Container.owner_id == current_user_id)
    containers = db.session.execute(stmt).scalars().all()

    # Batch-update statuses with a single podman insGitlabRepositorypect call to save SSH roundtrips
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


@containers_bp.route("/", methods=["POST"])
@jwt_required()
def create_container():
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    current_user = db.session.get(User, current_user_id)
    if not current_user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()

    # Create container record in database
    new_container = Container(
        name=data["name"],
        description=data.get("description", ""),
        owner=current_user,
        
    )

    # Create container on remote server using custom script
    # Build arguments for the spin_up script
    script_args = []

    # script_args.containers_bpend(f'--name {data["name"]}')

    args_str = " ".join(script_args)

    output, error = execute_container_script(SPIN_UP_SCRIPT, None, args_str)
    if not output or error:
        return jsonify({"error": f"Failed to create container: {error}"}), 500
    container_details = Container.parse_spinup_output(output, NIHOOK_FOLDER)
    new_container.update_with_spinup_details(container_details)
    new_container.status = "running"
    # Persist the new Container object to the database
    db.session.add(new_container)
    db.session.commit()
    logger.info("Created new container: %s", new_container.to_dict())
    return jsonify(new_container.to_dict()), 201


@containers_bp.route("/<int:container_id>", methods=["GET"])
@jwt_required()
def get_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except ValueError:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

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


@containers_bp.route("<int:container_id>", methods=["PUT"])
@jwt_required()
def update_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

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

# ========= Gitlab Repository Endpoints ==========
@containers_bp.route("<int:container_id>/gitlab-repositories", methods=["GET"])
@jwt_required()
def get_gitlab_repositories(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400
    
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/gitlab-projects"

    headers = {}
    if container.webhook_user:
        headers["X-Webhook-User"] = container.webhook_user
    if container.webhook_secret:
        headers["X-Webhook-Secret"] = container.webhook_secret

    try:
        resp = requests.get(
            webhook_url,
            headers=headers,
            timeout=30
        )

        if resp.status_code != 200:
            return jsonify({"error": f"Failed to fetch Gitlab repositories from webhook: {resp.text}"}), 500

        repo_data = resp.json()
        repos = []
        for key, value in repo_data.items():
            repos.append({
                "url": key,
                "access_token": "••••••••" # Do not return actual token from webhook response
            })
        return jsonify(repos), 200

    except requests.RequestException as e:
        logger.error(f"Error fetching Gitlab repositories: {e}")
        return jsonify({"error": f"Failed to fetch Gitlab repositories: {str(e)}"}), 500

@containers_bp.route("<int:container_id>/gitlab-repositories", methods=["POST"])
@jwt_required()
def create_gitlab_repository(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400

    data = request.get_json()

    if not data.get("url"):
        return jsonify({"error": "URL is required"}), 400
    if not container.webhook_user or not container.webhook_secret:
        return jsonify({"error": "Container must be configured with both webhook user and secret to add Gitlab repositories"}), 400
    
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/gitlab-projects"
    headers = {}
    headers["X-Webhook-User"] = container.webhook_user
    headers["X-Webhook-Secret"] = container.webhook_secret
    data_to_send = {
        "url": data["url"],
        "token": data.get("access_token", "")
    }


    try:
        resp = requests.post(
            webhook_url,
            headers=headers,
            json=data_to_send,
            timeout=30
        )

        if resp.status_code != 201:
            return jsonify({"error": f"Failed to create Gitlab repository via webhook: {resp.text}"}), 500

    except requests.RequestException as e:
        logger.error(f"Error creating Gitlab repository via webhook: {e}")
        return jsonify({"error": f"Failed to create Gitlab repository via webhook: {str(e)}"}), 500

    return jsonify({"message": "Gitlab repository created successfully"}), 201


@containers_bp.route(
    "/<int:container_id>/gitlab-repositories/<path:repo_url>", methods=["PUT"]
)
@jwt_required()
def update_gitlab_repository(container_id, repo_url):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404
    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400

    if not container.webhook_user or not container.webhook_secret:
        return jsonify({"error": "Container must be configured with both webhook user and secret to add Gitlab repositories"}), 400
    
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/gitlab-projects"
    headers = {}
    headers["X-Webhook-User"] = container.webhook_user
    headers["X-Webhook-Secret"] = container.webhook_secret

    data = request.get_json()
    data_to_send = {
        "url": repo_url,
        "token": data.get("access_token", "")
    }
    try:
        resp = requests.put(
            webhook_url,
            headers=headers,
            json=data_to_send,
            timeout=30
        )

        if resp.status_code != 200:
            return jsonify({"error": f"Failed to update Gitlab repository via webhook: {resp.text}"}), 500

    except requests.RequestException as e:
        logger.error(f"Error updating Gitlab repository via webhook: {e}")
        return jsonify({"error": f"Failed to update Gitlab repository via webhook: {str(e)}"}), 500

    return jsonify({"message": "Gitlab repository updated successfully"}), 200


@containers_bp.route(
    "/<int:container_id>/gitlab-repositories/<path:repo_url>", methods=["DELETE"]
)
@jwt_required()
def delete_gitlab_repository(container_id, repo_url):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    if not container.webhook_host:
         return jsonify({"error": "Container is not configured with a webhook host"}), 400

    if not container.webhook_user or not container.webhook_secret:
        return jsonify({"error": "Container must be configured with both webhook user and secret to add Gitlab repositories"}), 400
    
    webhook_url = f"{container.webhook_host.rstrip('/')}/api/gitlab-projects"
    headers = {}
    headers["X-Webhook-User"] = container.webhook_user
    headers["X-Webhook-Secret"] = container.webhook_secret
    data_to_send = {
        "url": repo_url
    }
    try:
        resp = requests.delete(
            f"{webhook_url}",
            headers=headers,
            json=data_to_send,
            timeout=30
        )

        if resp.status_code != 200:
            return jsonify({"error": f"Failed to delete Gitlab repository via webhook: {resp.text}"}), 500

    except requests.RequestException as e:
        logger.error(f"Error deleting Gitlab repository via webhook: {e}")
        return jsonify({"error": f"Failed to delete Gitlab repository via webhook: {str(e)}"}), 500



    return jsonify({"message": "Gitlab repository deleted successfully"}), 200


# ========= Container Control Endpoints (Start/Stop/Restart/Delete) ==========
@containers_bp.route("<int:container_id>/start", methods=["POST"])
@jwt_required()
def start_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Use custom resume script to start container
    output, error = execute_container_script(RESUME_SCRIPT, container.folder_path)

    if not output or error:
        return jsonify({"error": f"Failed to start container: {error}"}), 500

    container_details = Container.parse_spinup_output(output, NIHOOK_FOLDER)
    container.update_with_spinup_details(container_details)
    container.status = "running"
    # Persist the new Container object to the database
    db.session.add(container)
    db.session.commit()

    return jsonify(
        {"message": "Container started successfully", "status": container.status}
    ), 200


@containers_bp.route("<int:container_id>/stop", methods=["POST"])
@jwt_required()
def stop_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

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


@containers_bp.route("<int:container_id>/restart", methods=["POST"])
@jwt_required()
def restart_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Use custom restart script to restart container
    output, error = execute_container_script(RESTART_SCRIPT, container.folder_path)
    if error or not output:
        return jsonify({"error": f"Failed to restart container: {error}"}), 500

    # Update container details from restart output
    container_details = Container.parse_spinup_output(output, NIHOOK_FOLDER)
    container.update_with_spinup_details(container_details)

    container.status = "running"
    db.session.commit()

    return jsonify(
        {"message": "Container restarted successfully", "status": container.status}
    ), 200


@containers_bp.route("<int:container_id>/delete", methods=["POST"])
@jwt_required()
def delete_container(container_id):
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401
    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

    if not container:
        return jsonify({"error": "Container not found"}), 404

    # Remove container from remote server
    _, error = execute_podman_command(
        f"rm -f {container.podman_id} && rm -rf {container.folder_path}"
    )
    if error:
        return jsonify({"error": f"Failed to delete container: {error}"}), 500

    # Remove from database
    db.session.delete(container)
    db.session.commit()

    return jsonify({"message": "Container deleted successfully"}), 200


# ========== Container Logs Endpoints ==========
@containers_bp.route("<int:container_id>/logs", methods=["GET"])
@jwt_required()
def list_container_logs(container_id):
    """List available log files in container's logs directory"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

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


@containers_bp.route("<int:container_id>/logs/<filename>", methods=["GET"])
@jwt_required()
def get_container_log(container_id, filename):
    """Get content of a specific log file"""
    try:
        current_user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"error": "Invalid user identity in token"}), 401

    stmt = select(Container).where(
        Container.id == container_id, Container.owner_id == current_user_id
    )
    container = db.session.execute(stmt).scalars().first()

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
