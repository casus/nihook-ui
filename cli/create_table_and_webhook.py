
import json
from pathlib import Path

from dotenv import load_dotenv
import argparse
import os
import sys

# Add the project root to sys.path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from backend.models.container import Container
from backend.services.scanner import _run_cmd
from backend.services.ssh import curl_remote_url, ensure_ssh_available, get_ssh_client


if __name__ == "__main__":
    if not ensure_ssh_available():
        print(
            "SSH check failed: please verify SSH_HOSTNAME/SSH_USERNAME credentials or key"
        )
        raise SystemExit(1)
    
    cli_dir = Path(__file__).resolve().parent
    load_dotenv(cli_dir / ".env", override=True)

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--path_to_container_folder",
        default=os.getenv("PATH_TO_CONTAINER_FOLDER")
    )

    parser.add_argument(
        "--schema_location",
        default=os.getenv("SCHEMA_LOCATION", "local")
    )

    parser.add_argument(
        "--path_to_schema",
        default=os.getenv("PATH_TO_SCHEMA")
    )

    parser.add_argument(
        "--table_name",
        default=os.getenv("TABLE_NAME")
    )

    parser.add_argument(
        "--base_id",
        default=os.getenv("BASE_ID")
    )

    parser.add_argument(
        "--new_base_name",
        default=os.getenv("NEW_BASE_NAME")
    )

    parser.add_argument(
        "--gitlab_repo_url",
        default=os.getenv("GITLAB_REPO_URL")
    )

    parser.add_argument(
        "--gitlab_api_token",
        default=os.getenv("GITLAB_API_TOKEN")
    )

    parser.add_argument(
        "--gitlab_project_token",
        default=os.getenv("GITLAB_PROJECT_TOKEN")
    )

    args = parser.parse_args()

    readme_path = f"{args.path_to_container_folder}/README.md"
    # execute cat command
    cat_cmd = f"cat {readme_path}"
    readme_content, error_msg = _run_cmd(cat_cmd, get_ssh_client())

    if not readme_content or "No such file" in error_msg:
        print(f"No README.md found in {args.path_to_container_folder} or empty. Exiting.")
        raise SystemExit(1)
    # Parse details using the static method
    nihook_folder = args.path_to_container_folder.rsplit("/", 1)[0]  # Get parent directory of the container folder
    details = Container.parse_spinup_output(readme_content, nihook_folder)

    # Prepare request to downstream container
    webhook_url = f"{details.get('webhook_host', '').rstrip('/')}/api/create-table-file"
    
    headers = {}
    if details.get('webhook_user'):
        headers["X-Webhook-User"] = details.get('webhook_user')
    if details.get('webhook_secret'):
        headers["X-Webhook-Secret"] = details.get('webhook_secret')

    
    # Form data for requests
    form_data = {
        "table_name": args.table_name,
    }
    if args.base_id:
        form_data["base_id"] = args.base_id
    if args.new_base_name:
        form_data["new_base_name"] = args.new_base_name

    # Gitlab webhook fields
    form_data["create_gitlab_webhook"] = "true"
    form_data["gitlab_repo_url"] = args.gitlab_repo_url
    form_data["gitlab_api_token"] = args.gitlab_api_token
    form_data["gitlab_project_token"] = args.gitlab_project_token
    # User requested server_ip to be webhook_host
    form_data["server_ip"] = details.get("webhook_host")
    form_data["webhook_username"] = details.get("webhook_user")
    form_data["webhook_secret"] = details.get("webhook_secret")

    # Prepare file: load file from path_to_schema
    schema_json = None
    if args.schema_location == "remote":
        cat_cmd = f"cat {args.path_to_schema}"
        schema_content, error_msg = _run_cmd(cat_cmd, get_ssh_client())
        if not schema_content or "No such file" in error_msg:
            print(f"Remote schema file not found at {args.path_to_schema} or empty. Exiting.")
            raise SystemExit(1)
        schema_json = schema_content
    else:
        if not os.path.isfile(args.path_to_schema):
            print(f"Local schema file not found at {args.path_to_schema}. Exiting.")
            raise SystemExit(1) 
        with open(args.path_to_schema, "r") as f:
            schema_json = f.read()

    files = {
        "schema": ("schema.json", schema_json, "application/json")
    }
    try:
        print(f"Sending POST request to {webhook_url}...")
        resp_text, status_code, err = curl_remote_url(
            "POST",
            webhook_url,
            headers=headers,
            form_data=form_data,
            files=files,
            timeout=30
        )
        
        if status_code >= 200 and status_code < 300:
                resp_json = json.loads(resp_text)

                # Trigger upload-all-commits
                table_id = resp_json.get("table")
                print(resp_json)
                if table_id:
                    try:
                        upload_url = f"{details.get('webhook_host', '').rstrip('/')}/webhooks/upload-all-commits"
                        custom_headers = headers.copy()
                        custom_headers["X-Webhook-Nocodbtableid"] = str(table_id)
                        print(f"Triggering upload-all-commits at {upload_url} with headers {custom_headers} and data {{'project_url': {args.gitlab_repo_url}}}")
                        
                        curl_remote_url(
                            "POST",
                            upload_url,
                            headers=custom_headers,
                            json_data={"project_url": args.gitlab_repo_url},
                            timeout=30
                        )
                        print("Triggered upload-all-commits successfully.")
                    except Exception as e:
                        print(f"Failed to trigger upload-all-commits: {e}")
        else:
            print(f"Request failed with status code {status_code}")
            print(f"Response: {resp_text}")
            if err:
                print(f"Curl error: {err}")
    except Exception as e:
        print(f"Failed to contact container: {e}")


