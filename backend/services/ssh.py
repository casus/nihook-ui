from backend.config import Config
import paramiko
import logging

import subprocess

logger = logging.getLogger(__name__)

USE_SSH = Config.USE_SSH
SSH_CONFIG = Config.SSH_CONFIG
CONTAINER_SCRIPTS_DIR = Config.CONTAINER_SCRIPTS_DIR
NIHOOK_FOLDER = Config.NIHOOK_FOLDER
SPIN_UP_SCRIPT = Config.SPIN_UP_SCRIPT
RESTART_SCRIPT = Config.RESTART_SCRIPT
RESUME_SCRIPT = Config.RESUME_SCRIPT

def get_ssh_client():
    """Create and return an SSH client"""
    if not USE_SSH:
        logger.info("SSH is disabled via configuration; get_ssh_client will return None.")
        return None
    jump_hosts = SSH_CONFIG.get("jump_hosts", [])
    jump_users = SSH_CONFIG.get("jump_users", [])
    jump_ports = SSH_CONFIG.get("jump_ports", [])

    # Ensure lists are the same length
    if jump_hosts:
        if len(jump_users) < len(jump_hosts):
            # Extend with last user or default user
            last_user = jump_users[-1] if jump_users else SSH_CONFIG["username"]
            jump_users.extend([last_user] * (len(jump_hosts) - len(jump_users)))
        if len(jump_ports) < len(jump_hosts):
            # Extend with 22
            jump_ports.extend([22] * (len(jump_hosts) - len(jump_ports)))

    clients = []
    last_client = None
    
    try:
        # Loop through jump hosts
        for i, host in enumerate(jump_hosts):
            # Safe access to jump users/ports
            port = int(jump_ports[i]) if i < len(jump_ports) else 22
            user = jump_users[i] if i < len(jump_users) else SSH_CONFIG["username"]
            
            logger.info(f"Connecting to jump host {host}:{port} as {user}...")

            j_client = paramiko.SSHClient() # distinct variable/scope
            j_client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            # Connection args for this jump host
            j_connect_kwargs = {
                "hostname": host,
                "port": port,
                "username": user,
            }

            # Use same auth method as main config for simplicity, unless we want to support mixed auth
            if SSH_CONFIG["key_filename"]:
                j_connect_kwargs["key_filename"] = SSH_CONFIG["key_filename"]
                j_connect_kwargs["allow_agent"] = True
                j_connect_kwargs["look_for_keys"] = True
            else:
                j_connect_kwargs["password"] = SSH_CONFIG["password"]

            # If we have a previous client, tunnel through it
            if last_client:
                transport = last_client.get_transport()
                if transport is None:
                    raise Exception(f"Failed to get transport for jump host {host}")
                # Open channel on previous host to this host
                channel = transport.open_channel("direct-tcpip", (host, port), ("127.0.0.1", 0))
                j_connect_kwargs["sock"] = channel
            
            j_client.connect(**j_connect_kwargs)
            clients.append(j_client)
            last_client = j_client

        # Connect to final destination
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        connect_kwargs = {
            "hostname": SSH_CONFIG["hostname"],
            "port": SSH_CONFIG["port"],
            "username": SSH_CONFIG["username"],
        }
        
        if SSH_CONFIG["key_filename"]:
            connect_kwargs["key_filename"] = SSH_CONFIG["key_filename"]
            connect_kwargs["allow_agent"] = True
            connect_kwargs["look_for_keys"] = True
        else:
            connect_kwargs["password"] = SSH_CONFIG["password"]

        if last_client:
             transport = last_client.get_transport()
             if transport is None:
                 raise Exception("Failed to get transport for final host")
             channel = transport.open_channel("direct-tcpip", (SSH_CONFIG["hostname"], SSH_CONFIG["port"]), ("127.0.0.1", 0))
             connect_kwargs["sock"] = channel

        client.connect(**connect_kwargs)
        
        # We need to ensure that when `client.close()` is called, the jump hosts are also closed.
        original_close = client.close
        # Capture current clients list in closure
        captured_clients = list(clients) 
        def new_close():
            original_close()
            for c in reversed(captured_clients):
                c.close()
        client.close = new_close

        return client
    except Exception as e:
        logger.error(
            "SSH connection failed to %s:%s as %s: %s",
            SSH_CONFIG["hostname"],
            SSH_CONFIG["port"],
            SSH_CONFIG["username"],
            e,
        )
        # Cleanup any opened clients
        for c in reversed(clients):
            try:
                c.close()
            except:
                pass
        return None


def execute_command(command):
    """Execute a general shell command on the remote server or locally"""
    if not USE_SSH:
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True)
            return result.stdout.strip(), result.stderr.strip(), result.returncode
        except Exception as e:
            return "", str(e), 1
            
    client = get_ssh_client()
    if not client:
        return "", "Failed to connect to remote server", 1
        
    try:
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode().strip()
        err = stderr.read().decode().strip()
        exit_status = stdout.channel.recv_exit_status()
        return out, err, exit_status
    except Exception as e:
        logger.error(f"Error executing command {command}: {e}")
        return "", str(e), 1
    finally:
        client.close()

