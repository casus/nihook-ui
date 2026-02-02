from backend.config import Config
import paramiko
import logging

logger = logging.getLogger(__name__)


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

