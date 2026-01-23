import os
import re
from typing import Optional, Dict


def parse_spinup_output(output: str, nihook_folder: str) -> Dict[str, Optional[str]]:
    """Parse the spin-up output and return podman_id, ports, folder_path, public_url, and instructions.

    Args:
        output: Full stdout/stderr text returned by the spin-up script.
        nihook_folder: Absolute path to the NIHOOK_FOLDER (e.g. /home/user/nihook).

    Returns:
        A dict with keys: 'podman_id', 'ports', 'folder_path', 'public_url', 'instructions'.
        Values are strings or None if not found.
    """
    # Podman/container id: look for a 64-char hex string on its own or within text
    podman_match = re.search(r"\b([0-9a-f]{64})\b", output)
    podman_id = podman_match.group(1) if podman_match else None

    # Ports: appear in the created folder name like 'nocodb_webhook_instance_5595_7595'
    ports_match = re.search(r"nocodb_webhook_instance_([0-9_]+)", output)
    ports = ports_match.group(1) if ports_match else None

    # folder_path: join nihook_folder with the created directory name if ports found
    folder_path = None
    if ports:
        folder_name = f"nocodb_webhook_instance_{ports}"
        # Ensure absolute path and normalized
        folder_path = os.path.normpath(
            os.path.join(nihook_folder, folder_name))

    # Extract public URL - look for patterns like "NocoDB at https://data.casus.science/7660"
    public_url = None
    url_patterns = [
        r"NocoDB at (https?://[^\s]+)",
        r"Webhook at (https?://[^\s]+)",
        r"(https?://[^\s]+/\d{4})\b"
    ]
    for pattern in url_patterns:
        url_match = re.search(pattern, output)
        if url_match:
            # TODO: parse also IP based URLs 
            public_url = url_match.group(1)
            break

    # Extract instructions - look for the entire instructions block
    instructions = None
    
    # First try to find the "Next steps" section which is the most comprehensive
    instructions_match = re.search(
        r"# Next steps.*?(?=\Z)", 
        output, 
        re.DOTALL
    )
    
    if not instructions_match:
        # If no "Next steps" found, look for the username/purpose pattern
        instructions_match = re.search(
            r"<Username>\s*<Purpose>.*?(?=\Z)", 
            output, 
            re.DOTALL
        )
    
    if not instructions_match:
        # If no structured patterns found, look for any URL patterns that might indicate instructions
        url_patterns = [
            r"NocoDB at https?://[^\s]+",
            r"Webhook at https?://[^\s]+",
            r"🟢 NocoDB and webhook servers running"
        ]
        for pattern in url_patterns:
            if re.search(pattern, output):
                # Capture from the first URL pattern to the end
                instructions_match = re.search(
                    pattern + r".*?(?=\Z)", 
                    output, 
                    re.DOTALL
                )
                if instructions_match:
                    break
    
    if instructions_match:
        instructions = instructions_match.group(0).strip()
    else:
        # If no structured instructions found, use the entire output as instructions
        instructions = output.strip()

    return {
        "podman_id": podman_id, 
        "ports": ports, 
        "folder_path": folder_path,
        "public_url": public_url,
        "instructions": instructions
    }


if __name__ == "__main__":
    # Quick manual smoke test when run directly
    import sys
    nihook = sys.argv[1] if len(sys.argv) > 1 else "."
    txt = sys.stdin.read()
    print(parse_spinup_output(txt, nihook))