def execute_podman_command(command):
    """Execute a podman command on the remote server or locally"""
    print("Executing podman command:", command)
    if not USE_SSH:
        try:
            result = subprocess.run(f"podman {command}", shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error("Podman command failed (exit %s): %s\nstderr: %s", result.returncode, command, result.stderr)
                return None, result.stderr or f"podman exited with status {result.returncode}"
            return result.stdout.strip(), None
        except Exception as e:
            logger.error("Exception during local podman command execution: \n%s \n%s", e, command)
            return None, str(e)

    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"
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
    """Execute a custom container management script on the remote server or locally"""
    full_command = f"cd {NIHOOK_FOLDER} && {CONTAINER_SCRIPTS_DIR}/{script_name} {container_folder if container_folder else ''} {additional_args}"
    
    if not USE_SSH:
        try:
            result = subprocess.run(full_command, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error("Container script failed (exit %s): %s\nstderr: %s", result.returncode, full_command, result.stderr)
                return None, result.stderr or f"script exited with status {result.returncode}"
            return result.stdout.strip(), None
        except Exception as e:
            logger.error("Exception during local container script execution: \n%s \n%s", e, full_command)
            return None, str(e)

    client = get_ssh_client()
    if not client:
        return None, "Failed to connect to remote server"

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

def curl_remote_url(method, url, headers=None, json_data=None, form_data=None, files=None, timeout=30):
    """Execute a curl command on the remote server or locally to fetch a URL.
    Returns: (response_body, status_code, error_message)
    """
    separator = "___HTTP_CODE___"
    
    cmd_parts = ["curl", "-k", "-s", "-X", method, "-w", f"'{separator}%{{http_code}}'"]
    
    if timeout:
        cmd_parts.extend(["--max-time", str(timeout)])
    
    if headers:
        for key, value in headers.items():
            safe_value = str(value).replace("'", "'\\''")
            cmd_parts.extend(["-H", f"'{key}: {safe_value}'"])
            
    if json_data:
        import json
        json_str = json.dumps(json_data).replace("'", "'\\''")
        cmd_parts.extend(["-H", "'Content-Type: application/json'"])
        cmd_parts.extend(["-d", f"'{json_str}'"])

    if form_data:
        for key, value in form_data.items():
            safe_value = str(value).replace("'", "'\\''")
            cmd_parts.extend(["-F", f"'{key}={safe_value}'"])

    file_content = None
    if files:
        for key, (filename, content, mime_type) in files.items():
            # Support one file via stdin
            cmd_parts.extend(["-F", f"'{key}=@-;filename={filename};type={mime_type}'"])
            file_content = content
            break  # Only support one file for now
        
    cmd_parts.append(f"'{url}'")
    
    full_command = " ".join(cmd_parts)
    logger.info(f"Executing curl: {method} {url}")
    
    if not USE_SSH:
        try:
            result = subprocess.run(full_command, shell=True, capture_output=True, text=True, input=file_content)
            if result.returncode != 0:
                logger.error(f"Local curl failed (exit {result.returncode}): {result.stderr}")
                return None, 0, result.stderr or f"curl exited with {result.returncode}"
            
            raw_output = result.stdout
            parts = raw_output.rsplit(separator, 1)
            
            if len(parts) == 2:
                body = parts[0]
                status_code = int(parts[1])
                return body, status_code, None
            else:
                return raw_output, 0, "Failed to parse HTTP status code"
        except Exception as e:
            return None, 0, str(e)

    client = get_ssh_client()
    if not client:
        return None, 0, "Failed to connect to remote server"

    try:
        stdin, stdout, stderr = client.exec_command(full_command)
        if file_content:
            stdin.write(file_content)
            stdin.channel.shutdown_write()
            
        out_bytes = stdout.read()
        err_bytes = stderr.read()
        raw_output = out_bytes.decode() # Don't strip yet
        error = err_bytes.decode().strip()
        
        exit_status = stdout.channel.recv_exit_status()
        
        if exit_status != 0:
            logger.error(f"Remote curl failed (exit {exit_status}): {error}")
            return None, 0, error or f"curl exited with {exit_status}"
            
        # Parse output for status code
        if separator in raw_output:
            body, status_code_str = raw_output.rsplit(separator, 1)
            try:
                status_code = int(status_code_str.strip())
            except ValueError:
                status_code = 0
                logger.warning(f"Could not parse status code from curl output: {status_code_str}")
            output = body.strip()
        else:
            status_code = 0
            output = raw_output.strip()
            logger.warning("Curl output did not contain status code separator")
            
        return output, status_code, None
    except Exception as e:
        logger.error(f"Exception during remote curl: {e}")
        return None, 0, str(e)
    finally:
        client.close()




def ensure_ssh_available():
    """Check SSH connectivity before starting the app"""
    if (not USE_SSH):
        logger.info("SSH is disabled via configuration; skipping SSH preflight check.")
        return True
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

