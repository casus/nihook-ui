import os
import re
import logging
import subprocess
from sqlalchemy import select
from backend.models import Container, User 
from backend.extensions import db
from backend.config import Config, USE_SSH
from backend.services.ssh import get_ssh_client

logger = logging.getLogger(__name__)

def _run_cmd(cmd, client=None):
    if not USE_SSH:
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            return result.stdout.strip(), result.stderr.strip()
        except Exception as e:
            return "", str(e)
    else:
        if not client:
            return "", "No SSH client"
        stdin, stdout, stderr = client.exec_command(cmd)
        return stdout.read().decode().strip(), stderr.read().decode().strip()

def scan_and_import_containers():
    """
    Scans the NIHOOK_FOLDER for container directories and imports them if not already in DB.
    Pattern: nocodb_webhook_instance_{ports}
    Checks for README.md inside to parse details.
    Assigns new containers to the first admin user found.
    """
    nihook_folder = Config.NIHOOK_FOLDER
    if not nihook_folder:
        logger.warning("NIHOOK_FOLDER not configured, skipping scan.")
        return

    # Check for admin user to assign ownership
    # We need to run inside an app context, assumed caller provides it.
    logger.info(f"Scanning {nihook_folder} for existing containers...")
    
    client = None
    if USE_SSH:
        client = get_ssh_client()
        if not client:
            logger.error("Failed to connect via SSH for scanning containers.")
            return

    try:
        # List directories in NIHOOK_FOLDER
        # Use find to locate directories matching pattern
        # Be careful about injection if nihook_folder comes from untrusted source (config should be trusted)
        cmd = f"find {nihook_folder} -maxdepth 1 -type d -name 'nocodb_webhook_instance_*'"
        output, _ = _run_cmd(cmd, client)
        
        if not output:
             logger.info("No matching container folders found in NIHOOK_FOLDER.")
             return

        dirs = output.splitlines()
        
        for dir_path in dirs:
            dir_path = dir_path.strip()
            dir_name = os.path.basename(dir_path)
            
            # Regex to verify pattern and extract potential ports if needed
            # Match directory pattern
            # nocodb_webhook_instance_5766_7766
            # ports are usually separated by underscores in folder name
            match = re.search(r"nocodb_webhook_instance_(\d+)_(\d+)", dir_name)
            
            if not match:
                continue

            nocodb_port = match.group(1)
            webhook_port = match.group(2)
            
            # Check if container with this folder path already exists
            stmt_container = select(Container).where(Container.folder_path == dir_path)
            existing = db.session.execute(stmt_container).scalars().first()
            
            if existing: # This check is flawed if we haven't scanned fully yet, but it's ok for now.
                # Actually, check by name too?
                # If path exists, we skip importing.
                continue 

            logger.info(f"Found un-tracked container folder: {dir_name}. checking for README.md")
            
            # Check for README.md
            readme_path = f"{dir_path}/README.md"
            # execute cat command
            cat_cmd = f"cat {readme_path}"
            readme_content, error_msg = _run_cmd(cat_cmd, client)

            if not readme_content or "No such file" in error_msg:
                logger.warning(f"No README.md found in {dir_path} or empty. Skipping.")
                continue

            # Parse details using the static method
            details = Container.parse_spinup_output(readme_content, nihook_folder)

            # If inside details we don't have the podman_id, try to fetch it
            if not details.get("podman_id"):
                 logger.info(f"Podman ID missing in README, attempting to resolve by port {nocodb_port}")
                 # Get all containers and their ports
                 # Command: podman ps -a --format "{{.ID}} {{.Ports}}"
                 ps_cmd = 'podman ps -a --format "{{.ID}} {{.Ports}}"'
                 ps_output, _ = _run_cmd(ps_cmd, client)
                 
                 found_id = None
                 if ps_output:
                     for line in ps_output.splitlines():
                         parts = line.split(maxsplit=1)
                         if len(parts) < 2: continue
                         c_id, c_ports = parts[0], parts[1]
                         # Check if our specific port is in the port string
                         # c_ports looks like "0.0.0.0:8080->80/tcp, 0.0.0.0:9090->90/tcp"
                         if f":{nocodb_port}-" in c_ports or f":{nocodb_port}/" in c_ports or f":{nocodb_port}->" in c_ports:
                              found_id = c_id
                              break
                 
                 if found_id:
                     details["podman_id"] = found_id
                     logger.info(f"Resolved Podman ID: {found_id}")
                 else:
                     logger.warning(f"Could not resolve Podman ID for port {nocodb_port}")

            # Create new container
            new_container = Container(
                name=dir_name,
                description="Imported from existing folder",
                status="stopped" # Default, will be updated by regular status check
            )
            
            new_container.folder_path = dir_path
            new_container.update_with_spinup_details(details)
            
            db.session.add(new_container)
            logger.info(f"Imported container: {new_container.name}")

        db.session.commit()
        logger.info("Container scan complete.")

    except Exception as e:
        logger.error(f"Error during container scan: {e}")
        db.session.rollback()
    finally:
        if client:
            client.close()
