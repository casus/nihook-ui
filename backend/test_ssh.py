#!/usr/bin/env python3
"""Quick SSH connectivity test"""

import os
import paramiko
from dotenv import load_dotenv

load_dotenv()

USE_SSH = os.getenv('USE_SSH', 'True').lower() in ('true', '1', 't')

if not USE_SSH:
    print("USE_SSH is set to False in environment. Skipping SSH test.")
    exit(0)

SSH_CONFIG = {
    'hostname': os.getenv('SSH_HOSTNAME', 'localhost'),
    'port': int(os.getenv('SSH_PORT', 22)),
    'username': os.getenv('SSH_USERNAME', 'root'),
    'password': os.getenv('SSH_PASSWORD', ''),
    'key_filename': os.getenv('SSH_KEY_FILE', None)
}

print(
    f"Testing SSH connection to {SSH_CONFIG['hostname']}:{SSH_CONFIG['port']}...")
print(f"Username: {SSH_CONFIG['username']}")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    if SSH_CONFIG['key_filename']:
        print(f"Using key file: {SSH_CONFIG['key_filename']}")
        client.connect(
            hostname=SSH_CONFIG['hostname'],
            port=SSH_CONFIG['port'],
            username=SSH_CONFIG['username'],
            key_filename=SSH_CONFIG['key_filename'],
            timeout=5
        )
    else:
        print("Using password authentication")
        client.connect(
            hostname=SSH_CONFIG['hostname'],
            port=SSH_CONFIG['port'],
            username=SSH_CONFIG['username'],
            password=SSH_CONFIG['password'],
            timeout=5
        )

    print("✓ SSH connection successful!")
    client.close()
except Exception as e:
    print(f"✗ SSH connection failed: {e}")
    exit(1)
